#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    cat <<'EOF'
사용법: ./trends_local.sh <명령> [옵션]

명령:
  api       Local Trends API 서버 실행
  collect   네이버 트렌드 수집 후 Local Supabase에 upsert
  status    Local Trends 환경 설정 상태 확인
  help      이 도움말 표시

예시:
  ./trends_local.sh api
  ./trends_local.sh collect --date=-1d
EOF
}

if [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

COMMAND="$1"
shift

case "$COMMAND" in
    api)
        exec npm run trends:api:local -- "$@"
        ;;
    collect)
        exec npm run trends:collector:local -- "$@"
        ;;
    status)
        exec npm run trends:env:status -- local
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo "알 수 없는 명령입니다: $COMMAND" >&2
        show_help >&2
        exit 2
        ;;
esac
