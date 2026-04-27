package textutil

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	htmlCodeBlockRE = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<pre[^>]*>.*?</pre>|<code[^>]*>.*?</code>`)
	htmlTagRE       = regexp.MustCompile(`(?is)<[^>]+>`)
	imageRE         = regexp.MustCompile(`!\[[^\]]*\]\([^)]+\)`)
	inlineCodeRE    = regexp.MustCompile("`[^`\n]+`")
	urlRE           = regexp.MustCompile(`https?://\S+`)
)

// ContentWordCount returns the public article word count used by posts,
// archive totals, and dashboard totals. It counts readable article text,
// not Markdown syntax, image URLs, or code samples.
func ContentWordCount(content string) int {
	text := removeFencedCodeBlocks(content)
	text = htmlCodeBlockRE.ReplaceAllString(text, "")
	text = htmlTagRE.ReplaceAllString(text, "")
	text = imageRE.ReplaceAllString(text, "")
	text = replaceMarkdownLinks(text)
	text = inlineCodeRE.ReplaceAllString(text, "")
	text = urlRE.ReplaceAllString(text, "")
	text = strings.NewReplacer(
		"**", "",
		"~~", "",
		"__", "",
		"*", "",
		"_", "",
		"#", "",
		">", "",
		"`", "",
		"|", "",
	).Replace(text)

	count := 0
	for _, r := range text {
		if !unicode.IsSpace(r) {
			count++
		}
	}
	return count
}

func removeFencedCodeBlocks(content string) string {
	lines := strings.Split(content, "\n")
	clean := make([]string, 0, len(lines))
	inFence := false
	fence := ""

	for _, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			marker := trimmed[:3]
			if !inFence {
				inFence = true
				fence = marker
			} else if marker == fence {
				inFence = false
				fence = ""
			}
			continue
		}
		if inFence {
			continue
		}
		clean = append(clean, line)
	}

	return strings.Join(clean, "\n")
}

func replaceMarkdownLinks(text string) string {
	for {
		linkStart := strings.Index(text, "](")
		if linkStart == -1 {
			return text
		}
		open := strings.LastIndex(text[:linkStart], "[")
		closeRel := strings.Index(text[linkStart:], ")")
		if open == -1 || closeRel == -1 {
			return text
		}
		close := linkStart + closeRel
		label := text[open+1 : linkStart]
		text = text[:open] + label + text[close+1:]
	}
}
