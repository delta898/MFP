# Trends API 환경 분리 Stage 3 개발 기록

## Branch

`feature/trends-api-environment-03-desktop-endpoint`

## 목표

- BlogGenius Desktop이 실행 환경과 동일한 Trends API URL만 사용하게 한다.
- 코드에 고정된 Production Trends API fallback을 제거한다.
- 환경별 URL 누락·형식 오류·Production 충돌을 네트워크 요청 전에 차단한다.

## 설계와 결정사항

- 환경 manifest에 `trends_api_url_source`를 추가한다.
- Local은 `BLOGGENIUS_LOCAL_TRENDS_API_URL`, Development는
  `BLOGGENIUS_DEVELOPMENT_TRENDS_API_URL`, Production은
  `BLOGGENIUS_PRODUCTION_TRENDS_API_URL`만 읽는다.
- Local launcher는 `http://127.0.0.1:4581`을 명시적으로 공급한다.
- Development는 `.env.development`, Production package는 build config에서 URL을 공급한다.
- URL은 공개 연결 정보이므로 Secret이 아니라 환경 설정 또는 GitHub Variable로 관리한다.
- Local은 loopback URL만, hosted 환경은 remote HTTPS만 허용한다.
- non-Production URL이 알려진 Production URL과 같으면 Trends 연결만 비활성화한다.
- Trends 연결이 없어도 앱 전체는 실행하지만 키워드 탐색·트렌드 조회는 `503`으로 명확히 실패한다.
- 기존 고정 Production URL로의 fallback은 완전히 제거한다.

## 사용자 준비사항

- Development `.env.development`에 `BLOGGENIUS_DEVELOPMENT_TRENDS_API_URL`을 추가한다.
- 같은 파일에 비교 기준인 `BLOGGENIUS_PRODUCTION_TRENDS_API_URL`도 추가한다. 이 기준값이 없으면
  Development Trends 연결은 안전하다고 판단하지 않는다.
- Production release 전에 GitHub Variable `BLOGGENIUS_PRODUCTION_TRENDS_API_URL`을 등록한다.
- Stage 5에서 Development Trends API hostname이 확정되기 전에는 placeholder URL로 실제 조회를
  검증하지 않는다.

## 범위 밖

- Development Trends API 원격 배포
- Docker image와 DNS/Caddy 구성
- signing secret 또는 Edge Function 변경

## 검증 계획

- runtime profile과 URL validation focused test
- Local·Development launcher/build config test
- UI service와 Knowledge provider의 no-fallback regression
- 전체 unit regression
- `git diff --check`

## 결과

- BlogGenius runtime profile이 선택된 실행 환경의 Trends API URL을 함께 결정하도록 구현했다.
- Local launcher는 loopback URL을 자동 공급하고, Development와 Production은 각각 전용 환경값만
  읽도록 분리했다.
- Development에서는 Production URL 비교 기준이 없거나 두 URL이 같으면 Trends 연결을
  비활성화하도록 충돌 방지 규칙을 적용했다.
- Desktop의 트렌드 발행 서비스와 Knowledge provider에서 고정 Production fallback을 제거했다.
- URL 누락 또는 오류 시 앱 전체를 중단하지 않고 Trends 기능만 명확한 `503` 오류로 차단한다.
- Production build config와 GitHub Actions에 공개 Trends API URL 계약을 추가했다.
- Local·Development shell launcher는 명시적인 `api`와 `collect` 명령만 실행하고, 인자가 없으면
  도움말만 표시하도록 단순화했다.
- 관련 focused test 48개와 전체 unit test 1,089개가 통과했다.
- Development 원격 Trends API의 실제 조회 검증은 Stage 5 배포 후 수행한다.
