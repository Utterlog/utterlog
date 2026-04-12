package main

import (
	"log"
	"utterlog-go/config"
	"utterlog-go/internal/handler"
	"utterlog-go/internal/middleware"

	"github.com/gin-gonic/gin"
)

func main() {
	config.Load()
	config.InitDB()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(middleware.Logger(), middleware.CORS(), gin.Recovery())
	r.MaxMultipartMemory = 64 << 20 // 64MB max upload

	// Static files
	r.Static("/uploads", "./public/uploads")

	api := r.Group("/api/v1")

	// Security middleware
	r.Use(handler.CCProtection())
	r.Use(handler.GeoIPBlocking())
	r.Use(handler.AccessLogger())

	// Health
	api.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"success": true, "data": gin.H{"status": "ok", "version": "1.0.0-go"}})
	})

	// ===================== Auth =====================
	auth := api.Group("/auth")
	auth.POST("/login", handler.Login)
	auth.POST("/refresh", handler.Refresh)
	auth.POST("/logout", middleware.Auth(), handler.Logout)
	auth.GET("/me", middleware.Auth(), handler.Me)
	auth.PUT("/password", middleware.Auth(), handler.ChangePassword)

	// ===================== Public Routes =====================
	// Posts
	api.GET("/posts", middleware.OptionalAuth(), handler.ListPosts)
	api.GET("/posts/:id", middleware.OptionalAuth(), handler.GetPost)
	api.GET("/posts/slug/:slug", middleware.OptionalAuth(), handler.GetPostBySlug)

	// Categories & Tags
	api.GET("/categories", handler.ListCategories)
	api.GET("/categories/:id", handler.GetCategory)
	api.GET("/tags", handler.ListTags)
	api.GET("/tags/:id", handler.GetTag)

	// Comments (public read)
	api.GET("/comments", handler.ListComments)
	api.POST("/comments", handler.CreateComment) // public comment submission

	// Options
	api.GET("/options", handler.ListOptions)

	// Content types (public read)
	api.GET("/moments", handler.GenericList("moments"))
	api.GET("/moments/:id", handler.GenericGet("moments"))
	api.GET("/music", handler.GenericList("music"))
	api.GET("/music/:id", handler.GenericGet("music"))
	api.GET("/movies", handler.GenericList("movies"))
	api.GET("/movies/:id", handler.GenericGet("movies"))
	api.GET("/books", handler.GenericList("books"))
	api.GET("/books/:id", handler.GenericGet("books"))
	api.GET("/goods", handler.GenericList("goods"))
	api.GET("/goods/:id", handler.GenericGet("goods"))
	api.GET("/links", handler.GenericList("links"))
	api.GET("/links/:id", handler.GenericGet("links"))
	api.GET("/playlists", handler.GenericList("playlists"))
	api.GET("/playlists/:id", handler.PlaylistSongs)

	// RSS Feeds
	api.GET("/feed", handler.PostsFeed)
	api.GET("/memos/feed", handler.MemosFeed)

	// System
	api.GET("/system/status", handler.SystemStatus)

	// Federation (public)
	api.GET("/federation/metadata", handler.FederationMetadata)
	api.POST("/federation/follow", handler.ReceiveFollow)
	api.POST("/federation/verify", handler.VerifyFederationToken)

	// Comments (public submit with optional federation auth)
	api.POST("/comments/federated", handler.FederatedComment)

	// Webhook receiver (from followed sites)
	api.POST("/federation/webhook", handler.ReceiveWebhook)

	// Telegram webhook (public — called by Telegram servers)
	api.POST("/telegram/webhook", handler.TelegramWebhook)

	// RSS parse
	api.GET("/rss/parse", handler.ParseRSS)

	// ===================== Authenticated Routes =====================
	authed := api.Group("", middleware.Auth())
	{
		// Posts CRUD
		authed.POST("/posts", handler.CreatePost)
		authed.PUT("/posts/:id", handler.UpdatePost)
		authed.DELETE("/posts/:id", handler.DeletePostHandler)

		// Categories CRUD
		authed.POST("/categories", handler.CreateCategory)
		authed.PUT("/categories/:id", handler.UpdateCategory)
		authed.DELETE("/categories/:id", handler.DeleteCategory)

		// Tags CRUD
		authed.POST("/tags", handler.CreateTag)
		authed.PUT("/tags/:id", handler.UpdateTag)
		authed.DELETE("/tags/:id", handler.DeleteTag)

		// Comments management
		authed.PUT("/comments/:id", handler.UpdateComment)
		authed.PATCH("/comments/:id/approve", handler.ApproveComment)
		authed.DELETE("/comments/:id", handler.DeleteCommentHandler)

		// Links CRUD
		authed.POST("/links", handler.CreateLink)
		authed.PUT("/links/:id", handler.UpdateLink)
		authed.DELETE("/links/:id", handler.GenericDelete("links"))

		// Options
		authed.PUT("/options", handler.UpdateOptions)
		authed.POST("/options", handler.UpdateOptions)

		// Content types CRUD
		authed.POST("/moments", handler.ContentCreate("moments"))
		authed.PUT("/moments/:id", handler.ContentUpdate("moments"))
		authed.DELETE("/moments/:id", handler.GenericDelete("moments"))

		authed.POST("/music", handler.ContentCreate("music"))
		authed.PUT("/music/:id", handler.ContentUpdate("music"))
		authed.DELETE("/music/:id", handler.GenericDelete("music"))

		authed.POST("/movies", handler.ContentCreate("movies"))
		authed.PUT("/movies/:id", handler.ContentUpdate("movies"))
		authed.DELETE("/movies/:id", handler.GenericDelete("movies"))

		authed.POST("/books", handler.ContentCreate("books"))
		authed.PUT("/books/:id", handler.ContentUpdate("books"))
		authed.DELETE("/books/:id", handler.GenericDelete("books"))

		authed.POST("/goods", handler.ContentCreate("goods"))
		authed.PUT("/goods/:id", handler.ContentUpdate("goods"))
		authed.DELETE("/goods/:id", handler.GenericDelete("goods"))

		// Playlists
		authed.POST("/playlists", handler.ContentCreate("playlists"))
		authed.PUT("/playlists/:id", handler.ContentUpdate("playlists"))
		authed.DELETE("/playlists/:id", handler.GenericDelete("playlists"))
		authed.POST("/playlists/:id/songs", handler.AddSongToPlaylist)
		authed.DELETE("/playlists/:id/songs", handler.RemoveSongFromPlaylist)

		// Media
		authed.GET("/media", handler.ListMedia)
		authed.POST("/media/upload", handler.UploadMedia)
		authed.DELETE("/media/:id", handler.DeleteMedia)

		// Notifications
		authed.GET("/notifications", handler.ListNotifications)
		authed.GET("/notifications/unread-count", handler.UnreadNotificationCount)
		authed.POST("/notifications/:id/read", handler.MarkNotificationRead)
		authed.POST("/notifications/read-all", handler.MarkAllNotificationsRead)
		authed.DELETE("/notifications/:id", handler.DeleteNotification)

		// Profile
		authed.PUT("/profile", handler.UpdateProfile)

		// Federation
		authed.POST("/federation/token", handler.GenerateFederationToken)
		authed.POST("/social/follow", handler.FollowSite)
		authed.POST("/social/unfollow", handler.UnfollowSite)
		authed.GET("/social/follow-status", handler.FollowStatus)
		authed.GET("/social/following", handler.ListFollowing)
		authed.GET("/social/management", handler.FollowManagement)
		authed.GET("/social/feed-timeline", handler.FeedTimeline)
		authed.POST("/social/fetch-feeds", handler.FetchFeeds)
		authed.GET("/system/update-check", handler.CheckSystemUpdate)

		// Security
		authed.GET("/security/overview", handler.SecurityOverview)
		authed.GET("/security/settings", handler.GetSecuritySettings)
		authed.POST("/security/settings", handler.UpdateSecuritySettings)
		authed.GET("/security/bans", handler.ListBans)
		authed.POST("/security/ban", handler.BanIP)
		authed.POST("/security/unban", handler.UnbanIP)
		authed.GET("/security/reputation", handler.ListReputation)
		authed.POST("/security/reputation/reset", handler.ResetReputation)
		authed.GET("/security/timeline", handler.SecurityTimeline)

		// Backup
		authed.GET("/backup/stats", handler.BackupStats)
		authed.GET("/backup/list", handler.ListBackups)
		authed.POST("/backup/create", handler.CreateBackup)
		authed.POST("/backup/import", handler.ImportBackup)
		authed.GET("/backup/download/:filename", handler.DownloadBackup)
		authed.DELETE("/backup/:filename", handler.DeleteBackup)

		// Analytics
		authed.GET("/analytics", handler.AnalyticsOverview)
		authed.GET("/analytics/logs", handler.AccessLogs)
		authed.GET("/analytics/geoip", handler.GeoIPLookup)
		authed.POST("/analytics/enrich-geoip", handler.EnrichGeoIP)

		// Telegram management
		authed.POST("/telegram/test", handler.TelegramTest)
		authed.POST("/telegram/setup-webhook", handler.TelegramSetupWebhook)


		// Import
		authed.POST("/import/wordpress", handler.ImportWordPress)
		authed.POST("/import/typecho", handler.ImportTypecho)

		// ===================== AI =====================
		authed.GET("/ai/providers", handler.GetAIProviders)
		authed.POST("/ai/providers", handler.SaveAIProvider)
		authed.DELETE("/ai/providers/:id", handler.DeleteAIProvider)
		authed.POST("/ai/test", handler.TestAIConnection)
		authed.POST("/ai/chat", handler.AIChat)
		authed.GET("/ai/conversations", handler.ListAIConversations)
		authed.GET("/ai/conversations/:id", handler.GetAIConversation)
		authed.DELETE("/ai/conversations/:id", handler.DeleteAIConversation)
		authed.POST("/ai/slug", handler.AISlug)
		authed.POST("/ai/summary", handler.AISummary)
		authed.POST("/ai/format", handler.AIFormat)
		authed.GET("/ai/logs", handler.AILogs)
		authed.GET("/ai/stats", handler.AIStats)

	}

	port := config.C.Port
	log.Printf("Utterlog Go server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
