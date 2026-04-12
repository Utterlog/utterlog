package model

import (
	"utterlog-go/config"
)

type User struct {
	ID        int     `db:"id" json:"id"`
	Username  string  `db:"username" json:"username"`
	Email     string  `db:"email" json:"email"`
	Password  string  `db:"password" json:"-"`
	Nickname  *string `db:"nickname" json:"nickname"`
	Avatar    *string `db:"avatar" json:"avatar"`
	Role      string  `db:"role" json:"role"`
	URL       *string `db:"url" json:"url,omitempty"`
	Bio       *string `db:"bio" json:"bio,omitempty"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
	UpdatedAt int64   `db:"updated_at" json:"updated_at"`
}

const userColumns = "id, username, email, password, nickname, avatar, role, url, bio, created_at, updated_at"

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
