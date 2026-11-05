#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-}"
if [[ "$ENVIRONMENT" == "development" ]]; then
  COLLECTOR="$SCRIPT_DIR/collect_development.sh"
  TARGET_LABEL="Development"
elif [[ "$ENVIRONMENT" == "production" ]]; then
  COLLECTOR="$SCRIPT_DIR/collect_production.sh"
  TARGET_LABEL="Production"
else
  echo "사용법: $0 <development|production> [옵션]" >&2
  exit 2
fi
shift

START_DATE="2026-01-01"
END_DATE="$(python3 -c 'from datetime import date; print(date.today().isoformat())')"
DELAY_SECONDS=3
SWIPE_DELAY_MS=400

usage() {
  cat <<EOF
사용법:
  $0 $ENVIRONMENT [옵션]

옵션:
  --start DATE   수집 시작일 (YYYY-MM-DD 또는 YYYYMMDD, 기본: 2026-01-01)
  --end DATE     수집 종료일 (YYYY-MM-DD 또는 YYYYMMDD, 기본: 오늘)
  --delay SEC    날짜별 수집 사이 대기 시간 (초, 기본: 3)
  --swipe-delay-ms MS
                 수집기 스와이프 후 대기 시간 (밀리초, 기본: 400, 범위: 0~60000)
  -h, --help     도움말 표시

예시:
  $0 $ENVIRONMENT
  $0 $ENVIRONMENT --start 2026-01-01 --end 2026-10-29
  $0 $ENVIRONMENT --start 20260101 --end 20261029 --delay 5
EOF
}

normalize_date() {
  local value="$1"
  if [[ "$value" =~ ^[0-9]{8}$ ]]; then
    value="${value:0:4}-${value:4:2}-${value:6:2}"
  fi
  printf '%s\n' "$value"
}

is_valid_date() {
  local value="$1"
  [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || return 1
  python3 - "$value" <<'PY' >/dev/null 2>&1
from datetime import date
import sys

try:
    parsed = date.fromisoformat(sys.argv[1])
except ValueError:
    raise SystemExit(1)
raise SystemExit(0 if parsed.isoformat() == sys.argv[1] else 1)
PY
}

add_one_day() {
  python3 - "$1" <<'PY'
from datetime import date, timedelta
import sys

print((date.fromisoformat(sys.argv[1]) + timedelta(days=1)).isoformat())
PY
}

while (($#)); do
  case "$1" in
    --start)
      (($# >= 2)) || { echo "--start 값이 필요합니다." >&2; exit 2; }
      START_DATE="$2"
      shift 2
      ;;
    --end)
      (($# >= 2)) || { echo "--end 값이 필요합니다." >&2; exit 2; }
      END_DATE="$2"
      shift 2
      ;;
    --delay)
      (($# >= 2)) || { echo "--delay 값이 필요합니다." >&2; exit 2; }
      DELAY_SECONDS="$2"
      shift 2
      ;;
    --swipe-delay-ms)
      (($# >= 2)) || { echo "--swipe-delay-ms 값이 필요합니다." >&2; exit 2; }
      SWIPE_DELAY_MS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

START_DATE="$(normalize_date "$START_DATE")"
END_DATE="$(normalize_date "$END_DATE")"

if ! is_valid_date "$START_DATE"; then
  echo "시작일 형식이 잘못됐거나 존재하지 않는 날짜입니다: $START_DATE" >&2
  exit 2
fi
if ! is_valid_date "$END_DATE"; then
  echo "종료일 형식이 잘못됐거나 존재하지 않는 날짜입니다: $END_DATE" >&2
  exit 2
fi
if [[ ! "$DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--delay는 0 이상의 정수여야 합니다: $DELAY_SECONDS" >&2
  exit 2
fi
if [[ ! "$SWIPE_DELAY_MS" =~ ^[0-9]+$ ]] || ((SWIPE_DELAY_MS > 60000)); then
  echo "--swipe-delay-ms는 0~60000 사이의 정수여야 합니다: $SWIPE_DELAY_MS" >&2
  exit 2
fi
if [[ "$START_DATE" > "$END_DATE" ]]; then
  echo "시작일이 종료일보다 늦습니다." >&2
  exit 2
fi
if [[ ! -x "$COLLECTOR" ]]; then
  echo "수집기를 찾을 수 없거나 실행 권한이 없습니다: $COLLECTOR" >&2
  exit 1
fi

echo "수집 기간: $START_DATE ~ $END_DATE"
echo "날짜 사이 대기: ${DELAY_SECONDS}초"
echo "스와이프 후 대기: ${SWIPE_DELAY_MS}ms"
echo "대상: $TARGET_LABEL"

day="$START_DATE"
failed_dates=()
while :; do
  echo
  echo "===== $day 수집 시작 ====="
  collector_args=(--date "$day" --swipe-delay-ms "$SWIPE_DELAY_MS")
  if [[ "$ENVIRONMENT" == "production" ]]; then
    collector_args=(--confirm-production "${collector_args[@]}")
    if ! "$COLLECTOR" "${collector_args[@]}"; then
      echo "===== $day 실패; Production 범위 수집을 중단합니다 =====" >&2
      exit 1
    fi
  elif "$COLLECTOR" "${collector_args[@]}"; then
    echo "===== $day 완료 ====="
  else
    status=$?
    failed_dates+=("$day")
    echo "===== $day 실패 (exit=$status); 다음 날짜를 계속합니다 =====" >&2
  fi

  [[ "$day" == "$END_DATE" ]] && break
  if ((DELAY_SECONDS > 0)); then
    echo "다음 날짜까지 ${DELAY_SECONDS}초 대기..."
    sleep "$DELAY_SECONDS"
  fi
  next_day="$(add_one_day "$day")"
  if ! is_valid_date "$next_day"; then
    echo "다음 날짜 계산 결과가 잘못됐습니다: '$next_day' (현재 날짜: $day)" >&2
    exit 1
  fi
  day="$next_day"
done

echo
echo "전체 날짜 수집 완료: $START_DATE ~ $END_DATE"
if ((${#failed_dates[@]} > 0)); then
  echo "실패 날짜: ${failed_dates[*]}" >&2
  exit 1
fi
