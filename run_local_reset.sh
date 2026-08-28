#!/usr/bin/env bash

set -euo pipefail

# Supabase migration이나 seed를 변경했다면 Local 앱 테스트 전에 실행합니다.
# Local DB를 비우고 canonical migration과 local seed를 처음부터 다시 적용합니다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

exec npm run env:local:reset
