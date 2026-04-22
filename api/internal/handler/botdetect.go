package handler

import (
	"regexp"
	"strings"
)

// Bot / automation detection — Umami-style. Every path that writes
// a row into access_logs or marks someone as "online" runs its UA
// through IsBot first so crawlers, monitoring probes, and scripting
// libraries never show up as visitors.
//
// Substring match is deliberate: any UA containing e.g. "bot" or
// "crawler" is overwhelmingly a bot in practice, and occasional
// false-negatives (weird UA strings that happen to contain "bot" as
// a random substring) are much better than the opposite.

var botSubstrings = []string{
	// Generic crawler signals
	"bot", "crawl", "spider", "scraper", "fetcher",
	// Headless / automation frameworks
	"headless", "phantomjs", "puppeteer", "playwright", "selenium",
	"lighthouse", "chrome-lighthouse", "pagespeed",
	// HTTP libraries used by scripts
	"curl/", "wget/", "python-", "python/", "go-http", "okhttp",
	"java/", "ruby", "postman", "insomnia", "httpie", "axios/",
	"libwww", "urllib", "requests/", "aiohttp",
	// Archive / prerender
	"archive.org", "wayback", "prerender",
	// SEO / marketing crawlers (no generic "bot" match required)
	"ahrefs", "semrush", "mj12", "dotbot", "blexbot",
	// Chinese SEO / search
	"yandex", "baidu", "sogou", "360spider", "bytespider", "haosouspider",
	// Social preview fetchers
	"facebookexternalhit", "facebookcatalog", "slack-imgproxy",
	"twitterbot", "linkedinbot", "whatsapp", "telegrambot", "discordbot",
	"skypeuripreview",
	// Uptime / monitoring
	"uptimerobot", "pingdom", "statuscake", "gtmetrix", "newrelic",
	"nagios", "zabbix", "datadog", "monitis", "site24x7",
	// Benchmarking
	"apachebench", "ab/", "siege", "wrk", "jmeter",
	// AI crawlers
	"gptbot", "chatgpt", "claude-web", "claudebot", "anthropic",
	"google-extended", "perplexity", "bytespider", "ccbot",
	"google-inspectiontool", "applebot",
	// Content parsers (arriving at /feed counts, but still not visitors)
	"feedparser", "feedly", "inoreader", "newsblur", "tiny tiny rss",
}

// Fast path: if the UA is empty or impossibly short, it's not a
// browser. Real browsers are 70+ chars; anything under ~15 is either
// a curl default, empty, or a deliberately-stripped sniffer.
const minRealUALength = 15

// Secondary pattern: many custom crawlers identify via "Mozilla/5.0
// (compatible; FooBot/1.0; +http://...)" — if we see "compatible;" AND
// a URL, flag it.
var compatibleURLBot = regexp.MustCompile(`compatible;.*https?://`)

func IsBot(ua string) bool {
	if ua == "" {
		return true
	}
	if len(ua) < minRealUALength {
		return true
	}
	low := strings.ToLower(ua)
	for _, p := range botSubstrings {
		if strings.Contains(low, p) {
			return true
		}
	}
	if compatibleURLBot.MatchString(low) {
		return true
	}
	return false
}

// BotSQLPattern returns a PostgreSQL ILIKE clause that approximates
// IsBot for retroactive cleanup queries. Not as thorough as the Go
// function — compatibleURLBot and the minRealUALength check can't be
// expressed cleanly in SQL — but catches the vast majority of rows.
func BotSQLPattern() string {
	var parts []string
	for _, p := range botSubstrings {
		// escape % and _ in the bot pattern (none currently, but future-safe)
		safe := strings.ReplaceAll(strings.ReplaceAll(p, "%", `\%`), "_", `\_`)
		parts = append(parts, "LOWER(user_agent) LIKE '%"+safe+"%'")
	}
	// Add empty + short UA cases
	parts = append(parts, "user_agent IS NULL", "user_agent = ''", "LENGTH(user_agent) < 15")
	return "(" + strings.Join(parts, " OR ") + ")"
}
