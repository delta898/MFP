# Help 고도화 2단계 원격 카탈로그 개발 기록

## Branch

- Branch: `codex/feature/help-upgrade-02-remote-catalog`
- Base/parent branch: `codex/feature/help-upgrade-main`
- Start date: 2026-09-03
- Status: 완료

## 사용자 필요와 목표

앱을 다시 배포하지 않아도 Help의 공식 가이드와 개발자 자료·후원 정보를 관리할 수 있게 한다. 원격 콘텐츠가 없거나 조회에 실패해도 1단계에서 만든 로컬 핵심 가이드는 사라지지 않아야 한다.

## 범위

- 기존 surface-content 경계에 `help` read model 추가
- `getting_started`, `writing`, `automation`, `supporting` region 계약
- Help view에서 원격 콘텐츠를 안전하게 렌더링
- 원격 성공 시 카탈로그 갱신, 빈 응답·실패 시 로컬 fallback 유지
- 기존 가이드 8건과 개발자 블로그·전자책·후원 콘텐츠의 Help placement 운영 SQL
- schema/service/controller/route/UI focused tests와 browser smoke

## 명시적 비범위

- 새 table 또는 schema migration
- Help 카탈로그 외 Production 데이터 변경
- Help 검색·즐겨찾기·열람 기록
- Dashboard의 전체 가이드 이동 연결
- release, push 또는 배포

## 사용자와 결정한 사항

- 핵심 사용법은 상단에 유지하고 개발자 블로그·전자책·후원은 하단 보조 영역으로 분리한다.
- 후원은 모든 plan에서 볼 수 있는 자발적 행동으로 취급한다.
- Help 콘텐츠는 기존 `app_surface_contents` 구조를 재사용한다.
- 원격 콘텐츠 장애가 마지막 정상 상태나 로컬 기본 가이드를 지우지 않게 한다.

## 제안 설계

- 범용 Supabase RPC에는 변경을 가하지 않고 앱의 허용 surface와 region만 확장한다.
- region은 UI 목적에 따라 시작·글쓰기·자동화·보조 자료로 구분하며, kind는 기존 `resource`, `support`, `affiliate`를 유지한다.
- 원격 region에 한 건 이상 있을 때만 해당 로컬 영역을 교체한다. 빈 region과 요청 실패는 로컬 fallback을 유지한다.
- `supporting`은 핵심 안내와 분리된 하단 카드로 표시하고 원격 데이터가 없으면 영역 자체를 숨긴다.

## 진행 및 변경 기록

- 2026-09-03: Help 1단계를 parent에 병합한 뒤 원격 카탈로그 sub-feature를 시작했다.
- 2026-09-04: 기존 범용 surface-content 경계에 Help read model과 read-only API를 추가했다. 새 table이나 schema migration은 만들지 않았다.
- 2026-09-04: Help의 시작하기·글쓰기·자동화 region은 원격 블록이 있을 때만 교체하고, 정상적인 빈 응답이면 캡처해 둔 로컬 가이드로 복원하도록 구현했다. 조회 실패는 마지막 정상 화면을 유지한다.
- 2026-09-04: 개발자 자료·전자책·후원용 `supporting` 영역은 유효한 원격 블록이 있을 때만 나타나며, 캠페인이 비거나 중단되면 다시 숨도록 구현했다.
- 2026-09-04: 기존 콘텐츠를 Help region에 배치하기 위한 운영 SQL과 inventory를 추가했다.
- 2026-09-04: 사용자 승인 후 `BlogGenius Development` 프로젝트에 Help 카탈로그 운영 SQL을 적용했다. 검증 query에서 `getting_started` 5건, `writing` 2건, `automation` 1건, `supporting` 3건 등 총 11개의 active placement를 확인했다. Production에는 적용하지 않았다.
- 2026-09-04: 실제 UI 확인에서 보조 자료 카드의 제목과 행동 문구가 한 줄에 붙어 보이는 문제를 확인했다. 제목과 보조 행동을 위아래로 분리하고 세 카드의 최소 높이, 수직 정렬, 화살표 위치를 일관되게 조정했다.
- 2026-09-04: v0.4.1이 installer hot patch로 이미 배포된 상태임을 확인해 Help 카탈로그 운영 SQL의 최소 앱 버전을 다음 기능 버전 후보인 `0.4.2`로 바로잡았다. Development의 기존 `0.4.1` placement는 현재 UI 검증을 위해 그대로 두고, Production 선반영에는 `0.4.2` 정책을 사용한다.
- 2026-09-04: 사용자 승인 후 Production 프로젝트에 Help 카탈로그 운영 SQL을 선반영했다. 총 11개 placement와 11개 campaign 모두의 `minimum_app_version = 0.4.2`를 별도 조회로 확인했다.
- 2026-09-04: 사용자가 Development 앱에서 원격 가이드와 보조 자료 카드의 최종 배치를 확인하고 승인했다.

## 최종 결과 및 검증

코드 구현과 로컬 자동 검증, Development UI 확인, Production 카탈로그 선반영을 완료했다.

- focused tests: 40 passed
- browser smoke: 176 fixture requests passed
- browser smoke는 성공 메시지 출력 뒤 테스트 보조 프로세스가 자동 종료되지 않아 수동으로 정리했다. 브라우저 시나리오 실패는 없었다.
- 보조 카드 배치 조정 후 focused UI contracts 10개와 browser smoke 180 fixture requests를 다시 통과했다.
- `git diff --check`: 통과
- full unit suite: 1,305 passed
- remote mutation: Development Help campaign/placement 11건 upsert 완료. Production에도 동일한 11건을 `minimum_app_version = 0.4.2`로 선반영하고 검증 완료
