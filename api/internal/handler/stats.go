package handler

import (
	"fmt"
	"log"
	"time"
	"utterlog-go/config"
)

// Redis keys
const keyTotalViews = "stats:total_views"
const keyOnlinePrefix = "online:" // + visitor_id, TTL 5min

// IncrTotalViews atomically increments the global page view counter
func IncrTotalViews() {
	if config.RDB == nil {
		return
	}
	config.RDB.Incr(config.Ctx, keyTotalViews)
}

// GetTotalViews returns the global PV count (Redis fast path, DB fallback)
func GetTotalViews() int {
	if config.RDB != nil {
		val, err := config.RDB.Get(config.Ctx, keyTotalViews).Int()
		if err == nil {
			return val
		}
	}
	// Fallback: count from access_logs
	var count int
	config.DB.Get(&count, "SELECT COUNT(*) FROM "+config.T("access_logs"))
	// Warm up Redis
	if config.RDB != nil {
		config.RDB.Set(config.Ctx, keyTotalViews, count, 0)
	}
	return count
}

// IncrPostViews increments a post's view count directly in DB
// (post views are low-frequency enough for direct writes; Redis is used for global PV only)
func IncrPostViews(postID int) {
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET view_count = view_count + 1 WHERE id = $1",
		config.T("posts")), postID)
}

// InitStatsSync starts background goroutines for stats management
func InitStatsSync() {
	// Warm up total_views: only if Redis key doesn't exist yet (first boot)
	if config.RDB != nil {
		exists, _ := config.RDB.Exists(config.Ctx, keyTotalViews).Result()
		if exists == 0 {
			var count int
			config.DB.Get(&count, "SELECT COUNT(*) FROM "+config.T("access_logs"))
			config.RDB.Set(config.Ctx, keyTotalViews, count, 0)
			log.Printf("Stats: initialized total_views = %d from DB (first boot)", count)
		} else {
			val, _ := config.RDB.Get(config.Ctx, keyTotalViews).Int()
			log.Printf("Stats: total_views = %d from Redis", val)
		}
	}

	// Redis is used for global PV counter only; post view_count writes directly to DB
}

// MarkOnline marks a visitor as online (5 min TTL)
func MarkOnline(visitorID, ip, path string) {
	if config.RDB == nil || (visitorID == "" && ip == "") {
		return
	}
	key := visitorID
	if key == "" { key = ip }
	// Store as hash: visitor info
	config.RDB.HSet(config.Ctx, keyOnlinePrefix+key, map[string]interface{}{
		"visitor_id": visitorID,
		"ip":         ip,
		"path":       path,
		"ts":         fmt.Sprintf("%d", time.Now().Unix()),
	})
	config.RDB.Expire(config.Ctx, keyOnlinePrefix+key, 5*time.Minute)
}

// GetOnlineUsers returns list of currently online visitors
func GetOnlineUsers() []map[string]string {
	if config.RDB == nil {
		return nil
	}
	var result []map[string]string
	iter := config.RDB.Scan(config.Ctx, 0, keyOnlinePrefix+"*", 500).Iterator()
	for iter.Next(config.Ctx) {
		key := iter.Val()
		data := config.RDB.HGetAll(config.Ctx, key).Val()
		if len(data) > 0 {
			result = append(result, data)
		}
	}
	return result
}
