package model

import (
	"crypto/md5"
	"fmt"
	"strings"
	"utterlog-go/config"
)

type User struct {
	ID              int     `db:"id" json:"id"`
	Username        string  `db:"username" json:"username"`
	Email           string  `db:"email" json:"email"`
	Password        string  `db:"password" json:"-"`
	Nickname        *string `db:"nickname" json:"nickname"`
	Avatar          *string `db:"avatar" json:"avatar"`
	UtterlogID      *string `db:"utterlog_id" json:"utterlog_id,omitempty"`
	UtterlogAvatar  *string `db:"utterlog_avatar" json:"utterlog_avatar,omitempty"`
	Role            string  `db:"role" json:"role"`
	URL             *string `db:"url" json:"url,omitempty"`
	Bio             *string `db:"bio" json:"bio,omitempty"`
	TOTPSecret      string  `db:"totp_secret" json:"-"`
	TOTPEnabled     bool    `db:"totp_enabled" json:"totp_enabled"`
	TOTPBackupCodes string  `db:"totp_backup_codes" json:"-"`
	CreatedAt       int64   `db:"created_at" json:"created_at"`
	UpdatedAt       int64   `db:"updated_at" json:"updated_at"`
}

const userColumns = "id, username, email, password, nickname, avatar, COALESCE(utterlog_id,'') as utterlog_id, COALESCE(utterlog_avatar,'') as utterlog_avatar, role, url, bio, totp_secret, totp_enabled, totp_backup_codes, created_at, updated_at"

func UserByID(id int) (*User, error) {
	var u User
	err := config.DB.Get(&u, "SELECT "+userColumns+" FROM "+config.T("users")+" WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func UserByEmail(email string) (*User, error) {
	var u User
	err := config.DB.Get(&u, "SELECT "+userColumns+" FROM "+config.T("users")+" WHERE email = $1", email)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (u *User) NicknameStr() string {
	if u.Nickname != nil {
		return *u.Nickname
	}
	return u.Username
}

// AvatarURL returns the unified avatar URL for this user.
//
// Source of truth: the site-wide `avatar_source` option set in Profile (基本信息).
//   - "utterlog"  -> https://id.utterlog.com/avatar/<emailHash>
//   - "gravatar"  -> https://gravatar.bluecdn.com/avatar/<emailHash>?s=128&d=mp  (default)
//
// All server-side rendering of avatars (post author, comments, federation, totp,
// passkey, etc.) MUST call this to stay consistent with the user's chosen source.
func (u *User) AvatarURL() string {
	return ResolveAvatarByEmail(u.Email)
}

// ResolveAvatarByEmail returns an avatar URL for an email based on the
// site-wide `avatar_source` option. Use this when you don't have a full User.
func ResolveAvatarByEmail(email string) string {
	hash := fmt.Sprintf("%x", md5.Sum([]byte(strings.TrimSpace(strings.ToLower(email)))))
	if GetOption("avatar_source") == "utterlog" {
		return "https://id.utterlog.com/avatar/" + hash
	}
	return "https://gravatar.bluecdn.com/avatar/" + hash + "?s=128&d=mp"
}

// UtterlogIDStr returns the utterlog_id string (empty if unset).
func (u *User) UtterlogIDStr() string {
	if u.UtterlogID != nil {
		return *u.UtterlogID
	}
	return ""
}

// SiteOwner returns the first admin user (site owner for single-user blog).
func SiteOwner() (*User, error) {
	var u User
	err := config.DB.Get(&u, "SELECT "+userColumns+" FROM "+config.T("users")+" WHERE role = 'admin' ORDER BY id LIMIT 1")
	if err != nil {
		return nil, err
	}
	return &u, nil
}
