# Westlife Single Bundle + PJAX

## Build Output

- Local CSS: `assets/dist/app.css`
- Local JS: `assets/dist/app.js`
- CDN assets remain independent:
  - Font Awesome
  - Fonts
  - Flag Icons
  - Leaflet and related plugins
  - Twikoo / Waline

## Commands

```bash
npm install
npm run build
```

Watch mode:

```bash
npm run build:watch
```

## Bundle Strategy

- `assets/src/app.css` imports all local frontend CSS.
- `assets/src/app.js` imports all local frontend JS and runtime glue.
- WordPress checks `assets/dist/app.css` and `assets/dist/app.js` first.
- If app bundle exists, theme skips individual local CSS/JS enqueues.
- If app bundle does not exist, theme falls back to the current split-file loading mode.

## PJAX Strategy

- PJAX is implemented in `assets/src/runtime/pjax.js`.
- Default: disabled.
- Enable via localized setting `westlifeSettings.enablePjax = true`.
- Replace container selector:
  - default `main.site-main`
  - override with `westlifeSettings.pjaxContainerSelector`

## Lifecycle

- First load:
  - `WestlifeApp.init(document)`
- Before PJAX navigation:
  - `westlife:before-navigate`
  - `WestlifeApp.destroy(container)`
- After DOM replacement:
  - `westlife:after-navigate`
  - `WestlifeApp.init(newContainer)`

## Notes

- Current PJAX is a safe skeleton and is off by default.
- Existing page scripts are still mostly side-effect driven, not full module registrations yet.
- Next recommended step:
  - migrate comment / single / visitor / memos modules to `WestlifeApp.register(...)`
  - then enable PJAX per page template
