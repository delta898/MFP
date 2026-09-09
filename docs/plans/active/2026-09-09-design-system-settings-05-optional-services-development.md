# Settings Beta 부가 서비스 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-05-optional-services`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 진행 중

## 사용자 필요와 목표

여러 기능에서 선택적으로 공유하는 외부 서비스를 Settings Beta의 한 곳에서 목적별로 관리한다. Buffer는 SNS·카드뉴스 발행, Bitly는 Telegram 알림·SNS 자동 발행과 향후 카드뉴스 URL 단축, Telegram은 알림·MCP, Slack은 알림에 사용한다. 기존 Settings Beta의 공통 card anatomy, 상태·action 배치, seamless 저장과 secret 정책을 복사하지 않고 재사용한다.

## 범위

1. `부가 서비스`의 `SNS 배포 / 메시지·알림 / 링크 단축` local navigation
2. Buffer, Telegram, Slack, Bitly의 readiness summary와 detail card
3. provider별 설정 read/update/connection test를 Settings Beta scoped API로 연결
4. 저장된 secret 비노출·새 입력만 보기/숨기기·빈 입력 시 기존 값 유지
5. 기존 config와 runtime 소비자를 유지하면서 Bitly의 공통 소유권을 UI와 service boundary에 반영
6. 공통 Settings card/controller와 style token 재사용 및 focused UI/domain/browser 검증

## 명시적 비범위

- SNS·카드뉴스·Telegram·Slack 기능 자체의 재설계
- 자동 발행 활성화, 주기 또는 콘텐츠별 선택을 부가 서비스 연결 카드로 이동
- 새 provider 추가
- 기존 `설정` 화면 제거
- parent merge, release, tag, push

## 합의한 설계

- local menu는 provider가 아니라 사용 목적을 표현한다.
- `SNS 배포`는 Buffer 연결과 사용 가능한 organization/channel을 관리한다.
- `메시지·알림`은 Telegram과 Slack을 함께 보여주되 각 서비스의 실제 역할과 상태를 구분한다.
- `링크 단축`은 Bitly를 Telegram에 종속시키지 않고 여러 기능이 참조하는 공통 연결로 표현한다.
- 연결 설정과 각 기능의 실행·자동화 설정을 섞지 않는다.
- secret과 action lifecycle은 Settings Beta 공통 계약을 그대로 따른다.

## 구현 단계

1. 기존 설정 값·runtime·test API와 Settings Beta 공통 component 경계 조사
2. 부가 서비스 scoped read/write/test 계약 추가
3. 목적별 navigation, summary, detail card UI 연결
4. secret·dirty state·async feedback·stable footer 동작 통합
5. canonical IA와 design/component 규정 현행화
6. focused unit/UI contract와 browser smoke 후 사용자 확인

## 검증 계획

- 각 local menu와 summary-to-detail 이동이 일관된지 확인
- 저장된 secret 원문·일부 마스킹값이 client payload에 포함되지 않는지 확인
- 새 secret 입력과 빈 입력의 유지 의미가 구분되는지 확인
- test 중 상태·button 위치가 이동하거나 중복 표시되지 않는지 확인
- Buffer channel 선택, Telegram/Slack test, Bitly test가 기존 runtime과 회귀 없이 연결되는지 확인
- 관련 focused unit/UI contract 및 browser smoke

## 진행 기록

- 2026-09-09: 사용자가 목적 기반 `SNS 배포 / 메시지·알림 / 링크 단축` 구조를 승인했다.
- 2026-09-09: Buffer는 SNS·카드뉴스, Bitly는 Telegram·SNS 자동 발행과 향후 카드뉴스, Telegram은 알림·MCP, Slack은 알림에 사용한다는 실제 관계를 확인했다.

## 현재 결과와 남은 확인

- 구현 전.
