#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$repo_root/scripts/secrets/sync-github-secrets.js" --environment production --confirm-production
