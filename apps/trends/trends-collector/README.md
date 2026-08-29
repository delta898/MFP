# Trends Collector

네이버 Creator Advisor의 트렌드를 Playwright로 수집하고 정규화된 payload를 Trends API에
전송하는 운영자용 CLI입니다.

## 최초 설정

```bash
cp apps/trends/.env.trends-collector.local.sample \
  apps/trends/.env.trends-collector.local
cp apps/trends/.env.trends-collector.development.sample \
  apps/trends/.env.trends-collector.development
```

실제 환경 파일은 Git에 포함되지 않습니다.

## 실행

```bash
./collect_trends_local.sh
./collect_trends_dev.sh
./collect_trends_dev.sh --date 2026-08-28
./collect_trends_dev.sh --date=-1d
```

`TRENDS_ENV`에 따라 `apps/trends/.env.trends-collector.<environment>`를 읽습니다. 별도 자동화가
필요하면 절대 경로 `TRENDS_ENV_FILE`로 교체할 수 있습니다.

주요 설정은 API URL·대상 환경·내부 token, 네이버 계정 식별자와 세션 파일 경로입니다.
Collector는 브라우저를 열기 전에 `/health`의 환경을 확인하며, 다른 환경의 API에는 전송하지
않습니다. Production 수집에는 별도 명시적 승인 값이 필요합니다.
