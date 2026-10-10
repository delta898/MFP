#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OAUTH_ENV_FILE="${BLOGGENIUS_OAUTH_ENV_FILE:-.env.oauth.prod}"
exec node scripts/run-with-oauth-env.js production "$OAUTH_ENV_FILE" -- npm run app:production -- "$@"
