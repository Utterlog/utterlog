# Asset Bundling Plan

This theme should stay split into source files during development and be merged only for production delivery.

## Current source layout

### CSS

- `assets/css/main.css`
- `assets/css/utilities.css`
- `assets/css/header.css`
- `assets/css/footer.css`
- `assets/css/page.css`
- `assets/css/single.css`
- `assets/css/comment.css`
- `assets/css/tasks.css`
- `assets/css/components/*.css`
- `assets/css/modules/*.css`
- `assets/css/pages/*.css`
- `style.css`

### JS

- `assets/js/utils.js`
- `assets/js/main.js`
- `assets/js/loading.js`
- `assets/js/nav.js`
- `assets/js/image.js`
- `assets/js/hero-animations.js`
- `assets/js/home.js`
- `assets/js/tasks.js`
- `assets/js/heatmap.js`
- `assets/js/single.js`
- `assets/js/comment.js`
- `assets/js/pages/*.js`

## Production bundle boundaries

Keep third-party or remotely hosted assets separate unless they are vendored locally.

### CSS bundles

1. `core.css`
   Includes:
   - `assets/css/main.css`
   - `assets/css/utilities.css`
   - `assets/css/header.css`
   - `assets/css/footer.css`
   - `assets/css/modules/nav.css`
   - `assets/css/modules/panel.css`
   - `assets/css/modules/loading.css`
   - `assets/css/modules/image-loading.css`
   - `style.css`
   - `assets/css/modules/style-overrides.css`

2. `single.css`
   Includes:
   - `assets/css/single.css`
   - `assets/css/modules/entry.css`
   - `assets/css/modules/media.css`

3. `comment.css`
   Includes:
   - `assets/css/comment.css`
   - `assets/modules/turnstile/turnstile.css`

4. `home.css`
   Includes:
   - `assets/css/tasks.css`
   - `assets/css/components/heatmap.css`

5. `page-*.css`
   Keep page-specific bundles separate:
   - `page-about.css`
   - `page-archive.css`
   - `page-feeds.css`
   - `page-links.css`
   - `page-posts-list.css`
   - `page-theme-info.css`
   - `page-visitor.css`

### JS bundles

1. `core.js`
   Includes:
   - `assets/js/utils.js`
   - `assets/js/main.js`
   - `assets/js/loading.js`
   - `assets/js/nav.js`
   - `assets/js/image.js`
   - `assets/js/hero-animations.js`

2. `home.js`
   Includes:
   - `assets/js/home.js`
   - `assets/js/tasks.js`
   - `assets/js/heatmap.js`

3. `single.js`
   Includes:
   - `assets/js/single.js`

4. `comment.js`
   Includes:
   - `assets/modules/turnstile/turnstile.js`
   - `assets/js/comment.js`

5. `page-*.js`
   Keep page-specific scripts separate:
   - `page-about.js`
   - `page-archive.js`
   - `page-feeds.js`
   - `page-links.js`
   - `page-posts-list.js`

## Do not merge blindly

- `wp_localize_script()` data must still target the final bundle handle.
- `font-awesome` stays external unless you vendor it locally.
- `qrcode.min.js`, `prism.js`, `bird.js`, `ai` modules, and similar vendor-style files should stay separate or move into a dedicated vendor bundle.
- Conditional loading in `inc/inc-assets.php` and `inc/inc-comment.php` should remain the source of truth.

## Required cleanup before aggressive bundling

1. Reduce duplicated selectors in `assets/css/comment.css`.
2. Keep comment styles out of `assets/css/main.css`.
3. Avoid duplicate AJAX registrations and duplicate front-end initialization.
4. Preserve script execution order around:
   - `westlifeSettings`
   - `westlifeComment`
   - `westlifeEmoji`
   - `WestlifeThemeInfo`

## Recommended rollout

1. Keep current source files as-is for development.
2. Add a build step that outputs bundle files into `assets/dist/`.
3. The theme now supports automatic bundle switching when matching files exist in `assets/dist/` and production mode is enabled.
4. Keep source-handle enqueue logic available as a fallback in development mode or while bundles are incomplete.
