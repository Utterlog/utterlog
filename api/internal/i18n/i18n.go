package i18n

import (
	"embed"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const DefaultLocale = "zh-CN"

//go:embed locales/*.json
var builtinFS embed.FS

type LocalePack struct {
	Locale     string            `json:"locale"`
	Name       string            `json:"name"`
	NativeName string            `json:"native_name"`
	Direction  string            `json:"direction"`
	Version    string            `json:"version,omitempty"`
	Source     string            `json:"source,omitempty"`
	Messages   map[string]string `json:"messages"`
}

type LocaleMeta struct {
	Locale     string `json:"locale"`
	Name       string `json:"name"`
	NativeName string `json:"native_name"`
	Direction  string `json:"direction"`
	Source     string `json:"source"`
}

func NormalizeLocale(locale string) string {
	switch strings.ToLower(strings.TrimSpace(locale)) {
	case "zh", "zh-cn", "zh_hans", "zh-hans", "cn":
		return "zh-CN"
	case "en", "en-us", "en_us":
		return "en-US"
	case "ru", "ru-ru", "ru_ru":
		return "ru-RU"
	}
	if strings.TrimSpace(locale) == "" {
		return DefaultLocale
	}
	return strings.TrimSpace(locale)
}

func ListLocales() []LocaleMeta {
	packs := map[string]LocalePack{}
	for _, pack := range loadBuiltinPacks() {
		pack.Source = "builtin"
		packs[pack.Locale] = pack
	}
	for _, pack := range loadExternalPacks() {
		base := packs[pack.Locale]
		merged := mergePack(base, pack)
		merged.Source = "external"
		packs[pack.Locale] = merged
	}

	out := make([]LocaleMeta, 0, len(packs))
	for _, pack := range packs {
		out = append(out, LocaleMeta{
			Locale:     pack.Locale,
			Name:       pack.Name,
			NativeName: pack.NativeName,
			Direction:  pack.Direction,
			Source:     pack.Source,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Locale == DefaultLocale {
			return true
		}
		if out[j].Locale == DefaultLocale {
			return false
		}
		return out[i].Locale < out[j].Locale
	})
	return out
}

func Load(locale string) LocalePack {
	locale = NormalizeLocale(locale)
	base := loadBuiltinPack(DefaultLocale)
	selected := loadBuiltinPack(locale)
	pack := mergePack(base, selected)

	for _, external := range loadExternalPacks() {
		if external.Locale == DefaultLocale || external.Locale == locale {
			pack = mergePack(pack, external)
		}
	}
	if pack.Locale == "" {
		pack.Locale = DefaultLocale
	}
	if pack.Direction == "" {
		pack.Direction = "ltr"
	}
	return pack
}

func loadBuiltinPacks() []LocalePack {
	entries, err := fs.ReadDir(builtinFS, "locales")
	if err != nil {
		return nil
	}
	packs := make([]LocalePack, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := builtinFS.ReadFile("locales/" + entry.Name())
		if err != nil {
			continue
		}
		if pack, ok := parsePack(raw, strings.TrimSuffix(entry.Name(), ".json")); ok {
			packs = append(packs, pack)
		}
	}
	return packs
}

func loadBuiltinPack(locale string) LocalePack {
	locale = NormalizeLocale(locale)
	raw, err := builtinFS.ReadFile("locales/" + locale + ".json")
	if err != nil {
		return LocalePack{Locale: locale, Direction: "ltr", Messages: map[string]string{}}
	}
	pack, _ := parsePack(raw, locale)
	return pack
}

func loadExternalPacks() []LocalePack {
	dir := externalLocaleDir()
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	packs := make([]LocalePack, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		if pack, ok := parsePack(raw, strings.TrimSuffix(entry.Name(), ".json")); ok {
			packs = append(packs, pack)
		}
	}
	return packs
}

func externalLocaleDir() string {
	if dir := strings.TrimSpace(os.Getenv("UTTERLOG_LOCALE_DIR")); dir != "" {
		return dir
	}
	if installDir := strings.TrimSpace(os.Getenv("UTTERLOG_INSTALL_DIR")); installDir != "" {
		return filepath.Join(installDir, "locales")
	}
	return "locales"
}

func parsePack(raw []byte, fallbackLocale string) (LocalePack, bool) {
	var pack LocalePack
	if err := json.Unmarshal(raw, &pack); err != nil {
		return LocalePack{}, false
	}
	if pack.Locale == "" {
		pack.Locale = NormalizeLocale(fallbackLocale)
	} else {
		pack.Locale = NormalizeLocale(pack.Locale)
	}
	if pack.Direction == "" {
		pack.Direction = "ltr"
	}
	if pack.Messages == nil {
		pack.Messages = map[string]string{}
	}
	return pack, true
}

func mergePack(base, override LocalePack) LocalePack {
	out := base
	if out.Messages == nil {
		out.Messages = map[string]string{}
	}
	if override.Locale != "" {
		out.Locale = override.Locale
	}
	if override.Name != "" {
		out.Name = override.Name
	}
	if override.NativeName != "" {
		out.NativeName = override.NativeName
	}
	if override.Direction != "" {
		out.Direction = override.Direction
	}
	if override.Version != "" {
		out.Version = override.Version
	}
	for k, v := range override.Messages {
		out.Messages[k] = v
	}
	return out
}
