package handler

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
)

// agentToolDefs is the OpenAI-compatible function calling schema sent to the AI.
var agentToolDefs = buildAgentTools()

func buildAgentTools() []map[string]interface{} {
	str := func(desc string) map[string]interface{} {
		return map[string]interface{}{"type": "string", "description": desc}
	}
	num := func(desc string) map[string]interface{} {
		return map[string]interface{}{"type": "integer", "description": desc}
	}
	def := func(name, desc string, props map[string]interface{}, required []string) map[string]interface{} {
		if props == nil {
			props = map[string]interface{}{}
		}
		params := map[string]interface{}{"type": "object", "properties": props}
		if len(required) > 0 {
			params["required"] = required
		}
		return map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        name,
				"description": desc,
				"parameters":  params,
			},
		}
	}

	return []map[string]interface{}{
		def("query_database",
			"对数据库执行只读 SELECT 查询，获取任意数据（文章、评论、用户、选项等）",
			map[string]interface{}{"sql": str("完整的 SELECT SQL 语句")},
			[]string{"sql"}),

		def("get_site_stats",
			"获取站点核心统计（文章数、评论数、浏览量、待审核等）",
			nil, nil),

		def("list_pending_comments",
			"获取待审核评论列表",
			map[string]interface{}{"limit": num("返回数量，默认10，最大50")},
			nil),

		def("approve_comment",
			"批准/通过一条评论",
			map[string]interface{}{"comment_id": num("评论ID")},
			[]string{"comment_id"}),

		def("reject_comment",
			"拒绝评论并移至回收站",
			map[string]interface{}{"comment_id": num("评论ID")},
			[]string{"comment_id"}),

		def("add_link",
			"添加友情链接",
			map[string]interface{}{
				"name":        str("站点名称"),
				"url":         str("站点URL"),
				"description": str("简介（可选）"),
				"logo":        str("Logo图片URL（可选）"),
				"group_name":  str("分组名，默认 default"),
			},
			[]string{"name", "url"}),

		def("list_links",
			"获取全部友情链接列表",
			nil, nil),

		def("update_link",
			"更新友情链接信息",
			map[string]interface{}{
				"id":          num("链接ID"),
				"name":        str("新名称（可选）"),
				"url":         str("新URL（可选）"),
				"description": str("新简介（可选）"),
				"logo":        str("新Logo（可选）"),
				"group_name":  str("新分组（可选）"),
			},
			[]string{"id"}),

		def("delete_link",
			"删除友情链接",
			map[string]interface{}{"id": num("链接ID")},
			[]string{"id"}),

		def("list_posts",
			"获取文章列表",
			map[string]interface{}{
				"status": str("状态筛选：publish/draft/trash/all，默认all"),
				"limit":  num("返回数量，默认20"),
			},
			nil),

		def("update_post_status",
			"修改文章状态（发布、下线、移入回收站）",
			map[string]interface{}{
				"post_id": num("文章ID"),
				"status":  str("新状态：publish/draft/trash"),
			},
			[]string{"post_id", "status"}),

		def("get_options",
			"读取站点配置项（含存储、邮件、Telegram、AI等所有配置）",
			map[string]interface{}{
				"keys": map[string]interface{}{
					"type":        "array",
					"items":       map[string]interface{}{"type": "string"},
					"description": "要读取的 key 列表，不传则返回所有配置",
				},
			},
			nil),

		def("update_options",
			"更新站点配置（S3/R2存储、邮件、Telegram、外观、SEO等所有配置均可）",
			map[string]interface{}{
				"options": map[string]interface{}{
					"type":                 "object",
					"description":          "key-value 配置项对象",
					"additionalProperties": map[string]interface{}{"type": "string"},
				},
			},
			[]string{"options"}),

		def("create_backup",
			"创建站点完整数据备份（数据库SQL导出+上传文件打包）",
			nil, nil),

		def("list_backups",
			"列出所有可用备份文件",
			nil, nil),
	}
}

