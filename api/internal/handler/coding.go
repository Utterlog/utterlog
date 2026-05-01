package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/siteclock"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

const (
	codingCacheTTL                = time.Hour
	codingCacheStaleTTL           = 6 * time.Hour
	codingCacheRedisTTL           = codingCacheTTL + codingCacheStaleTTL
	codingAllContributionCacheTTL = 24 * time.Hour
	codingGitHubRefreshTimeout    = 45 * time.Second
)

var githubUsernamePattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)
var githubRepoNamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
var contributionCellTagPattern = regexp.MustCompile(`(?is)<td\b[^>]*ContributionCalendar-day[^>]*>`)
var contributionTooltipPattern = regexp.MustCompile(`(?is)<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>(.*?)</tool-tip>`)
var contributionSummaryPattern = regexp.MustCompile(`(?is)<h2\b[^>]*\bid="js-contribution-activity-description"[^>]*>(.*?)</h2>`)
var contributionCountPattern = regexp.MustCompile(`(?i)([0-9][0-9,]*)\s+contribution`)

var codingCache = struct {
	sync.Mutex
	items      map[string]cachedCodingData
	refreshing map[string]bool
}{
	items:      map[string]cachedCodingData{},
	refreshing: map[string]bool{},
}

type cachedCodingData struct {
	Data    codingPageData `json:"data"`
	Expires time.Time      `json:"expires"`
}

var codingContributionTotalCache = struct {
	sync.Mutex
	items map[string]cachedCodingContributionTotal
}{
	items: map[string]cachedCodingContributionTotal{},
}

type cachedCodingContributionTotal struct {
	total   int
	expires time.Time
}

type codingPageData struct {
	Enabled        bool                    `json:"enabled"`
	Configured     bool                    `json:"configured"`
	Source         string                  `json:"source"`
	Username       string                  `json:"username"`
	Profile        *codingGitHubProfile    `json:"profile,omitempty"`
	Profiles       []codingGitHubProfile   `json:"profiles,omitempty"`
	Repos          []codingGitHubRepo      `json:"repos"`
	AvailableRepos []codingGitHubRepo      `json:"available_repos,omitempty"`
	Events         []codingGitHubActivity  `json:"events"`
	ActivityDays   []codingActivityDay     `json:"activity_days"`
	Contributions  []codingContributionDay `json:"contributions"`
	Stats          codingGitHubStats       `json:"stats"`
	UpdatedAt      int64                   `json:"updated_at"`
	Error          string                  `json:"error,omitempty"`
}

type codingGitHubProfile struct {
	Login       string `json:"login"`
	Type        string `json:"type"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatar_url"`
	HTMLURL     string `json:"html_url"`
	Bio         string `json:"bio"`
	Company     string `json:"company"`
	Location    string `json:"location"`
	Blog        string `json:"blog"`
	PublicRepos int    `json:"public_repos"`
	Followers   int    `json:"followers"`
	Following   int    `json:"following"`
	CreatedAt   string `json:"created_at"`
}

type codingGitHubRepo struct {
	Name        string                 `json:"name"`
	FullName    string                 `json:"full_name"`
	HTMLURL     string                 `json:"html_url"`
	Description string                 `json:"description"`
	Language    string                 `json:"language"`
	Stars       int                    `json:"stars"`
	Forks       int                    `json:"forks"`
	OpenIssues  int                    `json:"open_issues"`
	License     string                 `json:"license"`
	PushedAt    string                 `json:"pushed_at"`
	UpdatedAt   string                 `json:"updated_at"`
	Archived    bool                   `json:"archived"`
	Fork        bool                   `json:"fork"`
	Activities  []codingGitHubActivity `json:"activities,omitempty"`
}

type codingGitHubActivity struct {
	Type        string `json:"type"`
	Label       string `json:"label"`
	Repo        string `json:"repo"`
	URL         string `json:"url"`
	CreatedAt   string `json:"created_at"`
	CreatedUnix int64  `json:"created_unix"`
	Count       int    `json:"count"`
}

type codingContributionDay struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type codingActivityDay struct {
	Date      string               `json:"date"`
	Label     string               `json:"label"`
	Summary   string               `json:"summary"`
	Total     int                  `json:"total"`
	RepoCount int                  `json:"repo_count"`
	Repos     []codingActivityRepo `json:"repos"`
}

type codingActivityRepo struct {
	Name     string                 `json:"name"`
	FullName string                 `json:"full_name"`
	HTMLURL  string                 `json:"html_url"`
	Summary  string                 `json:"summary"`
	Counts   map[string]int         `json:"counts"`
	Events   []codingGitHubActivity `json:"events"`
}

type codingActivityRepoGroup struct {
	codingActivityRepo
	latest int64
}

type codingGitHubStats struct {
	TotalContributions int `json:"total_contributions"`
	AllContributions   int `json:"all_contributions"`
	RecentEvents       int `json:"recent_events"`
	RecentRepos        int `json:"recent_repos"`
	PublicRepos        int `json:"public_repos"`
	Followers          int `json:"followers"`
}

type githubUserResponse struct {
	Login       string `json:"login"`
	Type        string `json:"type"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatar_url"`
	HTMLURL     string `json:"html_url"`
	Bio         string `json:"bio"`
	Company     string `json:"company"`
	Location    string `json:"location"`
	Blog        string `json:"blog"`
	PublicRepos int    `json:"public_repos"`
	Followers   int    `json:"followers"`
	Following   int    `json:"following"`
	CreatedAt   string `json:"created_at"`
}

type githubRepoResponse struct {
	Name            string `json:"name"`
	FullName        string `json:"full_name"`
	HTMLURL         string `json:"html_url"`
	Description     string `json:"description"`
	Language        string `json:"language"`
	StargazersCount int    `json:"stargazers_count"`
	ForksCount      int    `json:"forks_count"`
	OpenIssuesCount int    `json:"open_issues_count"`
	PushedAt        string `json:"pushed_at"`
	UpdatedAt       string `json:"updated_at"`
	Archived        bool   `json:"archived"`
	Fork            bool   `json:"fork"`
	License         *struct {
		SPDXID string `json:"spdx_id"`
	} `json:"license"`
}

type githubOrgResponse struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	HTMLURL   string `json:"html_url"`
}

type githubEventResponse struct {
	Type      string                 `json:"type"`
	Repo      githubEventRepo        `json:"repo"`
	Payload   map[string]interface{} `json:"payload"`
	CreatedAt time.Time              `json:"created_at"`
}

type githubEventRepo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type githubGraphQLRequest struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables,omitempty"`
}

type githubGraphQLResponse struct {
	Data   githubGraphQLData    `json:"data"`
	Errors []githubGraphQLError `json:"errors,omitempty"`
}

type githubGraphQLError struct {
	Message string `json:"message"`
}

type githubGraphQLData struct {
	User *githubGraphQLUser `json:"user"`
}

