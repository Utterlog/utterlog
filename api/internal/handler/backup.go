package handler

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Create backup (DB dump + uploads + runtime content)
func CreateBackup(c *gin.Context) {
	backupDir := "backups"
	os.MkdirAll(backupDir, 0755)

	ts := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("utterlog-backup-%s.zip", ts)
	zipPath := filepath.Join(backupDir, filename)

	// 1. Dump database
	dbDumpPath := filepath.Join(backupDir, "db-"+ts+".sql")
	dumpCmd := exec.Command("pg_dump",
		"-h", config.C.DBHost,
		"-p", config.C.DBPort,
		"-U", config.C.DBUser,
		"-d", config.C.DBName,
		"--no-owner", "--no-acl",
		"-f", dbDumpPath,
	)
	dumpCmd.Env = append(os.Environ(), "PGPASSWORD="+config.C.DBPass)
	if err := dumpCmd.Run(); err != nil {
		util.Error(c, 500, "DUMP_ERROR", "数据库导出失败: "+err.Error())
		return
	}

	// 2. Create zip with DB dump + uploads + runtime content
	zipFile, err := os.Create(zipPath)
	if err != nil {
		util.Error(c, 500, "ZIP_ERROR", "创建备份文件失败")
		return
	}
	defer zipFile.Close()

	w := zip.NewWriter(zipFile)

	// Add DB dump
	addFileToZip(w, dbDumpPath, "database.sql")

	// Add uploads and runtime extension content.
	addDirToZip(w, "public/uploads", "uploads")
	addDirToZip(w, "content", "content")

	w.Close()
	os.Remove(dbDumpPath) // cleanup dump file

	// Get file size
	fi, _ := os.Stat(zipPath)
	size := int64(0)
	if fi != nil {
		size = fi.Size()
	}

	util.Success(c, gin.H{
		"filename": filename,
		"path":     zipPath,
		"size":     size,
		"url":      strings.TrimRight(config.PublicBaseURL(), "/") + "/" + zipPath,
		"created":  ts,
	})
}

// List existing backups
func ListBackups(c *gin.Context) {
	backupDir := "backups"
	os.MkdirAll(backupDir, 0755)

	var backups []gin.H
	filepath.Walk(backupDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || filepath.Ext(path) != ".zip" {
			return nil
		}
		backups = append(backups, gin.H{
			"filename": info.Name(),
			"size":     info.Size(),
			"created":  info.ModTime().Format("2006-01-02 15:04:05"),
			"url":      strings.TrimRight(config.PublicBaseURL(), "/") + "/" + path,
		})
		return nil
	})
	if backups == nil {
		backups = []gin.H{}
	}
	util.Success(c, backups)
}

// Download backup
func DownloadBackup(c *gin.Context) {
	filename := c.Param("filename")
	path := filepath.Join("backups", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		util.NotFound(c, "备份文件")
		return
	}
	c.File(path)
}

// Delete backup
func DeleteBackup(c *gin.Context) {
	filename := c.Param("filename")
	path := filepath.Join("backups", filename)
	os.Remove(path)
	util.Success(c, nil)
}

