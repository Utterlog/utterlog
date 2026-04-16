package main

import (
	"log"
	"utterlog-go/config"
	"utterlog-go/internal/handler"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/storage"

	"github.com/gin-gonic/gin"
)

func main() {
	config.Load()
	config.InitDB()
	config.InitRedis()
	storage.Init()
	handler.InitStatsSync()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(middleware.Logger(), middleware.CORS(), gin.Recovery())
	r.MaxMultipartMemory = 64 << 20 // 64MB max upload

	// Static files
	r.Static("/uploads", "./public/uploads")
	r.Static("/themes", "./public/themes") // theme preview assets (screenshot.svg etc.)

	// Branding files at root (logo, dark-logo, favicon)
	r.GET("/logo.:ext", func(c *gin.Context) { c.File("./public/logo." + c.Param("ext")) })
	r.GET("/dark-logo.:ext", func(c *gin.Context) { c.File("./public/dark-logo." + c.Param("ext")) })
	r.GET("/favicon.:ext", func(c *gin.Context) { c.File("./public/favicon." + c.Param("ext")) })

	// Admin SPA — embedded Vite build at api/admin/dist, served at /admin/*
	adminHandler := ServeAdmin(adminDistFS)
	r.GET("/admin", func(c *gin.Context) { c.Redirect(301, "/admin/") })
	r.GET("/admin/*filepath", adminHandler)

	api := r.Group("/api/v1")

	// Security middleware
	r.Use(handler.CCProtection())
	r.Use(handler.GeoIPBlocking())
	r.Use(handler.AccessLogger())

	// Health
	api.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"success": true, "data": gin.H{"status": "ok", "version": "1.0.0-go"}})
	})

	// ===================== Install Wizard (public, unauth) =====================
	install := api.Group("/install")
	install.GET("/status", handler.InstallStatus)
	install.POST("/create-admin", handler.InstallCreateAdmin)
	install.POST("/finish", handler.InstallFinish)

	// ===================== Auth =====================
	auth := api.Group("/auth")
	auth.POST("/login", handler.Login)
	auth.POST("/refresh", handler.Refresh)
	auth.POST("/logout", middleware.Auth(), handler.Logout)
	auth.GET("/me", middleware.Auth(), handler.Me)
	auth.PUT("/password", middleware.Auth(), handler.ChangePassword)

	// 2FA (TOTP)
	auth.POST("/totp/setup", middleware.Auth(), handler.TOTPSetup)
	auth.POST("/totp/verify", middleware.Auth(), handler.TOTPVerify)
	auth.POST("/totp/disable", middleware.Auth(), handler.TOTPDisable)
	auth.POST("/totp/validate", handler.TOTPValidate)

	// Passkeys (WebAuthn)
	auth.POST("/passkey/register/begin", middleware.Auth(), handler.PasskeyRegisterBegin)
	auth.POST("/passkey/register/finish", middleware.Auth(), handler.PasskeyRegisterFinish)
	auth.POST("/passkey/login/begin", handler.PasskeyLoginBegin)
	auth.POST("/passkey/login/finish", handler.PasskeyLoginFinish)

	// ===================== Public Routes =====================
	// Posts
	api.GET("/posts", middleware.OptionalAuth(), handler.ListPosts)
	api.GET("/posts/:id", middleware.OptionalAuth(), handler.GetPost)
	api.GET("/posts/slug/:slug", middleware.OptionalAuth(), handler.GetPostBySlug)
	api.GET("/posts/:id/navigation", handler.PostNavigation)

	// Categories & Tags
	api.GET("/categories", handler.ListCategories)
	api.GET("/categories/:id", handler.GetCategory)
	api.GET("/tags", handler.ListTags)
	api.GET("/tags/:id", handler.GetTag)

	// Albums (public)
	api.GET("/public/albums", handler.PublicAlbums)
	api.GET("/public/albums/:id", handler.PublicAlbumDetail)

	// Passport (Utterlog Network identity)
	api.POST("/passport/identify", handler.IdentifyPassport)

	// Comments (public read + submit)
	api.GET("/comments", handler.ListComments)
	api.POST("/comments", middleware.OptionalAuth(), handler.CreateComment)
	api.PUT("/comments/:id/edit", handler.EditComment)
	api.GET("/captcha/challenge", handler.CaptchaChallenge)
	api.GET("/captcha/image", handler.ImageCaptchaChallenge)

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
	api.GET("/games", handler.GenericList("games"))
	api.GET("/games/:id", handler.GenericGet("games"))
	api.GET("/videos", handler.GenericList("videos"))
	api.GET("/videos/:id", handler.GenericGet("videos"))
	api.GET("/goods", handler.GenericList("goods"))
	api.GET("/goods/:id", handler.GenericGet("goods"))
	api.GET("/links", handler.GenericList("links"))
	api.GET("/links/:id", handler.GenericGet("links"))
	api.POST("/links/apply", handler.ApplyLink)
	api.GET("/playlists", handler.GenericList("playlists"))
	api.GET("/playlists/:id", handler.PlaylistSongs)

	// Site owner (public profile)
	api.GET("/owner", handler.GetSiteOwner)

	// Archive stats
	api.GET("/archive/stats", handler.ArchiveStats)

	// Page view tracking (public)
	api.POST("/track", handler.TrackPageView)
	api.POST("/track/duration", handler.TrackDuration)

	// Online count (public, no user details)
	api.GET("/online", handler.OnlineCount)

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

	// Utterlog Network (public)
	api.GET("/network/content", handler.ShareableContent)
	api.GET("/network/oauth/callback", handler.OAuthCallback)

	// Telegram webhook (public — called by Telegram servers)
	api.POST("/telegram/webhook", handler.TelegramWebhook)

	// Search (public)
	api.GET("/search", handler.SemanticSearch)

	// AI Reader Chat (public)
	api.POST("/ai/reader-chat", handler.AIReaderChat)

	// Annotations (段落点评)
	api.GET("/annotations", handler.ListAnnotations)
	api.POST("/annotations", middleware.OptionalAuth(), handler.CreateAnnotation)

	// Media EXIF query (public)
	api.GET("/media/exif", handler.GetMediaExif)

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
		authed.POST("/comments/:id/reply", handler.ReplyComment)
		authed.GET("/comments/pending-count", handler.PendingCommentCount)
		authed.DELETE("/comments/:id", handler.DeleteCommentHandler)

		// Annotations (段落点评) management
		authed.GET("/admin/annotations", handler.AdminListAnnotations)
		authed.DELETE("/admin/annotations/:id", handler.AdminDeleteAnnotation)
		authed.POST("/admin/annotations/batch-delete", handler.AdminBatchDeleteAnnotations)

		// Links CRUD
		authed.POST("/links", handler.CreateLink)
		authed.PUT("/links/:id", handler.UpdateLink)
		authed.DELETE("/links/:id", handler.GenericDelete("links"))

		// Options
		authed.PUT("/options", handler.UpdateOptions)
		authed.POST("/options", handler.UpdateOptions)

		// ===================== Themes & Plugins (extensions) =====================
		authed.GET("/themes", handler.ListThemes)
		authed.POST("/themes/upload", handler.UploadExtension(handler.KindTheme))
		authed.POST("/themes/:id/activate", handler.ActivateExtension(handler.KindTheme))
		authed.DELETE("/themes/:id", handler.DeleteExtension(handler.KindTheme))

		authed.GET("/plugins", handler.ListPlugins)
		authed.POST("/plugins/upload", handler.UploadExtension(handler.KindPlugin))
		authed.POST("/plugins/:id/activate", handler.ActivateExtension(handler.KindPlugin))
		authed.POST("/plugins/:id/deactivate", handler.DeactivateExtension(handler.KindPlugin))
		authed.DELETE("/plugins/:id", handler.DeleteExtension(handler.KindPlugin))

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

		authed.POST("/games", handler.ContentCreate("games"))
		authed.PUT("/games/:id", handler.ContentUpdate("games"))
		authed.DELETE("/games/:id", handler.GenericDelete("games"))

		authed.POST("/videos", handler.ContentCreate("videos"))
		authed.PUT("/videos/:id", handler.ContentUpdate("videos"))
		authed.DELETE("/videos/:id", handler.GenericDelete("videos"))

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
		authed.GET("/media/stats", handler.MediaStats)
		authed.POST("/media/upload", handler.UploadMedia)
		authed.POST("/media/upload-branding", handler.UploadBranding)
		authed.POST("/media/download-url", handler.DownloadFromURL)
		authed.DELETE("/media/:id", handler.DeleteMedia)
		authed.POST("/media/test-connection", handler.TestStorageConnection)

		// Albums
		authed.GET("/albums", handler.ListAlbums)
		authed.GET("/albums/:id", handler.GetAlbum)
		authed.POST("/albums", handler.CreateAlbum)
		authed.PUT("/albums/:id", handler.UpdateAlbum)
		authed.DELETE("/albums/:id", handler.DeleteAlbum)
		authed.GET("/albums/:id/photos", handler.AlbumPhotos)
		authed.POST("/albums/:id/photos", handler.AddPhotosToAlbum)
		authed.DELETE("/albums/:id/photos/:mediaId", handler.RemovePhotoFromAlbum)

		// Notifications
		authed.GET("/notifications", handler.ListNotifications)
		authed.GET("/notifications/unread-count", handler.UnreadNotificationCount)
		authed.POST("/notifications/:id/read", handler.MarkNotificationRead)
		authed.POST("/notifications/read-all", handler.MarkAllNotificationsRead)
		authed.DELETE("/notifications/:id", handler.DeleteNotification)

		// Profile
		authed.GET("/profile", handler.GetProfile)
		authed.PUT("/profile", handler.UpdateProfile)
		authed.POST("/profile/send-code", handler.SendVerifyCode)

		// Passkeys management
		authed.GET("/passkeys", handler.ListPasskeys)
		authed.DELETE("/passkeys/:id", handler.DeletePasskey)

		// Test email
		authed.POST("/options/test-email", handler.TestEmail)

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
		authed.GET("/analytics/visitors", handler.RecentVisitors)
		authed.GET("/analytics/online", handler.OnlineUsers)
		authed.GET("/analytics/geoip", handler.GeoIPLookup)
		authed.GET("/analytics/map", handler.VisitorMapData)
		authed.POST("/analytics/enrich-geoip", handler.EnrichGeoIP)
		authed.GET("/dashboard/stats", handler.DashboardStats)

		// Telegram management
		authed.POST("/telegram/test", handler.TelegramTest)
		authed.POST("/telegram/get-chat-id", handler.TelegramGetChatID)
		authed.POST("/telegram/setup-webhook", handler.TelegramSetupWebhook)


		// Utterlog Network
		authed.GET("/network/status", handler.GetNetworkStatus)
		authed.POST("/network/push-info", handler.PushSiteInfo)
		authed.GET("/network/feed", handler.GetNetworkFeed)
		authed.GET("/network/sites", handler.GetNetworkSites)
		authed.POST("/network/subscribe", handler.SubscribeSite)
		authed.POST("/network/unsubscribe", handler.UnsubscribeSite)
		authed.GET("/network/subscriptions", handler.ListSubscriptions)
		authed.GET("/network/pull-content", handler.PullContent)
		authed.POST("/network/publish-notify", handler.PublishNotify)
		authed.POST("/network/bind-utterlog-id", handler.BindUtterlogID)
		authed.POST("/network/unbind-utterlog-id", handler.UnbindUtterlogID)
		authed.GET("/network/utterlog-profile", handler.GetUtterlogProfile)
		authed.GET("/network/oauth/authorize", handler.OAuthAuthorize)

		// Import
		authed.POST("/import/wordpress", handler.ImportWordPressHandler)
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
		authed.POST("/ai/tags", handler.AITags)
		authed.POST("/ai/batch-questions", handler.AIBatchQuestions)
		authed.POST("/ai/batch-summary", handler.AIBatchSummary)
		authed.POST("/ai/batch-all", handler.AIBatchAll)
		authed.GET("/ai/batch-status", handler.AIBatchStatus)
		authed.POST("/media/parse", handler.ParseMediaURL)
		authed.POST("/media/douban-import", handler.DoubanImport)
		authed.POST("/ai/format", handler.AIFormat)
		authed.GET("/ai/logs", handler.AILogs)
		authed.GET("/ai/stats", handler.AIStats)
		authed.POST("/ai/query", handler.AIQuery)

		// Search management
		authed.POST("/search/rebuild", handler.RebuildEmbeddings)

	}

	port := config.C.Port
	log.Printf("Utterlog Go server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
