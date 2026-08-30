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

# 무변경 수집·요약만 수행
./apps/trends/trends-collector/commands/collect_production.sh --dry-run --date=-1d

# CI/cron 등 비대화형 실제 반영: 명시적 승인 옵션 필수
./apps/trends/trends-collector/commands/collect_production.sh \
  --confirm-production --date=-1d
```

`--dry-run`과 `--confirm-production`은 함께 쓸 수 없습니다. TTY가 없는 환경에서 명시적 모드
없이 실행하면 수집 전에 실패합니다. 실제 write guard는 interactive 승인 또는
`--confirm-production`이 확인된 뒤 API 전송 직전에만 열립니다.

`TRENDS_ENV`에 따라
`apps/trends/trends-collector/config/.env.trends-collector.<environment>`를 읽습니다. 별도
자동화가 필요하면 절대 경로 `TRENDS_ENV_FILE`로 교체할 수 있습니다.

주요 설정은 API URL·대상 환경·내부 token, 네이버 계정 식별자와 세션 파일 경로입니다.
Collector는 브라우저를 열기 전에 `/health`의 환경을 확인하며, 다른 환경의 API에는 전송하지
않습니다. Production token과 secret은 진단이나 confirmation에 출력하지 않습니다.
