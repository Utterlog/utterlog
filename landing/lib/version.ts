// Single source of truth for the landing hero badge version label.
// Read straight from landing/package.json so a `bump-version` pass
// (package.json, api/admin/package.json, web/package.json, theme.json,
// Dockerfile.prod ARG) automatically updates utterlog.io hero text too —
// no separate edit needed here every release.
import pkg from '../package.json';

export const CURRENT_VERSION: string = pkg.version;

// "BETA · v1.0.3" — drop BETA once we settle on GA; leaving it in place
// for now since we're still on the 1.0.x fast-iteration train.
export const HERO_BADGE = `BETA · v${CURRENT_VERSION}`;
