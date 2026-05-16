package textutil

import (
	"html"
	"strings"
)

// NormalizeDisplayName cleans a user-facing name field (友链名 / 站名 /
// 评论者昵称 等)：解码 HTML 实体并去首尾空白。
//
// 之前若干导入路径直接把 RSS / 远端 API 拿到的字符串原样写入 DB，结果
// 像 "Kevin&#039;s" / "Foo &amp; Bar" 这样的串就被前台 React 当文本
// 输出时原样显示。任何 name 类字段在写入前过一遍这个函数即可避免。
//
// 不会破坏正常字符串 —— 无实体的输入 == html.UnescapeString 的返回。
func NormalizeDisplayName(s string) string {
	return strings.TrimSpace(html.UnescapeString(s))
}
