# Trends Layout Cleanup

## 브랜치

`feature/trends-layout-cleanup`

- 시작일: 2026-08-30
- base/parent branch: `dev`
- 상태: 구현 및 자동 검증 완료, `dev` 병합 승인

## 사용자 필요와 범위

저장소 root와 `apps/trends/`에 흩어진 shell command, Collector 환경 파일, Local API Compose의
소유 관계를 명확히 해 재배포와 유지보수 시 경로를 쉽게 이해할 수 있어야 한다.

범위는 파일 배치, 경로 참조, 테스트와 운영 문서 현행화다. Production runtime 전환,
Production cron 제거, 비밀 값 변경, 외부 배포는 포함하지 않는다.

## 목표

- 저장소 root에는 BlogGenius 전체를 실행하는 대표 명령만 남긴다.
- Collector 명령과 환경 파일을 `trends-collector`가 직접 소유하게 한다.
- Local Trends API Compose를 `trends-api/deployment/local`로 이동해 Development 및 향후
  Production 배포 구조와 대칭을 맞춘다.
- 코드, 테스트, 운영 문서가 같은 경로를 가리키게 한다.

## 설계 및 결정사항

- `run_local.sh`, `run_dev.sh`, `run_local_reset.sh`, `build.sh`는 root 사용자 진입점으로 유지한다.
- Collector shell 명령은 `apps/trends/trends-collector/commands/`로 이동한다.
- Collector 환경 파일은 `apps/trends/trends-collector/config/`로 이동한다.
- Local API Compose는 `apps/trends/trends-api/deployment/local/compose.yml`로 이동한다.
- 기존 Production cron 호환 진입점인 `bin/trends-collector`는 Production 전환 전까지 유지한다.
- 실제 ignored 환경 파일은 값을 출력하거나 변경하지 않고 새 위치로 이동한다.
- 완료된 Trends 구현 계획은 `docs/plans/archive/`로 이동한다.

## 과정

1. 사용자 진입점과 내부 구현 스크립트를 분류한다.
2. 파일을 소유 component 아래로 이동한다.
3. 환경 로더, Compose helper, 테스트와 문서 경로를 현행화한다.
4. 관련 단위 테스트와 전체 회귀 검증을 수행한다.

## 진행 중 확인과 수정

- `apply_patch` 이동 후 shell 실행 권한이 일반 파일 권한으로 바뀐 것을 확인해 실행 권한을
  복원했다.
- 실제 Local 및 Development Collector 환경 파일은 내용을 출력하지 않고 새 위치로 이동했으며
  기존 권한 `600`을 유지했다.
- 최초 전체 회귀 재실행에서 Trends API 테스트 2개가 샌드박스의 `127.0.0.1` listen 제한으로
  `EPERM` 실패했다. 코드 실패가 아님을 확인한 뒤 로컬 포트 권한이 허용된 동일 환경에서
  Trends API 테스트 23개와 전체 단위 테스트를 다시 실행해 모두 통과했다.

## 결과

- root에는 BlogGenius 대표 실행 명령인 `run_*.sh`와 `build.sh`만 남겼다.
- Collector 명령과 설정을 각각 `trends-collector/commands`, `trends-collector/config`로 옮겼다.
- Local API Compose와 runbook을 `trends-api/deployment/local`로 옮겼다.
- 실제 Local 및 Development Collector 설정 파일은 권한 `600`을 유지해 새 위치로 옮겼다.
- 완료된 Trends 구현 계획 10개를 `docs/plans/archive/`로 이동했다.
- canonical README, 아키텍처 문서, helper와 구조 테스트의 경로를 현행화했다.
- Collector launcher 및 환경 경로 집중 테스트 42개가 통과했다.
- Local Compose `config --quiet` 검증과 Local/Development 환경 상태 확인이 통과했다.
- 전체 단위 테스트 1,109개가 통과했다.

## 수동 확인과 후속 작업

- 파일 배치 변경이므로 별도 UI 확인은 필요하지 않다.
- 실제 수집을 다시 실행할 때는 새 `commands/` 경로를 사용한다.
- 기존 Production schedule이 사용하는 `bin/trends-collector`는 이번 범위에서 유지했다. 향후
  Trends API Production 컨테이너 전환 시 함께 교체하고 제거 여부를 결정한다.