type githubGraphQLUser struct {
	ContributionsCollection githubGraphQLContributionCollection `json:"contributionsCollection"`
}

type githubGraphQLContributionCollection struct {
	ContributionCalendar githubGraphQLContributionCalendar `json:"contributionCalendar"`
}

type githubGraphQLContributionCalendar struct {
	TotalContributions int                             `json:"totalContributions"`
	Weeks              []githubGraphQLContributionWeek `json:"weeks"`
}

type githubGraphQLContributionWeek struct {
	ContributionDays []githubGraphQLContributionDay `json:"contributionDays"`
}

type githubGraphQLContributionDay struct {
	Date              string `json:"date"`
	ContributionCount int    `json:"contributionCount"`
}

type socialLinkForCoding struct {
	Icon string `json:"icon"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type codingGitHubSourceSelection struct {
	Usernames []string
	Repos     map[string]bool
}

func GetCodingData(c *gin.Context) {
	enabled := !strings.EqualFold(strings.TrimSpace(model.GetOption("page_coding")), "false")
	includeRepos := strings.EqualFold(c.Query("include_repos"), "true") && codingRequestIsAdmin(c)
	rawSources, source := resolveCodingGitHubSources()
	sourceSelection := extractGitHubSourceSelection(rawSources)
	usernames := sourceSelection.Usernames
	if len(usernames) == 0 {
		util.Success(c, codingPageData{
			Enabled:       enabled,
			Configured:    false,
			Source:        source,
			Repos:         []codingGitHubRepo{},
			Events:        []codingGitHubActivity{},
			ActivityDays:  []codingActivityDay{},
			Contributions: emptyCodingContributions(time.Now().UTC()),
			UpdatedAt:     time.Now().Unix(),
		})
		return
	}

	data, err := loadCodingGitHubData(c.Request.Context(), usernames, sourceSelection.Repos)
	data.Enabled = enabled
	data.Configured = true
	data.Source = source
	data.Username = strings.Join(usernames, ",")
	if err != nil {
		data.Error = err.Error()
	}
	if !includeRepos {
		data.AvailableRepos = nil
	}
	util.Success(c, data)
}

func resolveCodingGitHubSources() ([]string, string) {
	if v := strings.TrimSpace(model.GetOption("coding_github_url")); v != "" {
		return splitCodingGitHubSources(v), "custom"
	}
	if v := strings.TrimSpace(model.GetOption("social_github")); v != "" {
		return splitCodingGitHubSources(v), "social_github"
	}

	rawSocial := strings.TrimSpace(model.GetOption("social_links"))
	if rawSocial == "" {
		return nil, ""
	}
	var links []socialLinkForCoding
	if err := json.Unmarshal([]byte(rawSocial), &links); err != nil {
		return nil, ""
	}
	sources := make([]string, 0, len(links))
	for _, link := range links {
		haystack := strings.ToLower(strings.TrimSpace(link.Name + " " + link.Icon + " " + link.URL))
		if strings.Contains(haystack, "github") && strings.TrimSpace(link.URL) != "" {
			sources = append(sources, link.URL)
		}
	}
	if len(sources) > 0 {
		return sources, "profile_social_links"
	}
	return nil, ""
}

func splitCodingGitHubSources(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == '\n' || r == '\r' || r == '\t' || r == ' ' || r == ',' || r == '，' || r == ';' || r == '；'
	})
	out := make([]string, 0, len(fields))
	for _, field := range fields {
		if value := strings.TrimSpace(field); value != "" {
			out = append(out, value)
		}
	}
	return out
}

func extractGitHubUsernames(rawSources []string) []string {
	return extractGitHubSourceSelection(rawSources).Usernames
}

func extractGitHubSourceSelection(rawSources []string) codingGitHubSourceSelection {
	seen := map[string]bool{}
	usernames := make([]string, 0, len(rawSources))
	repos := map[string]bool{}
	for _, raw := range rawSources {
		username, repo := extractGitHubOwnerRepo(raw)
		key := strings.ToLower(username)
		if key != "" && !seen[key] {
			seen[key] = true
			usernames = append(usernames, username)
		}
		if repo != "" {
			repos[strings.ToLower(username+"/"+repo)] = true
		}
	}
	if len(repos) == 0 {
		repos = nil
	}
	return codingGitHubSourceSelection{Usernames: usernames, Repos: repos}
}

func extractGitHubUsername(raw string) string {
	username, _ := extractGitHubOwnerRepo(raw)
	return username
}

func extractGitHubOwnerRepo(raw string) (string, string) {
	value := strings.TrimSpace(raw)
	value = strings.TrimPrefix(value, "@")
	value = strings.TrimSuffix(value, "/")
	if value == "" {
		return "", ""
	}
	if !strings.Contains(value, "://") && strings.Contains(strings.ToLower(value), "github.com") {
		value = "https://" + value
	}
	parts := []string{}
	if strings.Contains(value, "://") {
		parsed, err := url.Parse(value)
		if err != nil {
			return "", ""
		}
		host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
		if host != "github.com" {
			return "", ""
		}
		for _, part := range strings.Split(strings.Trim(parsed.EscapedPath(), "/"), "/") {
			if part == "" {
				continue
			}
			decoded, err := url.PathUnescape(part)
			if err != nil {
				return "", ""
			}
			parts = append(parts, decoded)
		}
	} else {
		value = strings.Trim(value, "/")
		for _, part := range strings.Split(value, "/") {
			if strings.TrimSpace(part) != "" {
				parts = append(parts, strings.TrimSpace(part))
			}
		}
	}
	if len(parts) == 0 {
		return "", ""
	}
	owner := strings.TrimSpace(parts[0])
	repo := ""
	if len(parts) > 1 {
		repo = strings.TrimSuffix(strings.TrimSpace(parts[1]), ".git")
	}
	if isReservedGitHubPath(owner) || !githubUsernamePattern.MatchString(owner) {
		return "", ""
	}
	if repo != "" && !githubRepoNamePattern.MatchString(repo) {
		repo = ""
	}
	return owner, repo
}

func isReservedGitHubPath(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "about", "apps", "blog", "collections", "contact", "enterprise", "events", "explore", "features", "github", "issues", "join", "login", "marketplace", "new", "notifications", "orgs", "organizations", "pricing", "pulls", "search", "settings", "sponsors", "topics", "trending":
		return true
	default:
		return false
	}
}

func loadCodingGitHubData(ctx context.Context, usernames []string, sourceRepos map[string]bool) (codingPageData, error) {
	key := strings.Join(normalizeCodingUsernames(usernames), ",") + ":" + normalizeCodingRepoSelection(sourceRepos) + ":" + strings.TrimSpace(model.GetOption("coding_selected_repos")) + ":" + githubTokenCacheKey()
	now := time.Now()

	codingCache.Lock()
	item, ok := codingCache.items[key]
	codingCache.Unlock()
	if ok {
		if now.Before(item.Expires) {
			return item.Data, nil
		}
		if now.Before(item.Expires.Add(codingCacheStaleTTL)) {
			startCodingRefresh(key, usernames, sourceRepos)
			return item.Data, nil
		}
	}

	if item, ok := readCodingCacheFromRedis(ctx, key); ok {
		codingCache.Lock()
		codingCache.items[key] = item
		codingCache.Unlock()
		if now.Before(item.Expires) {
			return item.Data, nil
		}
		if now.Before(item.Expires.Add(codingCacheStaleTTL)) {
			startCodingRefresh(key, usernames, sourceRepos)
			return item.Data, nil
		}
	}

	data, err := fetchCodingGitHubData(ctx, usernames, sourceRepos)
	if err != nil {
		if data.Profile != nil || len(data.Profiles) > 0 {
			storeCodingCache(ctx, key, data)
			return data, err
		}
		codingCache.Lock()
		if item, ok := codingCache.items[key]; ok {
			data = item.Data
			codingCache.Unlock()
			return data, err
		}
		codingCache.Unlock()
		return codingPageData{
			Username:      strings.Join(usernames, ","),
			Repos:         []codingGitHubRepo{},
			Events:        []codingGitHubActivity{},
			ActivityDays:  []codingActivityDay{},
			Contributions: emptyCodingContributions(time.Now().UTC()),
			UpdatedAt:     time.Now().Unix(),
		}, err
	}

	storeCodingCache(ctx, key, data)
	return data, nil
}

func startCodingRefresh(key string, usernames []string, sourceRepos map[string]bool) {
	codingCache.Lock()
	if codingCache.refreshing[key] {
		codingCache.Unlock()
		return
	}
	codingCache.refreshing[key] = true
	codingCache.Unlock()

	usernamesCopy := append([]string(nil), usernames...)
	sourceReposCopy := cloneCodingRepoSelection(sourceRepos)
	go func() {
		defer func() {
			codingCache.Lock()
			delete(codingCache.refreshing, key)
			codingCache.Unlock()
		}()

		ctx, cancel := context.WithTimeout(context.Background(), codingGitHubRefreshTimeout)
		defer cancel()
		data, err := fetchCodingGitHubData(ctx, usernamesCopy, sourceReposCopy)
		if err != nil && data.Profile == nil && len(data.Profiles) == 0 {
			return
		}
		if err != nil {
			data.Error = err.Error()
		}
		storeCodingCache(ctx, key, data)
	}()
}

func cloneCodingRepoSelection(selected map[string]bool) map[string]bool {
	if len(selected) == 0 {
		return nil
	}
	out := make(map[string]bool, len(selected))
	for key, value := range selected {
		out[key] = value
	}
	return out
}

func storeCodingCache(ctx context.Context, key string, data codingPageData) {
	item := cachedCodingData{Data: data, Expires: time.Now().Add(codingCacheTTL)}
	codingCache.Lock()
	codingCache.items[key] = item
	codingCache.Unlock()
	writeCodingCacheToRedis(ctx, key, item)
}

func readCodingCacheFromRedis(ctx context.Context, key string) (cachedCodingData, bool) {
	if config.RDB == nil {
		return cachedCodingData{}, false
	}
	raw, err := config.RDB.Get(ctx, codingRedisCacheKey(key)).Bytes()
	if err != nil || len(raw) == 0 {
		return cachedCodingData{}, false
	}
	var item cachedCodingData
	if err := json.Unmarshal(raw, &item); err != nil {
		return cachedCodingData{}, false
	}
	if item.Data.UpdatedAt == 0 {
		return cachedCodingData{}, false
	}
	return item, true
}

func writeCodingCacheToRedis(ctx context.Context, key string, item cachedCodingData) {
	if config.RDB == nil {
		return
	}
	raw, err := json.Marshal(item)
	if err != nil {
		return
	}
	_ = config.RDB.Set(ctx, codingRedisCacheKey(key), raw, codingCacheRedisTTL).Err()
}

func codingRedisCacheKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return "coding:page:" + fmt.Sprintf("%x", sum)
}

func clearCodingMemoryCache() {
	codingCache.Lock()
	codingCache.items = map[string]cachedCodingData{}
	codingCache.refreshing = map[string]bool{}
	codingCache.Unlock()

	codingContributionTotalCache.Lock()
	codingContributionTotalCache.items = map[string]cachedCodingContributionTotal{}
	codingContributionTotalCache.Unlock()
}

func normalizeCodingUsernames(usernames []string) []string {
	out := make([]string, 0, len(usernames))
	for _, username := range usernames {
		if value := strings.ToLower(strings.TrimSpace(username)); value != "" {
			out = append(out, value)
		}
	}
	sort.Strings(out)
	return out
}

func normalizeCodingRepoSelection(selected map[string]bool) string {
	if len(selected) == 0 {
		return ""
	}
	out := make([]string, 0, len(selected))
	for repo := range selected {
		if value := strings.ToLower(strings.TrimSpace(repo)); value != "" {
			out = append(out, value)
		}
	}
	sort.Strings(out)
	return strings.Join(out, ",")
}

func fetchCodingGitHubData(ctx context.Context, usernames []string, sourceRepos map[string]bool) (codingPageData, error) {
	now := time.Now().UTC()
	profiles := make([]codingGitHubProfile, 0, len(usernames))
	repos := []codingGitHubRepo{}
	activities := []codingGitHubActivity{}
	eventsRawAll := []githubEventResponse{}
	contributionCounts := map[string]int{}
	repoSeen := map[string]bool{}
	publicRepos := 0
	followers := 0
	allContributions := 0
	var firstErr error

	for _, username := range usernames {
		var user githubUserResponse
		if err := githubAPIGet(ctx, fmt.Sprintf("/users/%s", url.PathEscape(username)), &user); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}

		isOrg := strings.EqualFold(user.Type, "Organization")
		profile := codingGitHubProfile{
			Login:       user.Login,
			Type:        user.Type,
			Name:        user.Name,
			AvatarURL:   user.AvatarURL,
			HTMLURL:     user.HTMLURL,
			Bio:         user.Bio,
			Company:     user.Company,
			Location:    user.Location,
			Blog:        user.Blog,
			PublicRepos: user.PublicRepos,
			Followers:   user.Followers,
			Following:   user.Following,
			CreatedAt:   user.CreatedAt,
		}
		profiles = append(profiles, profile)
		publicRepos += user.PublicRepos
		followers += user.Followers

		reposRaw, err := fetchGitHubRepos(ctx, username, isOrg)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		appendCodingRepos(&repos, repoSeen, reposRaw)

		eventsRaw, err := fetchGitHubAccountEvents(ctx, username, isOrg)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		eventsRawAll = append(eventsRawAll, eventsRaw...)
		activities = append(activities, normalizeGitHubActivities(eventsRaw)...)

		if !isOrg {
			orgs, orgErr := fetchGitHubUserOrgs(ctx, username)
			if orgErr != nil && firstErr == nil {
				firstErr = orgErr
			}
			for _, org := range orgs {
				orgLogin := strings.TrimSpace(org.Login)
				if orgLogin == "" {
					continue
				}
				orgReposRaw, repoErr := fetchGitHubRepos(ctx, orgLogin, true)
				if repoErr != nil && firstErr == nil {
					firstErr = repoErr
				}
				appendCodingRepos(&repos, repoSeen, orgReposRaw)

				orgEventsRaw, eventErr := fetchGitHubAccountEvents(ctx, orgLogin, true)
				if eventErr != nil && firstErr == nil {
					firstErr = eventErr
				}
				eventsRawAll = append(eventsRawAll, orgEventsRaw...)
				activities = append(activities, normalizeGitHubActivities(orgEventsRaw)...)
			}
		}

		contributions := []codingContributionDay{}
		if !isOrg {
			contributions, err = fetchGitHubContributionCalendar(ctx, username, now)
			if total, totalErr := fetchGitHubAllContributionTotal(ctx, username, user.CreatedAt, now); totalErr == nil {
				allContributions += total
			}
		}
		if isOrg || err != nil || len(contributions) == 0 {
			contributions = buildCodingContributions(eventsRaw, now)
		}
		mergeContributionCounts(contributionCounts, contributions)
	}

	if len(profiles) == 0 {
		if firstErr == nil {
			firstErr = errors.New("GitHub profile not found")
		}
		return codingPageData{}, firstErr
	}

	sortCodingRepos(repos)
	sortAndLimitCodingActivities(&activities, 40)
	publicRepos = len(repos)
	activityByRepo := groupCodingActivitiesByRepo(activities)
	selectedRepos, hasRepoSelection := selectedCodingRepoNames()
	selectedRepos, hasRepoSelection = mergeCodingRepoSelections(selectedRepos, hasRepoSelection, sourceRepos)
	displayRepos := filterCodingRepos(repos, selectedRepos, hasRepoSelection)
	for i := range displayRepos {
		displayRepos[i].Activities = fetchCodingRepoActivities(ctx, displayRepos[i].FullName, activityByRepo)
	}
	activityDays := buildCodingActivityDays(activities, repos, selectedRepos, hasRepoSelection, siteclock.Location())
	contributions := contributionCountsToDays(contributionCounts)
	if len(contributions) == 0 {
		contributions = buildCodingContributions(eventsRawAll, now)
	}
	stats := buildCodingStats(publicRepos, followers, activities, contributions)
	if allContributions <= 0 {
		allContributions = stats.TotalContributions
	}
	stats.AllContributions = allContributions
	stats.RecentRepos = len(displayRepos)
	profile := profiles[0]

	return codingPageData{
		Username:       strings.Join(usernames, ","),
		Profile:        &profile,
		Profiles:       profiles,
		Repos:          displayRepos,
		AvailableRepos: repos,
		Events:         activities,
		ActivityDays:   activityDays,
		Contributions:  contributions,
		Stats:          stats,
		UpdatedAt:      time.Now().Unix(),
	}, firstErr
}

func convertGitHubRepo(repo githubRepoResponse) codingGitHubRepo {
	license := ""
	if repo.License != nil && repo.License.SPDXID != "NOASSERTION" {
		license = repo.License.SPDXID
	}
	return codingGitHubRepo{
		Name:        repo.Name,
		FullName:    repo.FullName,
		HTMLURL:     repo.HTMLURL,
		Description: repo.Description,
		Language:    repo.Language,
		Stars:       repo.StargazersCount,
		Forks:       repo.ForksCount,
		OpenIssues:  repo.OpenIssuesCount,
		License:     license,
		PushedAt:    repo.PushedAt,
		UpdatedAt:   repo.UpdatedAt,
		Archived:    repo.Archived,
		Fork:        repo.Fork,
	}
}

func appendCodingRepos(repos *[]codingGitHubRepo, seen map[string]bool, reposRaw []githubRepoResponse) {
	for _, repo := range reposRaw {
		converted := convertGitHubRepo(repo)
		key := strings.ToLower(strings.TrimSpace(converted.FullName))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		*repos = append(*repos, converted)
	}
}

func fetchGitHubRepos(ctx context.Context, username string, isOrg bool) ([]githubRepoResponse, error) {
	all := make([]githubRepoResponse, 0, 100)
	for page := 1; page <= 5; page++ {
		var batch []githubRepoResponse
		path := fmt.Sprintf("/users/%s/repos?sort=updated&direction=desc&per_page=100&type=owner&page=%d", url.PathEscape(username), page)
		if isOrg {
			path = fmt.Sprintf("/orgs/%s/repos?sort=updated&direction=desc&per_page=100&type=public&page=%d", url.PathEscape(username), page)
		}
		if err := githubAPIGet(ctx, path, &batch); err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}
		for _, repo := range batch {
			all = append(all, repo)
		}
		if len(batch) < 100 {
			break
		}
	}
	return all, nil
}

func fetchGitHubUserOrgs(ctx context.Context, username string) ([]githubOrgResponse, error) {
	basePath := fmt.Sprintf("/users/%s/orgs", url.PathEscape(username))
	if authenticated := fetchAuthenticatedGitHubLogin(ctx); authenticated != "" && strings.EqualFold(authenticated, username) {
		basePath = "/user/orgs"
	}
	out := make([]githubOrgResponse, 0, 20)
	for page := 1; page <= 3; page++ {
		var batch []githubOrgResponse
		separator := "?"
		if strings.Contains(basePath, "?") {
			separator = "&"
		}
		path := fmt.Sprintf("%s%sper_page=100&page=%d", basePath, separator, page)
		if err := githubAPIGet(ctx, path, &batch); err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}
		out = append(out, batch...)
		if len(batch) < 100 {
			break
		}
	}
	return out, nil
}

func fetchAuthenticatedGitHubLogin(ctx context.Context) string {
	if githubAPIToken() == "" {
		return ""
	}
	var user githubUserResponse
	if err := githubAPIGet(ctx, "/user", &user); err != nil {
		return ""
	}
	return strings.TrimSpace(user.Login)
}

func fetchGitHubAccountEvents(ctx context.Context, username string, isOrg bool) ([]githubEventResponse, error) {
	var events []githubEventResponse
	path := fmt.Sprintf("/users/%s/events/public?per_page=100", url.PathEscape(username))
	if isOrg {
		path = fmt.Sprintf("/orgs/%s/events?per_page=100", url.PathEscape(username))
	}
	err := githubAPIGet(ctx, path, &events)
	return events, err
}

func fetchCodingRepoActivities(ctx context.Context, fullName string, fallback map[string][]codingGitHubActivity) []codingGitHubActivity {
	key := strings.ToLower(strings.TrimSpace(fullName))
	if key == "" {
		return []codingGitHubActivity{}
	}
	var events []githubEventResponse
	if repoPath := githubRepoAPIPath(fullName); repoPath != "" {
		if err := githubAPIGet(ctx, "/repos/"+repoPath+"/events?per_page=5", &events); err == nil {
			activities := normalizeGitHubActivitiesWithLimit(events, 5)
			if len(activities) > 0 {
				return activities
			}
		}
		if activities := fetchGitHubRepoCommitActivities(ctx, repoPath); len(activities) > 0 {
			return activities
		}
	}
	return limitCodingActivities(fallback[key], 5)
}

func githubRepoAPIPath(fullName string) string {
	parts := strings.Split(strings.Trim(fullName, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return ""
	}
	return url.PathEscape(parts[0]) + "/" + url.PathEscape(parts[1])
}

func githubAPIGet(ctx context.Context, path string, target interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "Utterlog-Coding-Page")
	if auth := githubAuthorizationHeader(); auth != "" {
		req.Header.Set("Authorization", auth)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return errors.New("GitHub API " + strconv.Itoa(resp.StatusCode))
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

type githubCommitResponse struct {
	HTMLURL string `json:"html_url"`
	Commit  struct {
		Message string `json:"message"`
		Author  struct {
			Date time.Time `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

func fetchGitHubRepoCommitActivities(ctx context.Context, repoPath string) []codingGitHubActivity {
	var commits []githubCommitResponse
	if err := githubAPIGet(ctx, "/repos/"+repoPath+"/commits?per_page=5", &commits); err != nil {
		return []codingGitHubActivity{}
	}
	out := make([]codingGitHubActivity, 0, len(commits))
	repoName, _ := url.PathUnescape(repoPath)
	for _, commit := range commits {
		message := strings.TrimSpace(strings.Split(commit.Commit.Message, "\n")[0])
		if message == "" {
			message = "Committed"
		}
		t := commit.Commit.Author.Date
		out = append(out, codingGitHubActivity{
			Type:        "Commit",
			Label:       message,
			Repo:        repoName,
			URL:         commit.HTMLURL,
			CreatedAt:   t.Format(time.RFC3339),
			CreatedUnix: t.Unix(),
			Count:       1,
		})
	}
	sortAndLimitCodingActivities(&out, 5)
	return out
}

func githubAPIToken() string {
	for _, key := range []string{"github_access_token", "coding_github_token"} {
		if token := strings.TrimSpace(model.GetOption(key)); token != "" {
			return token
		}
	}
	return ""
}

func githubAuthorizationHeader() string {
	token := githubAPIToken()
	if token == "" {
		return ""
	}
	lower := strings.ToLower(token)
	if strings.HasPrefix(lower, "bearer ") || strings.HasPrefix(lower, "token ") {
		return token
	}
	return "Bearer " + token
}

func githubTokenCacheKey() string {
	token := githubAPIToken()
	if token == "" {
		return "anonymous"
	}
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum)[:12]
}

