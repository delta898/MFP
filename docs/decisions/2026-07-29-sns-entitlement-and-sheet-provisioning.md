# 2026-07-29 SNS Entitlement and Sheet Provisioning

## Context

Buffer 기반 SNS 자동 발행은 라이선스 capability로 제어하지만 설정 화면과 공유
Spreadsheet는 모든 사용자가 접한다. capability가 없는 사용자에게도 SNS record를
미리 쌓으면 권한 경계가 흐려지고, 나중에 업그레이드했을 때 과거 글이 한꺼번에
발행될 수 있다. 반대로 `SNS` 시트 자체를 권한 보유자에게만 늦게 만들면 신규·기존
Spreadsheet의 구조가 달라지고 활성화 시점의 실패 가능성이 커진다.

## Decision

- canonical 시트 탭 이름은 대문자 `SNS`다.
- `topics`, `shopping`을 확인·생성하는 공통 초기화에서 모든 플랜의 `SNS`
  시트와 필수 헤더, 상태 dropdown도 함께 준비한다.
- 설정 UI, Buffer 연결 확인, 조직·채널 조회는 모든 플랜에 노출할 수 있다.
- RSS 확인, `SNS` 행 추가, Buffer 발행은 하나의 SNS distribution capability로
  묶고 해당 capability가 있을 때만 허용한다.
- 실행 코드는 `test`, `pro` 같은 `plan_code`를 직접 비교하지 않는다.
- capability가 없는 사용자는 빈 `SNS` 시트 구조만 가지며 SNS record를 수집하지 않는다.
- capability 이름은 `enable_sns_distribution`으로 확정한다.
- 현재는 tester, pro, ultra에 `true`, free에 `false`를 부여한다. 이 배정은 앱
  실행부가 아니라 `license_plans.features`가 소유하는 배포 정책이다.
- 공통 초기화 중 `SNS` 준비 실패는 경고로 격리해 `topics`, `shopping`을 막지 않는다.
- SNS 활성화 또는 runner 시작 직전에는 `SNS` 준비 상태를 엄격히 재검사하며,
  실패하면 SNS 기능만 중단한다.
- 개발 중인 `SNS` 시트에는 하위 호환 컬럼 보충을 적용하지 않는다. 필수 헤더가
  빠진 기존 시트는 자동 수정하지 않고 SNS 실행만 중단한다.
- 생성한 해시태그는 `SNS` 시트의 `해시태그` 컬럼에 원문 단위로 저장하고 같은
  `entry_key`의 채널별 행에서 재사용한다.

## Consequences

- 모든 사용자의 Spreadsheet 구조가 일관되고 기능 발견성이 높아진다.
- capability가 없는 상태에서 불필요한 데이터 수집과 권한 취득 직후 과거 글 발행 위험이 없다.
- SNS 시트 장애가 기존 블로그 글감과 쇼핑 흐름으로 전파되지 않는다.
- 스키마 변경 중에는 기존 `SNS` 시트를 삭제한 뒤 공통 초기화가 최신 canonical
  스키마로 다시 생성하게 한다.
- 후속 구현은 UI 노출 여부가 아니라 capability를 기준으로 데이터 수집과 발행을
  동시에 차단해야 한다.

## Rollout Constraint

- 신규 환경은 canonical `supabase/migrations/` chain을 적용한다. 해당 entitlement 변경은
  `202608270005_add_sns_distribution_capability.sql`에 포함된다.
- 그 다음 다섯 번째 필수 feature를 검증하는 앱 버전을 배포한다.
- 순서를 바꾸면 기존 라이선스의 feature JSON에 키가 없어 fail-closed 정책 오류가 발생한다.
