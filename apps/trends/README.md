# Trends System

Operator-only trends backend workspace.

Layout:
- `trends-api/`
- `trends-collector/`
- `shared/lib/`

Configuration:
- environment selection: `TRENDS_ENV=local|development|production`
- environment files: `apps/trends/.env.local`, `.env.development`, `.env.production`
- sample files: `apps/trends/.env.<environment>.sample`
- `TRENDS_ENV_FILE` may point to an absolute operator-owned file for systemd or containers
- `TRENDS_API_BASE_URL` is optional and can be derived from `TRENDS_API_HOST` + `TRENDS_API_PORT`
- API profiles declare `TRENDS_SUPABASE_TARGET_ENV`; collector profiles declare
  `TRENDS_API_TARGET_ENV`; both must match `TRENDS_ENV`
- Production collection additionally requires `TRENDS_ALLOW_PRODUCTION_WRITE=true`

Run:
- Help: `./trends_local.sh`, `./trends_dev.sh`
- Local API: `./trends_local.sh api`
- Development API: `./trends_dev.sh api`
- Local collection and upsert: `./trends_local.sh collect`
- Development collection and upsert: `./trends_dev.sh collect`
- Local status: `./trends_local.sh status`
- Development status: `./trends_dev.sh status`

Collector arguments are passed through, for example:
`./trends_local.sh collect --date=-1d`

The shell launchers intentionally do not expose Production. The lower-level npm commands remain
available for tests and automation, but operators normally use the shell launchers above. A launcher
without a command only prints help and never starts collection implicitly.

The legacy `npm run trends:api` and `npm run trends:collector` commands no longer infer an environment.
They require `TRENDS_ENV` to be supplied by the caller and fail closed when it is missing.
