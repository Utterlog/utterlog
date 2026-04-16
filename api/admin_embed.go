package main

import "embed"

// adminDist is the compiled React SPA for /admin/*.
// The `all:` prefix is important — it includes hidden files (like Vite's assets).
// This directive runs at Go compile time; if admin/dist/ doesn't exist yet,
// the build will fail with a clear error. See scripts/build.sh for the full pipeline.
//
// Build flow:
//   1. cd api/admin && npm run build   →  populates api/admin/dist/
//   2. cd api && go build              →  bakes dist/ into the binary via this directive
//
//go:embed all:admin/dist
var adminDistFS embed.FS
