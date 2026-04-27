package handler

import (
	"utterlog-go/internal/i18n"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

func ListLocales(c *gin.Context) {
	util.Success(c, i18n.ListLocales())
}

func GetLocale(c *gin.Context) {
	locale := c.Param("locale")
	if locale == "current" {
		locale = model.GetOption("site_locale")
	}
	util.Success(c, i18n.Load(locale))
}
