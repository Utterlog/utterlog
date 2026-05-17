# utterlog.io static installer files

This directory is the source of the files published at:

- `https://utterlog.io/install.sh`
- `https://utterlog.io/docker-compose.yml`
- `https://utterlog.io/.env.example`

These files are intentionally different from the repository-root `install.sh`.
The root installer is the source checkout / developer-oriented flow. This
directory is the public, pull-only installer for end users: it downloads only
the compose file and env template, then pulls prebuilt images.

China defaults:

- Docker install uses Docker's official script with `--mirror Aliyun`.
- Fresh Docker hosts get a default `registry-mirrors` entry:
  `https://registry.cn-hangzhou.aliyuncs.com`.
- Utterlog app images probe `registry.utterlog.io` first and persist GHCR
  (`ghcr.io/utterlog`) when the mirror is not readable from the host.
- `docker compose pull` is timeout-guarded so an unreachable registry does not
  hang forever.

When updating `utterlog.io`, publish these files as-is to the site's document
root and keep them in git so future releases do not overwrite the installer
with older local copies.
