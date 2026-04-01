# Trends Collector

Operator-only CLI for collecting Naver trends via Playwright and forwarding normalized payloads to the trends API.

This runtime is intentionally separate from the desktop app packaging flow.

## Run

```bash
cp apps/trends/.env.sample apps/trends/.env
npm run trends:collector
```

From any shell directory you can also run:

```bash
node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector
```

Important env keys:
- `TRENDS_NAVER_ID`
- `TRENDS_AUTH_FILE_PATH`
- `TRENDS_API_HOST`
- `TRENDS_API_PORT`
- `TRENDS_API_TOKEN`

Notes:
- shared `.env` is auto-loaded from `apps/trends/`
- `TRENDS_AUTH_FILE_PATH` can point at the existing app session file such as `./config/naver_auth.json`
- relative auth paths are resolved from the repo root, so the default works from any current shell directory
- `TRENDS_API_BASE_URL` is optional; if omitted it is derived from `TRENDS_API_HOST` and `TRENDS_API_PORT`