func codingRequestIsAdmin(c *gin.Context) bool {
	header := c.GetHeader("Authorization")
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return false
	}
	userID, err := util.GetUserIDFromToken(parts[1])
	if err != nil || userID <= 0 {
		return false
	}
	var role string
	if err := config.DB.Get(&role, "SELECT role FROM "+config.T("users")+" WHERE id = $1", userID); err != nil {
		return false
	}
	return strings.EqualFold(role, "admin")
}

func normalizeGitHubActivities(events []githubEventResponse) []codingGitHubActivity {
	return normalizeGitHubActivitiesWithLimit(events, 40)
}

func normalizeGitHubActivitiesWithLimit(events []githubEventResponse, limit int) []codingGitHubActivity {
	out := make([]codingGitHubActivity, 0, len(events))
	for _, event := range events {
		count := eventContributionCount(event)
		out = append(out, codingGitHubActivity{
			Type:        event.Type,
			Label:       describeGitHubEvent(event),
			Repo:        event.Repo.Name,
			URL:         githubRepoHTMLURL(event.Repo.Name),
			CreatedAt:   event.CreatedAt.Format(time.RFC3339),
			CreatedUnix: event.CreatedAt.Unix(),
			Count:       count,
		})
	}
	sortAndLimitCodingActivities(&out, limit)
	return out
}

