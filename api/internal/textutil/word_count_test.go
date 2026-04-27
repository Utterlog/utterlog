package textutil

import "testing"

func TestContentWordCountExcludesCodeAndMarkdown(t *testing.T) {
	content := "# 标题\n\n正文 **加粗** [链接](https://example.com)\n![图](https://example.com/a.png)\n\n```go\nfmt.Println(\"代码\")\n```\n\n`inlineCode()` 结束"
	got := ContentWordCount(content)
	want := 10
	if got != want {
		t.Fatalf("ContentWordCount() = %d, want %d", got, want)
	}
}

func TestContentWordCountStripsHTMLCodeBlocks(t *testing.T) {
	content := `<p>你好 <strong>世界</strong></p><pre>fmt.Println("代码")</pre><code>x := 1</code>`
	got := ContentWordCount(content)
	want := 4
	if got != want {
		t.Fatalf("ContentWordCount() = %d, want %d", got, want)
	}
}
