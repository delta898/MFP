# Local Trends 인증 인프라 완성

## 브랜치 정보

- branch: `feature/local-trends-auth-infrastructure`
- 시작일: 2026-08-30
- base/parent branch: `dev`
- 상태: 구현·검증 완료, `dev` 통합 승인

## 사용자 필요

`run_local.sh`로 BlogGenius를 실행하면 Local Supabase와 앱은 시작되지만 Trends 단기 토큰 발급이
실패한다. Local에서도 Development와 같은 사용자 흐름으로 트렌드 조회와 관련 기능을 검증할 수
있어야 한다.

## 확인된 현황

- Local Edge Function `issue-trends-access-token`은 실행되지만 `TRENDS_READ_TOKEN_SECRET`이 없어
  `TRENDS_ACCESS_TOKEN_NOT_CONFIGURED`로 실패한다.
- Local Trends API 컨테이너는 `run_local.sh` 실행 흐름에 포함되지 않는다.
- 기존 Local Trends API helper는 API용 shared secret을 collector config에 만들지만 같은 signing
  secret을 Local Edge Runtime에 전달하지 않는다.

## 목표

- `run_local.sh` 한 번으로 Local Supabase, Local Trends API와 BlogGenius를 올바른 순서로 준비한다.
- Edge Function과 Trends API가 동일한 Local signing secret을 안전하게 공유한다.
- secret은 Git에 기록하거나 로그로 출력하지 않는다.
- 재실행해도 기존 Local secret을 안정적으로 재사용한다.
- 어느 준비 단계에서 실패했는지 사용자가 알 수 있게 fail closed 한다.

## 범위

- Local environment launcher와 Local Trends API 준비 도구
- Local Edge Function용 secret 파일·실행 계약
- Local token 발급 및 Trends API read smoke
- 관련 테스트와 한글 개발 환경 가이드

## 명시적 비목표

- Development 또는 Production secret·배포 변경
- Trends 데이터 자동 수집
- Production 서비스 호출 또는 원격 데이터 변경
- 제목 호기심 전략 변경

## 설계 원칙

1. Local signing secret의 단일 소유 파일을 정하고 Edge Function과 API container가 이를 읽는다.
2. Local Supabase가 secret 파일 변경을 반영하도록 명시적인 시작·재시작 경계를 둔다.
3. Desktop에는 signing secret이나 API 내부 token을 전달하지 않는다.
4. API는 loopback에만 노출하고 Local endpoint identity를 검증한다.
5. launcher 테스트는 외부 side effect 없이 명령 순서와 secret 비노출을 검증한다.

## 결정사항과 트레이드오프

- 공식 Supabase 문서가 `supabase/functions/.env`를 `supabase start`에서 자동 로드하는 Local secret
  경계로 정의하므로 별도 Functions serve 프로세스를 만들지 않는다.
- signing secret은 Functions 파일이 소유하고 Trends API만 검증을 위해 읽는다. ingest token은
  Collector 파일이 소유한다. 한 파일에 모든 secret을 모으는 편의보다 최소 공유 범위를 우선한다.
- Local Trends API는 앱과 같은 명령에서 detached container로 시작한다. API 소스 변경을 바로
  반영할 수 있도록 Compose build를 수행하되 Docker cache를 재사용한다.

## 구현 단계

1. Supabase CLI Local Edge Runtime의 env 로딩 계약 확인
2. 공용 Local secret 준비 및 두 runtime 연결
3. `run_local.sh` 시작 흐름 통합
4. token 발급·Trends read smoke와 회귀 테스트

## 진행 기록

- 미커밋 상태인 제목 전략 feature를 건드리지 않기 위해 `dev` 기반 별도 Git worktree에서 시작했다.
- 실제 Local 로그에서 signing secret 누락과 Local Trends API 미기동을 확인했다.
- 공식 Supabase 문서와 현재 CLI 도움말에서 `supabase/functions/.env`의 `supabase start` 자동 로딩
  계약을 확인했다.
- Local secret 소유 파일을 자동 생성하고 기존 Collector signing secret을 Functions 파일로
  이전하는 helper를 구현했다.
- Local API runtime이 Collector ingest token과 Functions signing secret을 필요한 범위에서 결합하도록 했다.
- Local Collector 파일에서 더는 소유하지 않는 Supabase URL·admin key·target 설정과 read-token
  설정을 자동 제거하고, tracked sample에는 Collector 입력과 ingest 설정만 남겼다.
- 앱 launcher를 secret 준비 → Supabase → detached Trends API → Electron 순서로 연결했다.
- 이미 실행 중인 Local Supabase는 처음 생성·이전된 Functions secret을 단순 `start`로 다시 읽지
  않는 현상을 실제 환경에서 확인했다. 최초 변경 시에만 기존 데이터를 보존하는 `stop` 후 다시
  시작하고, 이후에는 재시작하지 않도록 보완했다.

## 결과 및 검증

- Local secret 준비, 기존 signing secret 이전, 임시 runtime env 권한과 삭제, API detached health
  대기, launcher 명령 순서를 자동 테스트로 검증했다.
- Local Supabase를 실제로 재시작해 `supabase/functions/.env`의 signing secret·issuer·audience가
  Edge Runtime에 로드되는 것을 값 노출 없이 확인했다.
- Local Trends API 컨테이너가 `local` 환경으로 healthy 상태가 되고 loopback health endpoint가
  응답하는 것을 확인했다.
- 이 컴퓨터의 Local 라이선스로 Edge Function이 단기 read token을 발급하고, 발급된 token으로
  Local Trends API `/api/v1/trends/meta`가 `200`과 성공 응답을 반환하는 종단 간 검증을 통과했다.
- 집중 회귀 테스트 27개와 전체 단위 회귀 테스트 1,131개가 모두 통과했다. 전체 회귀의 최초
  sandbox 실행에서는 loopback listen 권한 때문에 API 서버 테스트 2개만 실패했지만, 로컬 소켓
  권한으로 재실행하고 전체 suite도 같은 조건에서 다시 실행해 모두 통과했다.

## 남은 위험과 후속 작업

- 다른 개발 장비의 첫 실행에서는 Docker image 준비 시간과 장비별 Local 테스트 라이선스 자동 발급을
  사용자가 한 번 확인해야 한다.
- 이 feature를 통합한 뒤 제목 호기심 전략 feature로 돌아가 전체 제목 생성 경로 검증을 이어간다.