func sortAndLimitCodingActivities(events *[]codingGitHubActivity, limit int) {
	out := *events
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedUnix > out[j].CreatedUnix
	})
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	*events = out
}

func sortCodingRepos(repos []codingGitHubRepo) {
	sort.SliceStable(repos, func(i, j int) bool {
		return codingRepoSortUnix(repos[i]) > codingRepoSortUnix(repos[j])
	})
}

func codingRepoSortUnix(repo codingGitHubRepo) int64 {
	for _, value := range []string{repo.UpdatedAt, repo.PushedAt} {
		if t, err := time.Parse(time.RFC3339, value); err == nil {
			return t.Unix()
		}
	}
	return 0
}

func groupCodingActivitiesByRepo(events []codingGitHubActivity) map[string][]codingGitHubActivity {
	grouped := map[string][]codingGitHubActivity{}
	for _, event := range events {
		key := strings.ToLower(strings.TrimSpace(event.Repo))
		if key == "" {
			continue
		}
		grouped[key] = append(grouped[key], event)
	}
	return grouped
}

func buildCodingActivityDays(events []codingGitHubActivity, repos []codingGitHubRepo, selected map[string]bool, hasSelection bool, loc *time.Location) []codingActivityDay {
	if loc == nil {
		loc = time.UTC
	}
	type dayGroup struct {
		codingActivityDay
		repoMap map[string]*codingActivityRepoGroup
		latest  int64
	}
	repoLookup := codingRepoLookup(repos)
	dayMap := map[string]*dayGroup{}

	for _, event := range events {
		if !codingActivityRepoSelected(event.Repo, selected, hasSelection) {
			continue
		}
		t, err := time.Parse(time.RFC3339, event.CreatedAt)
		if err != nil {
			continue
		}
		dayKey := t.In(loc).Format("2006-01-02")
		day, ok := dayMap[dayKey]
		if !ok {
			day = &dayGroup{
				codingActivityDay: codingActivityDay{
					Date:  dayKey,
					Label: codingDayLabel(dayKey, loc),
					Repos: []codingActivityRepo{},
				},
				repoMap: map[string]*codingActivityRepoGroup{},
			}
			dayMap[dayKey] = day
		}
		repoKey := strings.ToLower(strings.TrimSpace(event.Repo))
		if repoKey == "" {
			repoKey = "unknown"
		}
		repo, ok := day.repoMap[repoKey]
		if !ok {
			meta := repoLookup[repoKey]
			name := codingRepoShortName(event.Repo)
			fullName := event.Repo
			htmlURL := githubRepoHTMLURL(event.Repo)
			if meta.FullName != "" {
				name = meta.Name
				fullName = meta.FullName
				htmlURL = meta.HTMLURL
			}
			repo = &codingActivityRepoGroup{
				codingActivityRepo: codingActivityRepo{
					Name:     name,
					FullName: fullName,
					HTMLURL:  htmlURL,
					Counts:   map[string]int{},
					Events:   []codingGitHubActivity{},
				},
			}
			day.repoMap[repoKey] = repo
		}
		count := event.Count
		if count <= 0 {
			count = 1
		}
		code := codingActivityCode(event.Type)
		day.Total += count
		day.latest = maxInt64(day.latest, event.CreatedUnix)
		repo.Counts[code] += count
		repo.latest = maxInt64(repo.latest, event.CreatedUnix)
		if len(repo.Events) < 5 {
			repo.Events = append(repo.Events, event)
		}
	}

	days := make([]codingActivityDay, 0, len(dayMap))
	for _, day := range dayMap {
		repos := make([]*codingActivityRepoGroup, 0, len(day.repoMap))
		for _, repo := range day.repoMap {
			repo.Summary = summarizeCodingRepoActivity(repo.Counts)
			repos = append(repos, repo)
		}
		sort.SliceStable(repos, func(i, j int) bool {
			return repos[i].latest > repos[j].latest
		})
		day.RepoCount = len(repos)
		day.Summary = summarizeCodingDayActivity(day.Label, day.RepoCount, day.Total, collectCodingDayCounts(repos))
		for _, repo := range repos {
			day.Repos = append(day.Repos, repo.codingActivityRepo)
		}
		days = append(days, day.codingActivityDay)
	}
	sort.SliceStable(days, func(i, j int) bool {
		return days[i].Date > days[j].Date
	})
	if len(days) > 12 {
		days = days[:12]
	}
	return days
}

