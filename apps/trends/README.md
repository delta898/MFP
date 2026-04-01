# Trends System

Operator-only trends backend workspace.

Layout:
- `trends-api/`
- `trends-collector/`
- `shared/lib/`

Configuration:
- shared environment file: `apps/trends/.env`
- sample file: `apps/trends/.env.sample`
- `TRENDS_API_BASE_URL` is optional and can be derived from `TRENDS_API_HOST` + `TRENDS_API_PORT`

Run:
- from the repo root: `npm run trends:api` / `npm run trends:collector`
- from any directory: `node /Users/delta898/Project/NaverAutoBlog/bin/trends-api`
- from any directory: `node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector`