// toolLabel returns a short human-readable action description for SSE display.
func toolLabel(name string, args map[string]interface{}) string {
	switch name {
	case "query_database":
		sql, _ := args["sql"].(string)
		if len([]rune(sql)) > 60 {
			sql = string([]rune(sql)[:60]) + "..."
		}
		return "查询数据库：" + sql
	case "get_site_stats":
		return "获取站点统计"
	case "list_pending_comments":
		return "获取待审核评论"
	case "approve_comment":
		return fmt.Sprintf("通过评论 #%v", args["comment_id"])
	case "reject_comment":
		return fmt.Sprintf("拒绝评论 #%v", args["comment_id"])
	case "add_link":
		return fmt.Sprintf("添加友链：%v", args["name"])
	case "list_links":
		return "获取友情链接列表"
	case "update_link":
		return fmt.Sprintf("更新友链 #%v", args["id"])
	case "delete_link":
		return fmt.Sprintf("删除友链 #%v", args["id"])
	case "list_posts":
		return "获取文章列表"
	case "update_post_status":
		return fmt.Sprintf("修改文章 #%v → %v", args["post_id"], args["status"])
	case "get_options":
		return "读取站点配置"
	case "update_options":
		if opts, ok := args["options"].(map[string]interface{}); ok {
			keys := make([]string, 0, len(opts))
			for k := range opts {
				keys = append(keys, k)
			}
			return "更新配置：" + strings.Join(keys, ", ")
		}
		return "更新站点配置"
	case "create_backup":
		return "创建数据备份"
	case "list_backups":
		return "获取备份列表"
	default:
		return name
	}
}

