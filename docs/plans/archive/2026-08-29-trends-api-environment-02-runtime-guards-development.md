# Trends API 환경 분리 Stage 2 개발 기록

## Branch

`feature/trends-api-environment-02-runtime-guards`

## 목표

- API의 Supabase target과 collector의 API target이 선택 환경과 일치하는지 기동 전에 검사한다.
- Local은 local endpoint만, hosted 환경은 remote HTTPS endpoint만 사용하게 한다.
- Development가 알려진 Production URL을 사용하거나 Production API에 데이터를 쓰는 일을 차단한다.
- Production collector는 명시적인 write 승인 없이는 실행하지 않는다.

## 설계와 결정사항

- API 설정은 `TRENDS_SUPABASE_TARGET_ENV`, collector 설정은 `TRENDS_API_TARGET_ENV`로 대상 환경을
  명시한다.
- 환경 label과 URL 형식을 실행 전에 검사하고 Secret은 진단 로그에 포함하지 않는다.
- collector는 ingest 요청에 자신의 환경 식별자를 전송한다.
- API는 ingest token 검증 후 요청 환경과 자신의 환경이 다르면 쓰기를 거부한다.
- collector는 실제 수집을 시작하기 전에 API health의 환경 식별자를 확인한다.
- Production collector는 `TRENDS_ALLOW_PRODUCTION_WRITE=true`가 있어야 실행할 수 있다.
- 기존 Production systemd process는 아직 새 코드로 배포하지 않으므로 영향을 받지 않는다.

## 범위 밖

- Desktop Trends endpoint 선택
- Docker image 또는 원격 service 배포
- Production service 변경과 Secret 회전

## 검증 계획

- target guard focused unit test
- collector health identity와 ingest environment header test
- API cross-environment ingest 거부 HTTP test
- 기존 Trends API·collector regression
- 전체 unit regression

## 결과

- API는 `TRENDS_SUPABASE_TARGET_ENV`, collector는 `TRENDS_API_TARGET_ENV`가 선택 환경과
  일치하지 않으면 외부 연결 전에 종료된다.
- Local은 loopback URL만 허용하고 Development·Production은 remote HTTPS만 허용한다.
- non-Production은 설정된 Production Supabase/API URL과 충돌하면 기동을 거부한다.
- collector는 실제 브라우저 수집 전에 API `/health`의 환경을 확인한다.
- ingest 요청에는 `X-Trends-Environment`가 포함되고 API 환경과 다르면 DB 접근 전에 `409`로
  거부된다.
- Production collector는 `TRENDS_ALLOW_PRODUCTION_WRITE=true`가 없으면 실행되지 않는다.
- `trends_local.sh`, `trends_dev.sh`는 옵션을 첫 인자로 바로 전달해도 기본 collector로 처리하도록
  보완했다. 최종 UX는 E2E에서 다시 검토한다.

검증:

- 환경·target·collector focused test: 39개 통과
- Trends API HTTP test: 23개 통과
- 전체 unit regression: 1,082개 통과
- shell 문법 검사와 `git diff --check`: 통과

Stage 2 구현은 완료했으며 feature-main 병합과 branch 삭제는 사용자 승인 후 수행한다.
