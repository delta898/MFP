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

Help:

```bash
node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector --help
```

Specific date collection:

```bash
node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector --date 2026-04-01
npm run trends:collector -- --date 2026-04-01
```

Relative date collection also works:

```bash
node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector --date=-1d
node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector --date=-3d
node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector --date=yesterday
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
- `--date` takes precedence over `TRENDS_TARGET_DATE`
- relative date literals such as `yesterday`, `어제`, `-1d`, and `-3d` are supported
- collector 완료 로그의 `inserted` / `updated`는 API upsert 기준 신규/기존 row 수를 뜻합니다