func codingRepoLookup(repos []codingGitHubRepo) map[string]codingGitHubRepo {
	lookup := map[string]codingGitHubRepo{}
	for _, repo := range repos {
		for _, key := range []string{repo.FullName, repo.Name} {
			key = strings.ToLower(strings.TrimSpace(key))
			if key != "" {
				lookup[key] = repo
			}
		}
	}
	return lookup
}

func codingActivityRepoSelected(repo string, selected map[string]bool, hasSelection bool) bool {
	if !hasSelection {
		return true
	}
	fullName := strings.ToLower(strings.TrimSpace(repo))
	if fullName == "" {
		return false
	}
	if selected[fullName] {
		return true
	}
	return selected[strings.ToLower(codingRepoShortName(fullName))]
}

func codingRepoShortName(repo string) string {
	parts := strings.Split(strings.Trim(repo, "/"), "/")
	if len(parts) == 0 {
		return strings.TrimSpace(repo)
	}
	return strings.TrimSpace(parts[len(parts)-1])
}

func codingDayLabel(date string, loc *time.Location) string {
	now := time.Now().In(loc)
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	switch date {
	case today:
		return "TODAY"
	case yesterday:
		return "YESTERDAY"
	default:
		return strings.ReplaceAll(date, "-", "/")
	}
}

