# Settings Beta 앱 외부 연결 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-06-app-external-connections`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 완료 — parent merge 및 사용자 hands-on 확인 대기

## 사용자 필요와 목표

Settings Beta의 `앱 > 외부 연결`에서 외부에서 앱으로 들어오는 adapter를 일관된 card 패턴으로 관리한다. Telegram 알림 발송과 credential, Slack은 이 범위에 넣지 않는다.

## 범위

1. Telegram 명령 수신의 inbound 활성화와 runtime 상태
2. 원격 MCP server의 inbound 활성화와 runtime 상태
3. 공통 Settings card, badge, footer detail 및 feedback 규정 적용
4. 기존 설정 schema와 runtime consumer를 유지하는 scoped read/save 계약

## 명시적 비범위

- Telegram Bot Token·Chat ID·Slack Webhook 같은 credential 편집
- Telegram·Slack 발송 channel 선택
- 각 기능이 소유하는 알림 이벤트 설정
- 원격 MCP의 capability·agent business logic 확장
- 기존 `설정` surface 제거

## 제안 설계

- Telegram은 `부가 서비스 > 메시지·알림`에서 연결한 Bot Token·Chat ID를 사용하며, 이 화면에서는 명령 수신을 켜거나 끈다.
- 원격 MCP는 endpoint와 인증값을 이 화면에서 관리하되, 실제 외부 노출을 바꾸는 값은 명확한 설명과 validation을 제공한다.
- Telegram 발송 허용(`delivery_enabled`)과 inbound 수신(`inbound_enabled`)은 독립 저장값이다. legacy `enabled`만 있는 설정은 두 값의 fallback으로 읽는다.
- 지속 상태는 card header badge 하나, action 결과는 footer detail slot, 입력·validation 문제는 feedback surface 하나를 사용한다.

## 검증 계획

- 외부 연결 scoped API/service contract
- Telegram runtime 재시작 및 inbound/delivery 분리 contract
- Settings Beta UI contract와 관련 browser smoke
- 사용자 hands-on 확인: Telegram 명령 수신, 원격 MCP enable/disable

## 진행 기록

- 2026-09-09: parent branch에서 독립 sub-feature branch를 시작하고, Settings Beta App IA의 외부 연결 소유권을 기준으로 기존 runtime을 조사하기 시작했다.
- 2026-09-09: Telegram 명령 수신과 원격 MCP card, scoped read/save endpoint를 추가했다. Telegram delivery와 inbound flag는 분리해 적용하며, 원격 MCP token은 등록 여부만 read API로 반환한다.
- 2026-09-09: Telegram 수신 toggle은 credential이 연결된 경우에만 즉시 저장·runtime 재시작한다. 원격 MCP는 endpoint와 token을 명시적으로 적용할 때만 runtime을 재시작하며, tab 재진입 시 미저장 입력을 덮어쓰지 않는다.
- 2026-09-09: focused UI contract, scoped route/service contracts, Settings API smoke, browser smoke를 통과했다. 실제 Telegram 명령과 외부 MCP client 연결은 사용자 hands-on 확인이 남아 있다.

## 최종 결과와 인수 조건

- `앱 > 외부 연결`에서 Telegram inbound와 원격 MCP endpoint를 별도 card로 관리한다.
- Telegram inbound 전환은 credential 연결 여부를 확인한 뒤 runtime을 재시작하고, delivery flag를 변경하지 않는다.
- 원격 MCP는 명시적 적용 시에만 runtime을 재시작하며, Bearer Token은 저장 후 다시 반환하지 않는다.
- 자동 검증: Settings Beta UI contract, scoped route/service contract, Settings API smoke, browser smoke 통과.
- 수동 확인: Telegram 명령 수신 전환과 외부 MCP client의 enable/disable 연결 확인.
