package config

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client
var Ctx = context.Background()

func InitRedis() {
	RDB = redis.NewClient(&redis.Options{
		Addr:     C.RedisAddr,
		Password: C.RedisPass,
		DB:       C.RedisDB,
	})

	if err := RDB.Ping(Ctx).Err(); err != nil {
		log.Printf("Redis connection failed: %v (stats will use DB fallback)", err)
		RDB = nil
		return
	}
	log.Println("Redis connected")
}