func codingActivityCode(eventType string) string {
	normalized := strings.ToUpper(strings.TrimSuffix(strings.TrimSpace(eventType), "Event"))
	switch {
	case strings.Contains(normalized, "PULLREQUESTREVIEW"):
		return "REV"
	case strings.Contains(normalized, "PULLREQUEST"):
		return "PR"
	case strings.Contains(normalized, "ISSUECOMMENT"):
		return "CMT"
	case strings.Contains(normalized, "ISSUE"):
		return "ISS"
	case normalized == "COMMIT":
		return "COM"
	case strings.Contains(normalized, "PUSH"):
		return "PUSH"
	case strings.Contains(normalized, "CREATE"):
		return "NEW"
	case strings.Contains(normalized, "DELETE"):
		return "DEL"
	case strings.Contains(normalized, "FORK"):
		return "FORK"
	case strings.Contains(normalized, "WATCH"):
		return "STAR"
	default:
		if normalized == "" {
			return "LOG"
		}
		if len(normalized) > 4 {
			return normalized[:4]
		}
		return normalized
	}
}

func collectCodingDayCounts(repos []*codingActivityRepoGroup) map[string]int {
	counts := map[string]int{}
	for _, repo := range repos {
		for code, count := range repo.Counts {
			counts[code] += count
		}
	}
	return counts
}

func summarizeCodingDayActivity(label string, repoCount, total int, counts map[string]int) string {
	subject := "这一天"
	if label == "TODAY" {
		subject = "今天"
	} else if label == "YESTERDAY" {
		subject = "昨天"
	}
	return fmt.Sprintf("%s在 %d 个仓库产生 %d 条动态：%s。", subject, repoCount, total, strings.Join(codingActivityFragments(counts), "，"))
}

func summarizeCodingRepoActivity(counts map[string]int) string {
	return "当天包含 " + strings.Join(codingActivityFragments(counts), "，") + "。"
}

func codingActivityFragments(counts map[string]int) []string {
	type item struct {
		count int
		label string
	}
	items := []item{
		{count: counts["PUSH"] + counts["COM"], label: "次提交"},
		{count: counts["CMT"], label: "条评论"},
		{count: counts["PR"], label: "个 PR"},
		{count: counts["REV"], label: "次 Review"},
		{count: counts["ISS"], label: "个 Issue"},
		{count: counts["NEW"], label: "次创建"},
		{count: counts["DEL"], label: "次删除"},
		{count: counts["FORK"], label: "次 Fork"},
		{count: counts["STAR"], label: "次 Star"},
	}
	fragments := make([]string, 0, len(items))
	for _, item := range items {
		if item.count > 0 {
			fragments = append(fragments, fmt.Sprintf("%d %s", item.count, item.label))
		}
	}
	if len(fragments) == 0 {
		return []string{"若干 GitHub 动态"}
	}
	return fragments
}

func maxInt64(a, b int64) int64 {
	if b > a {
		return b
	}
	return a
}

func selectedCodingRepoNames() (map[string]bool, bool) {
	raw := strings.TrimSpace(model.GetOption("coding_selected_repos"))
	if raw == "" {
		return nil, false
	}
	var list []string
	if err := json.Unmarshal([]byte(raw), &list); err != nil {
		list = strings.Split(raw, ",")
	}
	selected := map[string]bool{}
	for _, item := range list {
		key := strings.ToLower(strings.TrimSpace(item))
		if key != "" {
			selected[key] = true
		}
	}
	return selected, true
}

func mergeCodingRepoSelections(selected map[string]bool, hasSelection bool, sourceRepos map[string]bool) (map[string]bool, bool) {
	if len(sourceRepos) == 0 {
		return selected, hasSelection
	}
	if selected == nil {
		selected = map[string]bool{}
	}
	for repo := range sourceRepos {
		key := strings.ToLower(strings.TrimSpace(repo))
		if key != "" {
			selected[key] = true
		}
	}
	return selected, true
}

