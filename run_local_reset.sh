#!/usr/bin/env bash

set -euo pipefail

# Supabase migration이나 seed를 변경했다면 Local 앱 테스트 전에 실행합니다.
# Local DB를 비우고 canonical migration과 local seed를 처음부터 다시 적용합니다.
# DB에 묶인 Local 라이선스도 사라지므로 license.local.key를 함께 초기화합니다.
# 다음 Local 앱 실행에서 현재 컴퓨터의 HWID 전용 키가 자동으로 다시 발급됩니다.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

exec npm run env:local:reset
