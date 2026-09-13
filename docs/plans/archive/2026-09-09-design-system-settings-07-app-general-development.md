# Settings Beta 앱 일반 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-07-app-general`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 완료 — Settings Beta parent 및 디자인 시스템 parent에 통합

## 사용자 필요와 목표

Settings Beta의 `앱 > 일반`에 기존 설정의 UI 서버 접속 설정을 일관된 card로 옮긴다. 외부 MCP와 혼동하지 않고, 변경이 실제 UI server 재시작 동작으로 이어져야 한다.

## 범위

1. `LISTEN_HOST`, `LISTEN_PORT`의 safe read/save scoped API
2. `앱 > 일반` UI server card와 재시작 안내
3. 앱 업데이트 확인·최신 버전 강제 설치 action
4. 기존 `settings.service`의 host/port validation 및 restart scheduling 재사용
4. focused API/UI contract 및 Settings smoke 검증

## 명시적 비범위

- 원격 MCP endpoint와 인증 설정
- Telegram 등 외부 수신 adapter
- legacy 설정 surface 제거
- 자동 발행·browser headless 정책

## 설계

- Host와 Port는 앱 자체가 수신하는 UI server 경계로서 `앱 > 일반`이 소유한다.
- 값이 달라질 때에만 기존 `scheduleUiReload(host, port)`를 호출한다.
- 설정 저장은 major 설정의 전체 payload를 다시 쓰지 않고 app-general scope만 수정한다.
- 사용자가 누른 적용 button만 loading 상태를 표시하고, 재시작 예정 결과는 footer detail slot으로 안내한다.

## 결과와 검증

- `앱 > 일반`에 UI server 접속 주소와 포트를 관리하는 card를 추가했다.
- 앱 업데이트 card는 일반 확인과 선택 채널 최신 버전 강제 설치를 제공한다. 강제 설치는 현재 버전 재설치가 아니라 cache·버전 비교를 우회해 최신 릴리즈를 선택한다.
- 값은 scoped API로 저장하며, 실제 변경일 때만 기존 `scheduleUiReload`를 통해 새 주소로 재시작한다.
- 자동 검증: updater contract, Settings Beta UI contract, route/service contract, Settings API smoke, browser smoke 통과.
- 수동 확인: 포트를 사용하지 않는 값으로 변경한 뒤 안내된 새 주소에서 화면이 다시 열리는지 확인하고, 최신 버전 강제 설치가 최신 release를 선택하는지 확인.
