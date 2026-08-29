# Trends Collector 인증 만료 진단 Hotfix 개발 기록

## Branch

`feature/trends-collector-auth-expiry-hotfix`

## 목표

- 만료된 `naver_auth.json`을 로드한 Collector가 로그인 화면을 데이터 없음으로 오인하지 않게 한다.
- 날짜 fallback과 타임아웃을 기다리지 않고 사용자가 취할 수 있는 조치를 즉시 안내한다.
- 로그인 화면의 비인증 상태로 기존 인증 파일을 덮어쓰지 않는다.

## 설계와 결정사항

- Naver 로그인 URL 리다이렉트와 Creator Advisor 내부 로그인 안내 화면을 모두 감지한다.
- 감지 시 `NAVER_SESSION_EXPIRED` 코드와 재로그인 안내 메시지로 즉시 실패한다.
- 데이터 대기 중 세션이 만료되는 경우도 같은 판별을 적용한다.
- 로그인 필요 상태에서는 Playwright storage state를 저장하지 않는다.

## 결과

- 인증 만료가 날짜 선택 실패나 트렌드 데이터 로딩 시간 초과로 표시되지 않는다.
- 로그인 URL, Creator Advisor 로그인 화면, 인증 파일 보존에 대한 회귀 테스트를 추가했다.
