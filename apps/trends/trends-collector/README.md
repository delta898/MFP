# Trends Collector

네이버 Creator Advisor의 트렌드를 Playwright로 수집하고 정규화된 payload를 Trends API에
전송하는 운영자용 CLI입니다.

## 최초 설정

```bash
cp apps/trends/trends-collector/config/.env.trends-collector.local.sample \
  apps/trends/trends-collector/config/.env.trends-collector.local
cp apps/trends/trends-collector/config/.env.trends-collector.development.sample \
  apps/trends/trends-collector/config/.env.trends-collector.development
cp apps/trends/trends-collector/config/.env.trends-collector.production.sample \
  apps/trends/trends-collector/config/.env.trends-collector.production
```

실제 환경 파일은 Git에 포함되지 않습니다.

## 실행

```bash
./apps/trends/trends-collector/commands/collect_local.sh
./apps/trends/trends-collector/commands/collect_development.sh
./apps/trends/trends-collector/commands/collect_development.sh --date 2026-08-28
./apps/trends/trends-collector/commands/collect_development.sh --date=-1d
```

Production은 기본적으로 한 번 수집한 payload의 날짜·건수를 먼저 보여주고, TTY에서 정확히
`PRODUCTION`을 입력한 경우에만 같은 payload를 API에 전송합니다.

```bash
# interactive: dry-run 요약 후 확인
./apps/trends/trends-collector/commands/collect_production.sh
./apps/trends/trends-collector/commands/collect_production.sh --date=-1d

# 브라우저를 보면서 스와이프 지연과 재시도를 조정 (무변경 수집)
./apps/trends/trends-collector/commands/collect_production.sh \
  --dry-run --headed --swipe-delay-ms 900 --max-retries 3

# 무변경 수집·요약만 수행
./apps/trends/trends-collector/commands/collect_production.sh --dry-run --date=-1d

# CI/cron 등 비대화형 실제 반영: 명시적 승인 옵션 필수
./apps/trends/trends-collector/commands/collect_production.sh \
  --confirm-production --date=-1d
```

`--dry-run`과 `--confirm-production`은 함께 쓸 수 없습니다. TTY가 없는 환경에서 명시적 모드
없이 실행하면 수집 전에 실패합니다. 실제 write guard는 interactive 승인 또는
`--confirm-production`이 확인된 뒤 API 전송 직전에만 열립니다.

수집 동작은 CLI 옵션 또는 동일 이름의 환경 변수로 조정할 수 있습니다.

| 설정 | CLI | 환경 변수 | 기본값 |
| --- | --- | --- | ---: |
| 브라우저 표시 | `--headed` / `--headless` | `TRENDS_HEADLESS` | headless |
| 스와이프 후 대기 시간 | `--swipe-delay-ms <ms>` | `TRENDS_SWIPE_DELAY_MS` | 400ms |
| 불완전 수집 재시도 | `--max-retries <횟수>` | `TRENDS_MAX_RETRIES` | 3회 |
| 예상 카테고리 수 | `--expected-categories <수>` | `TRENDS_EXPECTED_CATEGORIES` | 32 |
| 카테고리별 키워드 수 | `--keywords-per-category <수>` | `TRENDS_KEYWORDS_PER_CATEGORY` | 20 |

각 재시도는 이전 결과를 버리고 처음부터 전체 카테고리를 다시 스와이프합니다. 기본 완료 기준은
32개 카테고리 각각 고유 키워드 20개(총 640개)입니다. 재시도를 모두 사용해도 기준을 채우지
못하면 API 반영을 중단합니다. `--dry-run`에서는 불완전 결과를 경고와 함께 출력해 디버깅할 수
있습니다. `--headed` 실행은 그래픽 세션이 있는 환경에서 사용하세요.

`TRENDS_ENV`에 따라
`apps/trends/trends-collector/config/.env.trends-collector.<environment>`를 읽습니다. 별도
자동화가 필요하면 절대 경로 `TRENDS_ENV_FILE`로 교체할 수 있습니다.

주요 설정은 API URL·대상 환경·내부 token, 네이버 계정 식별자와 세션 파일 경로입니다.
Collector는 브라우저를 열기 전에 `/health`의 환경을 확인하며, 다른 환경의 API에는 전송하지
않습니다. Collector는 Supabase에 직접 접속하지 않으므로 Collector 설정 파일에 Supabase URL이나
admin key를 두지 않습니다. Production token과 secret은 진단이나 confirmation에 출력하지 않습니다.
