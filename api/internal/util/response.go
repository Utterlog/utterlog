package util

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *APIError   `json:"error,omitempty"`
	Meta    *APIMeta    `json:"meta,omitempty"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type APIMeta struct {
	RequestID  string `json:"request_id"`
	Timestamp  string `json:"timestamp"`
	Total      *int   `json:"total,omitempty"`
	Page       *int   `json:"page,omitempty"`
	PerPage    *int   `json:"per_page,omitempty"`
	TotalPages *int   `json:"total_pages,omitempty"`
	HasMore    *bool  `json:"has_more,omitempty"`
}

func meta() *APIMeta {
	return &APIMeta{
		RequestID: uuid.New().String(),
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    data,
		Meta:    meta(),
	})
}

func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, APIResponse{
		Success: false,
		Error:   &APIError{Code: code, Message: message},
		Meta:    meta(),
	})
}

func Paginate(c *gin.Context, data interface{}, total, page, perPage int) {
	totalPages := (total + perPage - 1) / perPage
	hasMore := page < totalPages
	m := meta()
	m.Total = &total
	m.Page = &page
	m.PerPage = &perPage
	m.TotalPages = &totalPages
	m.HasMore = &hasMore
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    data,
		Meta:    m,
	})
}

func NotFound(c *gin.Context, resource string) {
	Error(c, http.StatusNotFound, "NOT_FOUND", resource+" not found")
}

func Unauthorized(c *gin.Context, message string) {
	Error(c, http.StatusUnauthorized, "UNAUTHORIZED", message)
}

func BadRequest(c *gin.Context, message string) {
	Error(c, http.StatusBadRequest, "BAD_REQUEST", message)
}