// executeAgentTool runs a tool and returns the result as a string.
func executeAgentTool(name string, args map[string]interface{}) string {
	t := config.T

	switch name {

	case "query_database":
		sql, _ := args["sql"].(string)
		if sql == "" {
			return "错误：sql 不能为空"
		}
		q := strings.TrimSpace(strings.ToUpper(sql))
		if !strings.HasPrefix(q, "SELECT") {
			return "错误：仅允许 SELECT 查询"
		}
		for _, kw := range []string{"DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "EXEC", "GRANT"} {
			if strings.Contains(q, kw) {
				return "错误：不允许包含操作 " + kw
			}
		}
		rows, err := config.DB.Queryx(sql + " LIMIT 200")
		if err != nil {
			return "查询错误：" + err.Error()
		}
		defer rows.Close()
		var results []map[string]interface{}
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			for k, v := range row {
				if b, ok := v.([]byte); ok {
					row[k] = string(b)
				}
			}
			results = append(results, row)
		}
		if len(results) == 0 {
			return "查询结果为空"
		}
		b, _ := json.Marshal(results)
		return string(b)

	case "get_site_stats":
		var postCount, commentCount, pendingCount, viewCount int
		config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+t("posts")+" WHERE type='post' AND status='publish'")
		config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+t("comments")+" WHERE status='approved'")
		config.DB.Get(&pendingCount, "SELECT COUNT(*) FROM "+t("comments")+" WHERE status='pending'")
		config.DB.Get(&viewCount, "SELECT COALESCE(SUM(view_count),0) FROM "+t("posts"))
		return fmt.Sprintf("已发布文章：%d篇\n待审核评论：%d条\n已通过评论：%d条\n总浏览量：%d次\n站点名称：%s",
			postCount, pendingCount, commentCount, viewCount, model.GetOption("site_title"))

	case "list_pending_comments":
		limit := 10
		if l, ok := args["limit"].(float64); ok {
			limit = int(l)
		}
		if limit > 50 {
			limit = 50
		}
		type CRow struct {
			ID      int    `db:"id" json:"id"`
			Author  string `db:"author_name" json:"author"`
			Email   string `db:"author_email" json:"email"`
			URL     string `db:"author_url" json:"url"`
			Content string `db:"content" json:"content"`
			IP      string `db:"author_ip" json:"ip"`
			PostID  int    `db:"post_id" json:"post_id"`
		}
		var rows []CRow
		config.DB.Select(&rows, fmt.Sprintf(
			"SELECT id,author_name,COALESCE(author_email,'') as author_email,COALESCE(author_url,'') as author_url,content,COALESCE(author_ip,'') as author_ip,post_id FROM %s WHERE status='pending' ORDER BY created_at DESC LIMIT $1",
			t("comments")), limit)
		if len(rows) == 0 {
			return "暂无待审核评论"
		}
		b, _ := json.Marshal(rows)
		return string(b)

	case "approve_comment":
		id := agentToInt(args["comment_id"])
		var old string
		config.DB.Get(&old, "SELECT status FROM "+t("comments")+" WHERE id=$1", id)
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET status='approved' WHERE id=$1", t("comments")), id)
		if old == "pending" || old == "spam" {
			var postID int
			config.DB.Get(&postID, "SELECT post_id FROM "+t("comments")+" WHERE id=$1", id)
			if postID > 0 {
				config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count=comment_count+1 WHERE id=$1", t("posts")), postID)
			}
		}
		return fmt.Sprintf("评论 #%d 已批准", id)

	case "reject_comment":
		id := agentToInt(args["comment_id"])
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET status='trash' WHERE id=$1", t("comments")), id)
		return fmt.Sprintf("评论 #%d 已移至回收站", id)

	case "add_link":
		name, _ := args["name"].(string)
		url, _ := args["url"].(string)
		if name == "" || url == "" {
			return "错误：name 和 url 为必填"
		}
		desc, _ := args["description"].(string)
		logo, _ := args["logo"].(string)
		group, _ := args["group_name"].(string)
		if group == "" {
			group = "default"
		}
		now := time.Now().Unix()
		var id int
		err := config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (name,url,description,logo,group_name,order_num,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,0,1,$6,$7) RETURNING id",
			t("links")), name, url, desc, logo, group, now, now).Scan(&id)
		if err != nil {
			return "添加失败：" + err.Error()
		}
		return fmt.Sprintf("友链「%s」已添加，ID: %d", name, id)

	case "list_links":
		type LRow struct {
			ID    int    `db:"id" json:"id"`
			Name  string `db:"name" json:"name"`
			URL   string `db:"url" json:"url"`
			Desc  string `db:"description" json:"description"`
			Group string `db:"group_name" json:"group"`
			Logo  string `db:"logo" json:"logo"`
		}
		var rows []LRow
		config.DB.Select(&rows, fmt.Sprintf(
			"SELECT id,name,url,COALESCE(description,'') as description,group_name,COALESCE(logo,'') as logo FROM %s ORDER BY group_name,order_num",
			t("links")))
		b, _ := json.Marshal(rows)
		return string(b)

	case "update_link":
		id := agentToInt(args["id"])
		sets := []string{"updated_at=$1"}
		vals := []interface{}{time.Now().Unix()}
		i := 2
		for _, f := range []string{"name", "url", "description", "logo", "group_name"} {
			if v, ok := args[f].(string); ok && v != "" {
				sets = append(sets, fmt.Sprintf("%s=$%d", f, i))
				vals = append(vals, v)
				i++
			}
		}
		vals = append(vals, id)
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET %s WHERE id=$%d", t("links"), strings.Join(sets, ","), i), vals...)
		return fmt.Sprintf("友链 #%d 已更新", id)

	case "delete_link":
		id := agentToInt(args["id"])
		config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE id=$1", t("links")), id)
		return fmt.Sprintf("友链 #%d 已删除", id)

	case "list_posts":
		status, _ := args["status"].(string)
		limit := 20
		if l, ok := args["limit"].(float64); ok {
			limit = int(l)
		}
		where := "WHERE type='post'"
		if status != "" && status != "all" {
			safeStatus := strings.ReplaceAll(status, "'", "")
			where += " AND status='" + safeStatus + "'"
		}
		type PRow struct {
			ID       int    `db:"id" json:"id"`
			Title    string `db:"title" json:"title"`
			Slug     string `db:"slug" json:"slug"`
			Status   string `db:"status" json:"status"`
			Views    int    `db:"view_count" json:"views"`
			Comments int    `db:"comment_count" json:"comments"`
		}
		var rows []PRow
		config.DB.Select(&rows, fmt.Sprintf(
			"SELECT id,title,slug,status,view_count,comment_count FROM %s %s ORDER BY created_at DESC LIMIT $1",
			t("posts"), where), limit)
		b, _ := json.Marshal(rows)
		return string(b)

	case "update_post_status":
		id := agentToInt(args["post_id"])
		status, _ := args["status"].(string)
		allowed := map[string]bool{"publish": true, "draft": true, "trash": true}
		if !allowed[status] {
			return "错误：status 只能是 publish/draft/trash"
		}
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET status=$1,updated_at=$2 WHERE id=$3 AND type='post'", t("posts")),
			status, time.Now().Unix(), id)
		return fmt.Sprintf("文章 #%d 状态已更新为 %s", id, status)

	case "get_options":
		var keys []string
		if ks, ok := args["keys"].([]interface{}); ok {
			for _, k := range ks {
				keys = append(keys, fmt.Sprintf("%v", k))
			}
		}
		opts := map[string]string{}
		if len(keys) > 0 {
			for _, k := range keys {
				opts[k] = model.GetOption(k)
			}
		} else {
			rows, err := config.DB.Queryx("SELECT name,value FROM " + t("options") + " ORDER BY name")
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var k, v string
					rows.Scan(&k, &v)
					opts[k] = v
				}
			}
		}
		b, _ := json.Marshal(opts)
		return string(b)

	case "update_options":
		optsRaw, ok := args["options"].(map[string]interface{})
		if !ok {
			return "错误：options 必须为对象"
		}
		now := time.Now().Unix()
		updated := make([]string, 0, len(optsRaw))
		for k, v := range optsRaw {
			val := fmt.Sprintf("%v", v)
			config.DB.Exec(fmt.Sprintf(
				"INSERT INTO %s (name,value,created_at,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO UPDATE SET value=$2,updated_at=$4",
				t("options")), k, val, now, now)
			updated = append(updated, k)
		}
		return "已更新配置项：" + strings.Join(updated, ", ")

	case "create_backup":
		return agentCreateBackup()

	case "list_backups":
		entries, err := os.ReadDir("backups")
		if err != nil {
			return "备份目录不存在或为空"
		}
		var files []string
		for _, e := range entries {
			if !e.IsDir() {
				info, _ := e.Info()
				size := ""
				if info != nil {
					size = fmt.Sprintf(" (%dKB)", info.Size()/1024)
				}
				files = append(files, e.Name()+size)
			}
		}
		if len(files) == 0 {
			return "暂无备份文件"
		}
		return strings.Join(files, "\n")

	default:
		return "未知工具：" + name
	}
}

