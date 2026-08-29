# Trends API 환경 분리 Stage 1 개발 기록

## Branch

`feature/trends-api-environment-01-contract`

## 목표

- Trends API와 collector가 `local`, `development`, `production` 환경을 명시적으로 선택하게 한다.
- 모호한 `apps/trends/.env` 자동 로딩을 제거한다.
- 환경별 설정 파일과 외부 environment file을 지원한다.
- 환경 누락·오타·설정 파일 불일치를 실제 네트워크 연결 전에 차단한다.
- Secret을 출력하지 않는 상태 진단을 제공한다.

## 설계와 결정사항

- 환경 선택 key는 `TRENDS_ENV` 하나로 고정한다.
- 허용값은 `local`, `development`, `production`뿐이며 별칭 `dev`, `prod`는 허용하지 않는다.
- repository 기본 파일은 `apps/trends/.env.<environment>`이고 실제 파일은 Git에서 제외한다.
- systemd·Docker 등 환경 제공자는 process environment를 직접 공급할 수 있다.
- `TRENDS_ENV_FILE`을 사용할 때에는 선택된 환경과 파일 내부 환경이 일치해야 한다.
- module을 단위 테스트에서 import하는 것만으로 실패하지 않고, 실제 API·collector entrypoint가
  실행될 때 fail-closed 검사를 수행한다.
- 기존 Production process는 기존 배포 commit과 `.env`를 계속 사용한다. 새 runtime을 Production에
  배포하는 일은 이번 단계 범위가 아니다.

## 범위 밖

- 환경별 Supabase URL/host allowlist
- Desktop Trends endpoint 변경
- Docker image 생성
- Development 또는 Production 원격 배포
- signing secret 생성·조회·변경

## 검증 계획

- 환경 contract와 env parser focused unit test
- launcher 환경 전달 test
- API·collector 실제 entrypoint의 환경 누락 fail-closed test
- 전체 unit regression
- `git diff --check`

## 결과

- `TRENDS_ENV`가 없거나 `dev`, `prod` 같은 비표준 별칭이면 API·collector가 외부 연결 전에
  fail-closed로 종료된다.
- 선택한 `apps/trends/.env.<environment>`만 읽고 기존 process environment 값은 덮어쓰지 않는다.
- `TRENDS_ENV_FILE`은 절대 경로만 허용하며 파일 내부 환경 선언이 선택 환경과 다르면 거부한다.
- 환경 진단은 환경명, 설정 source와 파일 basename만 출력하고 Secret과 실제 설정값은 출력하지
  않는다.
- Local·Development API/collector 단축 명령과 `trends:env:status`를 추가했다.
- 사용자가 npm 명령을 외우지 않도록 repository root에 `trends_local.sh`, `trends_dev.sh`를
  추가했다. 인자 없이 실행하면 해당 환경 collector가 시작되며, API는 `api`, 상태 확인은
  `status`를 뒤에 붙인다. 이 스크립트의 최종 UX는 환경별 E2E 테스트 과정에서 다시 검토한다.
- Production 편의 실행 명령은 아직 deploy guard가 없으므로 추가하지 않았다. 운영 환경 제공자가
  명시적으로 `TRENDS_ENV=production`을 공급하는 계약은 유지한다.
- 기존 `.env`는 새 runtime에서 암묵적으로 읽지 않는다. 현재 Production process는 기존 배포
  commit을 계속 사용하며 이번 branch에서 원격 변경하지 않았다.

검증:

- 환경·launcher·entrypoint focused test: 30개 통과
- Trends API 기존 HTTP test: 22개 통과
- 전체 unit regression: 1,068개 통과
- `git diff --check`: 통과

Stage 1 구현은 완료했으며 feature-main 병합과 branch 삭제는 사용자 승인 후 수행한다.
