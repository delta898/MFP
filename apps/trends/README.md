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

The Local API command runs the Node 24 Trends API container through
`apps/trends/compose.local.yml`. It does not copy `.env.local` into the image; Compose reads that
ignored file only at runtime. The Local Supabase stack must be running before collection or data
queries.
If the ignored Local file has no internal API/read secrets, the launcher generates them once with
per-machine file permissions so the API and host collector share the same Local-only value. The
Supabase admin key is always resolved from the current Local stack and kept only in a temporary file.

The legacy `npm run trends:api` and `npm run trends:collector` commands no longer infer an environment.
They require `TRENDS_ENV` to be supplied by the caller and fail closed when it is missing.
