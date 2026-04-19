package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"utterlog-go/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type Storage interface {
	Upload(path string, data io.Reader, contentType string) (url string, err error)
	Delete(path string) error
	URL(path string) string
}

var Default Storage

// NewLocalStorage returns a LocalStorage instance for the default public/uploads path
func NewLocalStorage() *LocalStorage {
	return &LocalStorage{baseDir: "public/uploads", baseURL: config.C.AppURL + "/uploads"}
}

// NewS3IfConfigured returns a new S3Storage if credentials are configured, else nil
func NewS3IfConfigured() *S3Storage {
	applyOptionsOverride()
	if config.C.S3Bucket != "" && config.C.S3AccessKey != "" {
		return newS3Storage()
	}
	return nil
}

func Init() {
	// Options table can override env vars for storage config
	applyOptionsOverride()

	if (config.C.StorageDriver == "s3" || config.C.StorageDriver == "r2") && config.C.S3Bucket != "" {
		if s := newS3Storage(); s != nil {
			Default = s
			return
		}
	}
	Default = &LocalStorage{
		baseDir: "public/uploads",
		baseURL: config.PublicBaseURL() + "/uploads",
	}
}

func applyOptionsOverride() {
	if config.DB == nil {
		return
	}
	t := config.C.DBPrefix + "options"
	get := func(key string) string {
		var val string
		config.DB.Get(&val, fmt.Sprintf("SELECT COALESCE(value,'') FROM %s WHERE name = $1", t), key)
		return val
	}
	if v := get("media_driver"); v != "" {
		config.C.StorageDriver = v
	}
	if v := get("s3_endpoint"); v != "" {
		config.C.S3Endpoint = v
	}
	if v := get("s3_bucket"); v != "" {
		config.C.S3Bucket = v
	}
	if v := get("s3_access_key"); v != "" {
		config.C.S3AccessKey = v
	}
	if v := get("s3_secret_key"); v != "" {
		config.C.S3SecretKey = v
	}
	if v := get("s3_region"); v != "" {
		config.C.S3Region = v
	}
	if v := get("s3_custom_domain"); v != "" {
		config.C.S3PublicURL = v
	}
}

// ValidFolders is the set of allowed upload folder names
var ValidFolders = map[string]bool{
	"covers": true, "avatars": true, "albums": true,
	"books": true, "movies": true, "music": true,
	"links": true, "moments": true, "pages": true,
}

// FlatFolders are folders that store files directly without date subdirectories
var FlatFolders = map[string]bool{
	"avatars": true,
}

// GeneratePath creates a file path: [folder/][YYYY/MM/]hex.ext
// Flat folders (avatars) skip the date prefix.
func GeneratePath(ext string, folder ...string) string {
	randBytes := make([]byte, 8)
	rand.Read(randBytes)
	hash := hex.EncodeToString(randBytes)
	if len(folder) > 0 && ValidFolders[folder[0]] {
		if FlatFolders[folder[0]] {
			return folder[0] + "/" + hash + "." + ext
		}
		return folder[0] + "/" + time.Now().Format("2006/01") + "/" + hash + "." + ext
	}
	return time.Now().Format("2006/01/02") + "/" + hash + "." + ext
}

// --- Local Storage ---

type LocalStorage struct {
	baseDir string
	baseURL string
}

func (l *LocalStorage) Upload(path string, data io.Reader, contentType string) (string, error) {
	fullPath := filepath.Join(l.baseDir, path)
	os.MkdirAll(filepath.Dir(fullPath), 0755)
	f, err := os.Create(fullPath)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(f, data); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return l.URL(path), nil
}

func (l *LocalStorage) Delete(path string) error {
	return os.Remove(filepath.Join(l.baseDir, path))
}

func (l *LocalStorage) URL(path string) string {
	return l.baseURL + "/" + path
}

// --- S3/R2 Storage ---

type S3Storage struct {
	client    *s3.Client
	bucket    string
	publicURL string
}

func newS3Storage() *S3Storage {
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(config.C.S3Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			config.C.S3AccessKey, config.C.S3SecretKey, "",
		)),
	)
	if err != nil {
		fmt.Printf("S3 config error: %v, falling back to local\n", err)
		return nil
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if config.C.S3Endpoint != "" {
			o.BaseEndpoint = aws.String(config.C.S3Endpoint)
		}
	})

	publicURL := config.C.S3PublicURL
	if publicURL == "" {
		publicURL = strings.TrimRight(config.C.S3Endpoint, "/") + "/" + config.C.S3Bucket
	}

	return &S3Storage{client: client, bucket: config.C.S3Bucket, publicURL: publicURL}
}

func (s *S3Storage) Upload(path string, data io.Reader, contentType string) (string, error) {
	buf, err := io.ReadAll(data)
	if err != nil {
		return "", fmt.Errorf("read data: %w", err)
	}

	key := "uploads/" + path
	_, err = s.client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(buf),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("s3 upload: %w", err)
	}

	return s.URL(path), nil
}

func (s *S3Storage) Delete(path string) error {
	key := "uploads/" + path
	_, err := s.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *S3Storage) URL(path string) string {
	return strings.TrimRight(s.publicURL, "/") + "/uploads/" + path
}

// TestConnection validates S3/R2 credentials by listing bucket objects
func TestConnection(endpoint, region, bucket, accessKey, secretKey string) error {
	if region == "" {
		region = "auto"
	}
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
		}
	})

	maxKeys := int32(1)
	_, err = client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:  aws.String(bucket),
		MaxKeys: &maxKeys,
	})
	if err != nil {
		return fmt.Errorf("bucket access: %w", err)
	}
	return nil
}