func agentCreateBackup() string {
	backupDir := "backups"
	os.MkdirAll(backupDir, 0755)

	ts := time.Now().Format("20060102-150405")
	dumpPath := filepath.Join(backupDir, "db-"+ts+".sql")
	zipPath := filepath.Join(backupDir, fmt.Sprintf("utterlog-backup-%s.zip", ts))

	dumpCmd := exec.Command("pg_dump",
		"-h", config.C.DBHost, "-p", config.C.DBPort,
		"-U", config.C.DBUser, "-d", config.C.DBName,
		"--no-owner", "--no-acl", "-f", dumpPath)
	dumpCmd.Env = append(os.Environ(), "PGPASSWORD="+config.C.DBPass)
	if err := dumpCmd.Run(); err != nil {
		return "数据库导出失败：" + err.Error()
	}

	zipFile, err := os.Create(zipPath)
	if err != nil {
		os.Remove(dumpPath)
		return "创建备份文件失败：" + err.Error()
	}

	w := zip.NewWriter(zipFile)
	addFileToZip(w, dumpPath, "database.sql")

	uploadsDir := "public/uploads"
	filepath.Walk(uploadsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		relPath, _ := filepath.Rel("public", path)
		addFileToZip(w, path, relPath)
		return nil
	})

	w.Close()
	zipFile.Close()
	os.Remove(dumpPath)

	return fmt.Sprintf("备份已创建：%s", filepath.Base(zipPath))
}

func agentToInt(v interface{}) int {
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	case int64:
		return int(val)
	default:
		return 0
	}
}
