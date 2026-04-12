# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-03-06

### Added

- Initial WordPress plugin bootstrap
- Admin settings page under `Settings -> AI Bridge`
- Proxy endpoint, site token, default provider, default model, timeout, logging, and cache settings
- Proxy request client based on `wp_remote_post()`
- Simple request logging stored in WordPress options
- Public helper function `gab_send_ai_request()`
- Project documentation files: `README.md`, `PLUGIN.md`, `USAGE.md`, `CHANGELOG.md`

### Notes

- This is the first working scaffold version of the plugin
- Deep integration with specific WordPress AI plugins is not implemented yet