// Import backup (restore DB + uploads + runtime content)
func ImportBackup(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		util.BadRequest(c, "请上传备份文件")
		return
	}
	defer file.Close()

	// Save uploaded zip
	tmpPath := filepath.Join("backups", "import-"+header.Filename)
	dst, err := os.Create(tmpPath)
	if err != nil {
		util.Error(c, 500, "SAVE_ERROR", "保存失败")
		return
	}
	io.Copy(dst, file)
	dst.Close()

	// Extract zip
	extractDir := filepath.Join("backups", "import-tmp")
	os.MkdirAll(extractDir, 0755)
	defer os.RemoveAll(extractDir)

	r, err := zip.OpenReader(tmpPath)
	if err != nil {
		util.Error(c, 400, "ZIP_ERROR", "无效的备份文件")
		return
	}
	defer r.Close()

	dbFile := ""
	for _, f := range r.File {
		cleanName := filepath.Clean(f.Name)
		if cleanName == "." || filepath.IsAbs(cleanName) || strings.HasPrefix(cleanName, ".."+string(os.PathSeparator)) {
			continue
		}
		outPath := filepath.Join(extractDir, cleanName)
		if f.FileInfo().IsDir() {
			os.MkdirAll(outPath, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(outPath), 0755)
		outFile, _ := os.Create(outPath)
		rc, _ := f.Open()
		io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()

		zipName := filepath.ToSlash(cleanName)
		if zipName == "database.sql" {
			dbFile = outPath
		}

		// Restore uploads and runtime content.
		if strings.HasPrefix(zipName, "uploads/") {
			restoreBackupFile(outPath, filepath.Join("public", filepath.FromSlash(zipName)))
		}
		if strings.HasPrefix(zipName, "content/") {
			restoreBackupFile(outPath, filepath.FromSlash(zipName))
		}
	}

	// Restore database
	if dbFile != "" {
		restoreCmd := exec.Command("psql",
			"-h", config.C.DBHost,
			"-p", config.C.DBPort,
			"-U", config.C.DBUser,
			"-d", config.C.DBName,
			"-f", dbFile,
		)
		restoreCmd.Env = append(os.Environ(), "PGPASSWORD="+config.C.DBPass)
		if err := restoreCmd.Run(); err != nil {
			util.Error(c, 500, "RESTORE_ERROR", "数据库恢复失败: "+err.Error())
			return
		}
	}

	os.Remove(tmpPath) // cleanup import file

	fileCount := 0
	for _, f := range r.File {
		if !f.FileInfo().IsDir() {
			fileCount++
		}
	}

	util.Success(c, gin.H{
		"restored":    true,
		"db_restored": dbFile != "",
		"files":       fileCount,
	})
}

// Backup stats
func BackupStats(c *gin.Context) {
	// DB size
	var dbSize string
	config.DB.Get(&dbSize, "SELECT pg_size_pretty(pg_database_size($1))", config.C.DBName)

	uploadsSize := dirSize("public/uploads")
	contentSize := dirSize("content")

	// Backup count
	backupCount := 0
	filepath.Walk("backups", func(_ string, info os.FileInfo, _ error) error {
		if info != nil && !info.IsDir() && filepath.Ext(info.Name()) == ".zip" {
			backupCount++
		}
		return nil
	})

	util.Success(c, gin.H{
		"db_size":       dbSize,
		"uploads_size":  formatBytes(uploadsSize),
		"uploads_bytes": uploadsSize,
		"content_size":  formatBytes(contentSize),
		"content_bytes": contentSize,
		"backup_count":  backupCount,
	})
}

func addDirToZip(w *zip.Writer, dirPath, zipRoot string) {
	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		relPath, err := filepath.Rel(dirPath, path)
		if err != nil {
			return nil
		}
		addFileToZip(w, path, filepath.ToSlash(filepath.Join(zipRoot, relPath)))
		return nil
	})
}

func addFileToZip(w *zip.Writer, filePath, zipPath string) {
	f, err := os.Open(filePath)
	if err != nil {
		return
	}
	defer f.Close()
	info, _ := f.Stat()
	header, _ := zip.FileInfoHeader(info)
	header.Name = zipPath
	header.Method = zip.Deflate
	writer, _ := w.CreateHeader(header)
	io.Copy(writer, f)
}

func restoreBackupFile(srcPath, destPath string) {
	os.MkdirAll(filepath.Dir(destPath), 0755)
	src, err := os.Open(srcPath)
	if err != nil {
		return
	}
	defer src.Close()
	dst, err := os.Create(destPath)
	if err != nil {
		return
	}
	defer dst.Close()
	io.Copy(dst, src)
}

func dirSize(dirPath string) int64 {
	size := int64(0)
	filepath.Walk(dirPath, func(_ string, info os.FileInfo, _ error) error {
		if info != nil && !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func formatBytes(b int64) string {
	if b < 1024 {
		return strconv.FormatInt(b, 10) + " B"
	}
	if b < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(b)/1024)
	}
	if b < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(b)/1024/1024)
	}
	return fmt.Sprintf("%.1f GB", float64(b)/1024/1024/1024)
}
