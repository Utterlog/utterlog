package handler

import (
	"testing"
	"time"

	"utterlog-go/internal/model"
)

func TestBuildPostPermalinkUsesDisplayID(t *testing.T) {
	post := &model.Post{
		ID:        42,
		DisplayID: 7,
		Slug:      "hello world",
	}

	got := BuildPostPermalink(post, "/archives/%display_id%")
	if got != "/archives/7" {
		t.Fatalf("BuildPostPermalink() = %q, want %q", got, "/archives/7")
	}
}

func TestBuildPostPermalinkUsesPublishedAtBeforeCreatedAt(t *testing.T) {
	publishedAt := time.Date(2024, 4, 5, 12, 0, 0, 0, time.UTC)
	createdAt := time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC).Unix()
	post := &model.Post{
		ID:          42,
		DisplayID:   7,
		Slug:        "hello world",
		CreatedAt:   createdAt,
		PublishedAt: &publishedAt,
	}

	got := BuildPostPermalink(post, "/%year%/%month%/%day%/%postname%")
	want := "/2024/04/05/hello%20world"
	if got != want {
		t.Fatalf("BuildPostPermalink() = %q, want %q", got, want)
	}
}
