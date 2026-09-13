# SNS 작업 공간 캐시

- branch: `codex/feature/sns-workspace-cache`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: complete

## 사용자 필요와 목표

SNS 메뉴를 다시 열거나 앱을 재시작할 때마다 Buffer 작업 공간을 수동으로 불러와야 하는 반복을 없앤다. 한 번 정상적으로 확인한 작업 공간과 채널은 즉시 다시 보여주되, 오래되거나 변경된 외부 상태는 백그라운드 확인으로 갱신한다.

## 범위

1. 비밀값을 포함하지 않는 Buffer 작업 공간·채널 snapshot 계약
2. SNS 메뉴 진입 시 마지막 정상 snapshot 즉시 복원
3. TTL 기반 stale-while-revalidate와 명시적 `다시 불러오기`
4. 인증 만료·설정 변경 시 무효화, 일시 오류 시 마지막 정상 상태 보존
5. 저장된 조직·채널 선택과 snapshot 정합성 유지
6. focused contract 및 관련 browser smoke

## 비범위

- Buffer API Key 또는 다른 credential의 브라우저 저장
- 서버의 실제 발행 전 채널 검증 제거
- 블로그 자동 공유 정책 변경
- SNS 화면 밀도·정보 구조 재설계

## 제안 설계와 단계

- UI 저장소에는 version, fetched-at, organization 목록과 조직별 공개 채널 metadata만 둔다.
- fresh snapshot이면 즉시 사용하고, stale snapshot이면 즉시 표시한 뒤 background refresh한다.
- 401/403 또는 Buffer 연결 설정의 변경·삭제는 snapshot을 무효화한다.
- timeout, 5xx, offline 같은 일시 오류는 마지막 정상 snapshot을 지우지 않고 재시도 안내만 갱신한다.
- 실제 발행은 기존 server-side connection inspection을 계속 통과해야 하며 cache를 권한 근거로 사용하지 않는다.

## 결정과 진행 기록

- 2026-09-14: 사용자가 SNS 작업 공간을 매번 불러오는 반복을 개선하되 밀도 작업과 분리된 branch에서 진행하도록 승인했다.
- 2026-09-14: 캐시는 UX 가속용이며 credential·발행 권한의 source of truth가 아니라는 경계를 유지한다.
- 2026-09-14: `manual-workspace-cache`를 별도 모듈로 추가하고 classic-script manifest에 명시했다. SNS composer는 연결 상태를 확인한 뒤 cache snapshot을 복원하며, 24시간이 지난 snapshot은 먼저 표시한 다음 background refresh한다.
- 2026-09-14: Buffer 설정 저장은 기존 snapshot을 지우고, Settings Beta에서 작업 공간을 정상 확인한 결과는 SNS 메뉴와 공유한다. 401/403을 포함한 확정적 client failure는 cache를 무효화하고 timeout·429·5xx는 마지막 정상 snapshot을 보존한다.
- 2026-09-14: browser smoke의 기존 요청 목록 계약을 건드리지 않도록 앱 재로딩 cache 확인을 전체 요청 assertion 뒤의 독립 구간으로 배치했다.
- 2026-09-14: 사용자가 실제 SNS 화면에서 동작을 확인하고 완료를 승인했다.

## 검증 및 결과

- `node --test scripts/manual-sns-workspace-cache.test.js scripts/ui-publishing-social-structure.test.js scripts/social-view-design-system-contract.test.js scripts/ui-script-structure.test.js scripts/shared-feedback-components-contract.test.js`: 12 passed
- `node --test scripts/settings-next-ui-contract.test.js scripts/settings-next-appearance-contract.test.js`: 12 passed
- `npm run test:ui-browser`: passed, 309 fixture requests
- browser smoke에서 최초 작업 공간 불러오기 1회 후 메뉴 왕복과 앱 재로딩 모두 추가 workspace 요청 없이 동일 조직·채널을 복원함을 확인했다.
- 실제 Buffer 계정에서의 최종 시각·탐색 확인을 사용자가 완료했다.
- 전체 unit suite는 이 feature branch의 parent merge 직전에 별도 승인을 받아 실행한다.