func filterCodingRepos(repos []codingGitHubRepo, selected map[string]bool, hasSelection bool) []codingGitHubRepo {
	if hasSelection {
		out := make([]codingGitHubRepo, 0, len(selected))
		for _, repo := range repos {
			if selected[strings.ToLower(repo.FullName)] || selected[strings.ToLower(repo.Name)] {
				out = append(out, repo)
			}
		}
		return out
	}
	limit := 6
	if len(repos) < limit {
		limit = len(repos)
	}
	out := make([]codingGitHubRepo, limit)
	copy(out, repos[:limit])
	return out
}

func limitCodingActivities(events []codingGitHubActivity, limit int) []codingGitHubActivity {
	if len(events) <= limit {
		return events
	}
	out := make([]codingGitHubActivity, limit)
	copy(out, events[:limit])
	return out
}

func describeGitHubEvent(event githubEventResponse) string {
	switch event.Type {
	case "PushEvent":
		count := eventContributionCount(event)
		if count <= 1 {
			return "Pushed 1 commit"
		}
		return fmt.Sprintf("Pushed %d commits", count)
	case "PullRequestEvent":
		return fmt.Sprintf("%s pull request %s", titleWord(payloadString(event.Payload, "action")), payloadNumberLabel(event.Payload, "pull_request"))
	case "IssuesEvent":
		return fmt.Sprintf("%s issue %s", titleWord(payloadString(event.Payload, "action")), payloadNumberLabel(event.Payload, "issue"))
	case "IssueCommentEvent":
		return fmt.Sprintf("Commented on issue %s", payloadNumberLabel(event.Payload, "issue"))
	case "PullRequestReviewEvent":
		return fmt.Sprintf("%s pull request review", titleWord(payloadString(event.Payload, "action")))
	case "CreateEvent":
		refType := payloadString(event.Payload, "ref_type")
		if refType == "" {
			refType = "repository item"
		}
		return "Created " + refType
	case "DeleteEvent":
		refType := payloadString(event.Payload, "ref_type")
		if refType == "" {
			refType = "repository item"
		}
		return "Deleted " + refType
	case "ForkEvent":
		return "Forked repository"
	case "WatchEvent":
		return "Starred repository"
	case "ReleaseEvent":
		return fmt.Sprintf("%s release", titleWord(payloadString(event.Payload, "action")))
	default:
		return strings.TrimSuffix(event.Type, "Event")
	}
}

func eventContributionCount(event githubEventResponse) int {
	if event.Type != "PushEvent" {
		return 1
	}
	if size, ok := event.Payload["size"].(float64); ok && size > 0 {
		return int(size)
	}
	if commits, ok := event.Payload["commits"].([]interface{}); ok && len(commits) > 0 {
		return len(commits)
	}
	return 1
}

func buildCodingContributions(events []githubEventResponse, now time.Time) []codingContributionDay {
	days := emptyCodingContributions(now)
	index := map[string]int{}
	for i, day := range days {
		index[day.Date] = i
	}
	for _, event := range events {
		day := event.CreatedAt.UTC().Format("2006-01-02")
		i, ok := index[day]
		if !ok {
			continue
		}
		days[i].Count += eventContributionCount(event)
	}
	return days
}

func mergeContributionCounts(target map[string]int, days []codingContributionDay) {
	for _, day := range days {
		if _, err := time.Parse("2006-01-02", day.Date); err != nil {
			continue
		}
		target[day.Date] += day.Count
	}
}

func contributionCountsToDays(counts map[string]int) []codingContributionDay {
	if len(counts) == 0 {
		return nil
	}
	days := make([]codingContributionDay, 0, len(counts))
	for date, count := range counts {
		if _, err := time.Parse("2006-01-02", date); err != nil {
			continue
		}
		days = append(days, codingContributionDay{Date: date, Count: count})
	}
	sort.SliceStable(days, func(i, j int) bool {
		return days[i].Date < days[j].Date
	})
	return days
}

func fetchGitHubContributionCalendar(ctx context.Context, username string, now time.Time) ([]codingContributionDay, error) {
	from, to := currentYearContributionRange(now)
	if githubAPIToken() != "" {
		if days, err := fetchGitHubContributionCalendarGraphQL(ctx, username, from, to); err == nil && len(days) > 0 {
			return normalizeCurrentYearContributionDays(days, now), nil
		}
	}
	days, err := fetchGitHubContributionCalendarHTML(ctx, username, from, to)
	if err != nil {
		return nil, err
	}
	return normalizeCurrentYearContributionDays(days, now), nil
}

func fetchGitHubContributionCalendarGraphQL(ctx context.Context, username string, from, to time.Time) ([]codingContributionDay, error) {
	calendar, err := fetchGitHubContributionCalendarViaGraphQL(ctx, username, from, to)
	if err != nil {
		return nil, err
	}
	days := make([]codingContributionDay, 0, 366)
	for _, week := range calendar.Weeks {
		for _, day := range week.ContributionDays {
			if _, err := time.Parse("2006-01-02", day.Date); err != nil {
				continue
			}
			days = append(days, codingContributionDay{Date: day.Date, Count: day.ContributionCount})
		}
	}
	sort.SliceStable(days, func(i, j int) bool {
		return days[i].Date < days[j].Date
	})
	return days, nil
}

