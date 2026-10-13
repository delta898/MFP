# Retired UI Surface 제거 FBR 개발 기록

- Branch: `codex/fbr/retired-surface-removal`
- Start date: 2026-10-13
- Base/parent branch: `dev`
- Status: 첫 하위 단계 구현 완료; focused 검증/parent 통합 대기

## 사용자 필요와 목표

Production에서 숨겨져 더 이상 제품 경로로 쓰이지 않는 구 UI와 입력 흐름의 코드도 단계적으로 제거한다. 현재 Beta 화면과 공용 기능을 잘못 삭제하거나 서로 다른 경로가 엉키지 않도록 각 slice에서 호출 관계와 테스트를 확인하고, 작고 되돌리기 쉬운 변경으로 진행한다.

## 범위

- 이전 Dashboard 화면과 전용 코드 제거
- 이전 Blog 화면과 전용 코드 제거
- 이전 Settings 화면과 전용 코드 제거
- Blog Beta의 숨겨진 `원고 폴더` 및 `원고 붙여넣기` 입력 패널과 전용 코드의 필요성 확인 및 합의된 부분 제거
- Development에서만 보이는 `로그/이력` UI 제거 여부 검토 및 요청 범위 안에서 정리
- 각 단계에서 navigation, startup lifecycle, app composition, CSS, API caller, 계약 테스트를 함께 점검
- 현재 Dashboard Beta, Blog Beta, Settings Beta와 이들이 공유하는 기능을 보존

## 비범위

- 현재 Beta 화면의 기능 재설계 또는 사용자 UI 개편
- 공용 도메인, 저장 데이터, provider, posting capability를 legacy라는 이름만으로 제거
- persisted data 또는 API contract migration을 별도 분석 없이 수행
- `dev` 병합, push, release (각각의 후속 승인/요청이 있을 때만 진행)

## 제안 설계 및 단계

각 단계는 parent FBR에서 분리한 sub-feature branch로 진행하고, 독립적으로 검토·검증한 뒤 parent로 통합한다. 전체 작업은 다음과 같이 나눈다.

1. **Dashboard legacy**: 화면, nav, startup/visibility refresh 참조, 전용 script/style/test를 추적해 제거하고 Beta 경로 및 dashboard가 공유하는 activity API를 보존한다.
2. **Blog legacy**: 구 화면, legacy mode tabs/controllers/styles와 API 호출부를 추적한다. Blog Beta가 사용하는 공용 publishing, settings, manuscript 기능을 분리해 보존한다.
3. **Settings legacy**: 구 화면과 전용 UI 모듈을 추적한다. Beta에서 소비하는 foundation/utilities와 programmatic deep-link 호환이 필요한지 먼저 확인한다.
4. **숨겨진 폴더·붙여넣기 입력**: 미노출 panel, mode state, 전용 event/import path를 확인한다. 현재 AI 작성 흐름과 공용 manuscript draft/image API 사용을 유지할 수 있는지 검사하고 제거 범위를 좁힌다.
5. **로그/이력**: Production에 미노출되고 Development에만 보이는 진단용 surface다. 다른 화면이 쓰는 activity/log API 및 진단 흐름과 분리한 뒤 UI 및 전용 caller 제거 범위를 확정한다.
6. **마무리**: 남은 legacy nav/view/style references를 검색하고, compatibility containment/backlog 상태를 실제 결과에 맞게 갱신한다.

모든 단계에서 기준은 `Production에서 숨겨져 있는가`만이 아니라 `어떤 caller가 남아 있는가`, `현재 Beta 또는 공용 capability가 소비하는가`, `기존 테스트가 어떤 계약을 보호하는가`이다. 사용자가 의도한 legacy-only 범위가 확인되지 않는 코드는 보존한다.

## 결정 및 trade-off

- 2026-10-13: 사용자는 Production에서 메뉴가 숨겨져 있는 구 화면·입력 흐름의 코드도 정리하되, 현재 기능을 잘못 삭제하거나 side effect를 만들지 않도록 FBR에서 한 항목씩 확인하길 원했다.
- 2026-10-13: 첫 조사에서 구 Dashboard, Blog, Settings 메뉴가 숨겨져 있고 대응 Beta 메뉴가 보이는 것을 확인했다. Settings legacy route는 `settings-next`로 이동시키며, Blog Beta에는 folder/paste panel이 숨겨진 상태로 markup과 controller가 남아 있다.
- 2026-10-13: 로그 화면은 Beta 대체 화면이 아니라 local/development에서만 노출되는 진단 surface다. 해당 UI 제거와 shared activity/log API 제거는 동일한 작업으로 간주하지 않는다.
- 첫 하위 단계는 `codex/feat/remove-legacy-dashboard`에서 진행했다. 세부 의존성, 결정, 삭제 범위와 검증 상태는 [Dashboard 단계 기록](2026-10-13-retired-dashboard-removal-development.md)에 정리했다.

## 영향 경계 및 검증

- Shell: `ui/index.html`, view partial composition, `ui/scripts/foundation/navigation.js`, `ui/scripts/foundation/lifecycle.js`
- Feature JS/CSS: `ui/scripts/features/` 및 `ui/styles/features/`, app composition manifests
- API/service: 화면 전용 호출과 Beta/다른 surface의 공유 caller 분리
- Contracts: UI structure, navigation, browser smoke, route/service tests

각 sub-feature는 해당 동작에 대한 focused contract/unit test와 필요한 browser smoke를 수행한다. Parent FBR을 `dev`에 병합하기 전 전체 unit suite 승인을 별도로 받는다.

## 결과 및 남은 확인

- 첫 단계에서 이전 Dashboard UI, 전용 코드/API를 제거하고 Beta dashboard와 로그 조회/event 기록 경로를 보존했다.
- 자동 검증: 아직 실행하지 않았다. 첫 단계 기록의 검증 대기 항목을 parent 통합 전에 처리한다.
- 사용자 확인: 현재 Dashboard Beta, 블로그 필터/탭, 네이버 세션 상태 알림, 로그/이력 화면의 진입 및 동작을 확인한다.
- 남은 작업: Blog legacy, Settings legacy, folder/paste 입력, dev-only logs UI를 각각 별도 하위 단계로 조사하고 진행한다. 첫 단계는 focused/browser 검증 후 parent branch에 통합한다.
