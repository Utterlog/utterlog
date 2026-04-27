package siteclock

import (
	"os"
	"strings"
	"time"

	"utterlog-go/internal/model"
)

const OptionName = "site_timezone"

// IsValid reports whether name is a valid IANA timezone accepted by Go.
func IsValid(name string) bool {
	name = strings.TrimSpace(name)
	if name == "" {
		return true
	}
	_, err := time.LoadLocation(name)
	return err == nil
}

// Name returns the configured site timezone. If it is not set, it falls back
// to the process' local timezone, then UTC when the local zone has no stable
// IANA name.
func Name() string {
	if configured := strings.TrimSpace(model.GetOption(OptionName)); configured != "" {
		if IsValid(configured) {
			return configured
		}
	}

	if envTZ := strings.TrimSpace(os.Getenv("TZ")); envTZ != "" && IsValid(envTZ) {
		return envTZ
	}

	if time.Local != nil {
		localName := strings.TrimSpace(time.Local.String())
		if localName != "" && localName != "Local" && IsValid(localName) {
			return localName
		}
	}

	return "UTC"
}

func Location() *time.Location {
	loc, err := time.LoadLocation(Name())
	if err == nil {
		return loc
	}
	return time.UTC
}

func Now() time.Time {
	return time.Now().In(Location())
}

func ParseDate(date string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", date, Location())
}

func TodayStartUnix() int64 {
	now := Now()
	loc := Location()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).Unix()
}