func fetchGitHubContributionCalendarHTML(ctx context.Context, username string, from, to time.Time) ([]codingContributionDay, error) {
	query := url.Values{}
	query.Set("from", from.Format("2006-01-02"))
	query.Set("to", to.Format("2006-01-02"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://github.com/users/"+url.PathEscape(username)+"/contributions?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("User-Agent", "Utterlog-Coding-Page")
	if auth := githubAuthorizationHeader(); auth != "" {
		req.Header.Set("Authorization", auth)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("GitHub contributions " + strconv.Itoa(resp.StatusCode))
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	return parseGitHubContributionCalendar(string(body)), nil
}

func fetchGitHubContributionCalendarViaGraphQL(ctx context.Context, username string, from, to time.Time) (githubGraphQLContributionCalendar, error) {
	if githubAPIToken() == "" {
		return githubGraphQLContributionCalendar{}, errors.New("GitHub token not configured")
	}
	payload := githubGraphQLRequest{
		Query: `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`,
		Variables: map[string]interface{}{
			"login": username,
			"from":  from.Format(time.RFC3339),
			"to":    to.Format(time.RFC3339),
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return githubGraphQLContributionCalendar{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.github.com/graphql", bytes.NewReader(body))
	if err != nil {
		return githubGraphQLContributionCalendar{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "Utterlog-Coding-Page")
	if auth := githubAuthorizationHeader(); auth != "" {
		req.Header.Set("Authorization", auth)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return githubGraphQLContributionCalendar{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return githubGraphQLContributionCalendar{}, errors.New("GitHub GraphQL " + strconv.Itoa(resp.StatusCode))
	}
	var out githubGraphQLResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return githubGraphQLContributionCalendar{}, err
	}
	if len(out.Errors) > 0 {
		return githubGraphQLContributionCalendar{}, errors.New("GitHub GraphQL " + out.Errors[0].Message)
	}
	if out.Data.User == nil {
		return githubGraphQLContributionCalendar{}, errors.New("GitHub user not found")
	}
	return out.Data.User.ContributionsCollection.ContributionCalendar, nil
}

func fetchGitHubAllContributionTotal(ctx context.Context, username string, createdAt string, now time.Time) (int, error) {
	cacheKey := codingAllContributionCacheKey(username, createdAt)
	codingContributionTotalCache.Lock()
	cached, hasCached := codingContributionTotalCache.items[cacheKey]
	if hasCached && now.Before(cached.expires) {
		total := cached.total
		codingContributionTotalCache.Unlock()
		return total, nil
	}
	codingContributionTotalCache.Unlock()

	startYear := now.Year()
	if t, err := time.Parse(time.RFC3339, createdAt); err == nil && t.Year() > 0 {
		startYear = t.Year()
	}
	if startYear < 2008 {
		startYear = 2008
	}
	if startYear > now.Year() {
		startYear = now.Year()
	}

	total := 0
	for year := startYear; year <= now.Year(); year++ {
		count, err := fetchGitHubContributionYearTotal(ctx, username, year, now)
		if err != nil {
			if hasCached {
				return cached.total, nil
			}
			return 0, err
		}
		total += count
	}
	codingContributionTotalCache.Lock()
	codingContributionTotalCache.items[cacheKey] = cachedCodingContributionTotal{
		total:   total,
		expires: now.Add(codingAllContributionCacheTTL),
	}
	codingContributionTotalCache.Unlock()
	return total, nil
}

func codingAllContributionCacheKey(username string, createdAt string) string {
	return strings.ToLower(strings.TrimSpace(username)) + ":" + strings.TrimSpace(createdAt) + ":" + githubTokenCacheKey()
}

func fetchGitHubContributionYearTotal(ctx context.Context, username string, year int, now time.Time) (int, error) {
	from, to := contributionYearRange(year, now)
	if githubAPIToken() != "" {
		if calendar, err := fetchGitHubContributionCalendarViaGraphQL(ctx, username, from, to); err == nil {
			return calendar.TotalContributions, nil
		}
	}
	query := url.Values{}
	query.Set("from", from.Format("2006-01-02"))
	query.Set("to", to.Format("2006-01-02"))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://github.com/users/"+url.PathEscape(username)+"/contributions?"+query.Encode(), nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("User-Agent", "Utterlog-Coding-Page")
	if auth := githubAuthorizationHeader(); auth != "" {
		req.Header.Set("Authorization", auth)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, errors.New("GitHub contributions " + strconv.Itoa(resp.StatusCode))
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return 0, err
	}
	return parseGitHubContributionSummaryTotal(string(body)), nil
}

func currentYearContributionRange(now time.Time) (time.Time, time.Time) {
	return contributionYearRange(now.Year(), now)
}

func contributionYearRange(year int, now time.Time) (time.Time, time.Time) {
	from := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(year, 12, 31, 23, 59, 59, 0, time.UTC)
	if year == now.Year() {
		to = time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, time.UTC)
	}
	return from, to
}

func parseGitHubContributionSummaryTotal(markup string) int {
	match := contributionSummaryPattern.FindStringSubmatch(markup)
	if len(match) < 2 {
		return 0
	}
	return parseContributionCount(match[1])
}

func parseGitHubContributionCalendar(markup string) []codingContributionDay {
	tooltipCounts := map[string]int{}
	for _, match := range contributionTooltipPattern.FindAllStringSubmatch(markup, -1) {
		if len(match) < 3 {
			continue
		}
		tooltipCounts[html.UnescapeString(match[1])] = parseContributionCount(match[2])
	}

	days := make([]codingContributionDay, 0, 366)
	seen := map[string]bool{}
	for _, tag := range contributionCellTagPattern.FindAllString(markup, -1) {
		date := htmlAttr(tag, "data-date")
		if date == "" || seen[date] {
			continue
		}
		if _, err := time.Parse("2006-01-02", date); err != nil {
			continue
		}
		id := htmlAttr(tag, "id")
		days = append(days, codingContributionDay{Date: date, Count: tooltipCounts[id]})
		seen[date] = true
	}

	sort.SliceStable(days, func(i, j int) bool {
		return days[i].Date < days[j].Date
	})
	return days
}

func htmlAttr(tag, name string) string {
	needle := name + `="`
	start := strings.Index(tag, needle)
	if start < 0 {
		return ""
	}
	start += len(needle)
	end := strings.Index(tag[start:], `"`)
	if end < 0 {
		return ""
	}
	return html.UnescapeString(tag[start : start+end])
}

func parseContributionCount(raw string) int {
	text := strings.Join(strings.Fields(html.UnescapeString(raw)), " ")
	if strings.Contains(strings.ToLower(text), "no contributions") {
		return 0
	}
	match := contributionCountPattern.FindStringSubmatch(text)
	if len(match) < 2 {
		return 0
	}
	n, err := strconv.Atoi(strings.ReplaceAll(match[1], ",", ""))
	if err != nil {
		return 0
	}
	return n
}

func emptyCodingContributions(now time.Time) []codingContributionDay {
	year := now.Year()
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
	days := make([]codingContributionDay, 0, int(end.Sub(start).Hours()/24)+1)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		days = append(days, codingContributionDay{Date: d.Format("2006-01-02"), Count: 0})
	}
	return days
}

func normalizeCurrentYearContributionDays(days []codingContributionDay, now time.Time) []codingContributionDay {
	out := emptyCodingContributions(now)
	index := map[string]int{}
	for i, day := range out {
		index[day.Date] = i
	}
	for _, day := range days {
		i, ok := index[day.Date]
		if !ok {
			continue
		}
		out[i].Count += day.Count
	}
	return out
}

func buildCodingStats(publicRepos int, followers int, activities []codingGitHubActivity, days []codingContributionDay) codingGitHubStats {
	total := 0
	for _, day := range days {
		total += day.Count
	}
	repos := map[string]bool{}
	for _, event := range activities {
		if event.Repo != "" {
			repos[event.Repo] = true
		}
	}
	return codingGitHubStats{
		TotalContributions: total,
		RecentEvents:       len(activities),
		RecentRepos:        len(repos),
		PublicRepos:        publicRepos,
		Followers:          followers,
	}
}

func githubRepoHTMLURL(repo string) string {
	repo = strings.Trim(repo, "/")
	if repo == "" {
		return ""
	}
	return "https://github.com/" + repo
}

func payloadString(payload map[string]interface{}, key string) string {
	if v, ok := payload[key].(string); ok {
		return v
	}
	return ""
}

func payloadNumberLabel(payload map[string]interface{}, key string) string {
	if nested, ok := payload[key].(map[string]interface{}); ok {
		if n, ok := nested["number"].(float64); ok && n > 0 {
			return "#" + strconv.Itoa(int(n))
		}
	}
	return ""
}

func titleWord(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Updated"
	}
	return strings.ToUpper(value[:1]) + value[1:]
}
