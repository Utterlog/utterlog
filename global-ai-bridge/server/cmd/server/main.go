package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gentpan/ai-bridge/internal/config"
	apphttp "github.com/gentpan/ai-bridge/internal/http"
)

func main() {
	var staticPath string
	flag.StringVar(&staticPath, "static", "./static", "Path to static files directory")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	// 确保数据目录存在
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}
	log.Printf("data directory: %s", cfg.DataDir)

	// 检查邮件配置
	if cfg.EmailProvider != "" && cfg.EmailAPIKey != "" {
		log.Printf("email provider: %s", cfg.EmailProvider)
		log.Printf("email from: %s", cfg.EmailFromAddr)
	} else {
		log.Printf("email service: disabled (configure EMAIL_PROVIDER and EMAIL_API_KEY to enable)")
	}

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           apphttp.NewServerWithStatic(cfg, staticPath),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown error: %v", err)
		}
	}()

	log.Printf("ai bridge gateway listening on %s", cfg.ListenAddr)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("listen: %v", err)
	}
}
