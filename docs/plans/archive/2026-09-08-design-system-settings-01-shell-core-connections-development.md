# 설정 Beta shell 및 기본 연결 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-01-shell-core-connections`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-08
- Status: 공용 settings-card pattern/controller 추출 및 focused/browser 검증 완료 — 사용자 UI 검토 대기

## 사용자 필요와 목표

기존 `설정`을 건드리지 않고 별도의 `설정 Beta`를 추가한다. Blog Beta와 일관된 top menu·local navigation·panel 시작 문법을 사용하고, 첫 top menu인 `기본 연결`에서 `콘텐츠 공간`과 `블로그 발행 채널`을 명확한 상태와 행동으로 관리할 수 있게 한다.

## 범위

- sidebar의 독립 `설정 Beta` 진입점과 `view-settings-next`
- 여섯 top menu의 공통 navigation shell
- `기본 연결`의 local navigation
- `콘텐츠 공간`: Google 계정, Google Spreadsheet와 접근 상태
- `블로그 발행 채널`: 네이버 블로그와 워드프레스 연결 상태 및 설정
- 신규 surface 전용 controller·draft·dirty/save 상태
- 기존 `config.json` schema를 보존하는 기본 연결 전용 scoped save API
- 두 정식 style과 반응형·keyboard navigation 검증

## 명시적 비범위

- 기존 `view-settings` HTML·CSS·동작 변경
- AI, 글쓰기, 발행, 부가 서비스, 앱 panel의 상세 설정 migration
- 기존 dashboard 및 다른 feature의 설정 deep link 전환
- 타이핑 속도, 이미지 최적화와 브라우저 표시 방식의 최종 위치 또는 local override 구현
- 설정 profile/group schema 도입

## 제안 설계

### Surface 경계

- 기존 `view-settings`와 ID 및 event lifecycle을 공유하지 않는 `view-settings-next`를 추가한다.
- API client와 server contract는 재사용하되 DOM controller와 dirty state는 신규 surface가 소유한다.
- 미완성 top menu는 기존 설정을 복제하지 않는다. 단계별 migration 전에는 명확한 준비 상태와 기존 설정 진입 방향을 제공할지 구현 조사 후 결정한다.

### Panel anatomy

```text
top menu
→ local segmented navigation
→ 제목 + 한 줄 설명
→ 준비/연결 상태와 도구
→ 주요 설정
→ 현재 panel의 저장 action과 feedback
```

### 기본 연결

- `콘텐츠 공간`: 사용자 목적을 메뉴 이름으로 사용하고 실제 provider는 panel 안에서 `Google 계정`, `Google Spreadsheet`로 표현한다.
- `블로그 발행 채널`: 하나 이상의 채널 연결을 목표로 하고 네이버 블로그와 워드프레스의 상태·action을 같은 정보 위계로 제공한다.
- 즉시 실행되는 인증·테스트와 저장 후 반영되는 field를 시각적·상태적으로 구분한다.

## 구현 단계

1. 현재 composition, navigation, settings API 및 test boundary 조사
2. 신규 shell과 top/local tab 접근성 구현
3. 콘텐츠 공간 연결과 scoped save 구현
4. 블로그 발행 채널 연결과 scoped save 구현
5. 두 style 및 narrow layout 정리
6. focused contract와 browser smoke
7. 사용자 UI 검토 후 parent 통합 준비

## 사용자와 결정한 사항

- 기존 설정은 유지하고 설정 Beta를 새로 만든다.
- 설정 Beta는 Blog Beta의 top menu·sub-menu·panel anatomy와 정보 위계를 참고한다.
- 첫 top menu는 `기본 연결`이다.
- 기본 연결의 sub-menu는 `콘텐츠 공간`, `블로그 발행 채널`이다.
- 메뉴 이름에 현재 provider인 Google을 고정하지 않는다.
- 타이핑 속도 등 여러 메뉴가 공유하는 값은 설정의 공통 기본값과 local override 방향을 따르되 이번 stage에는 포함하지 않는다.
- 파일명은 기존 `config.json`을 유지하고 `general`, `platforms.naver`, `platforms.wordpress` 내부 schema도 그대로 사용한다.
- 새 화면의 API payload는 panel 단위로 분리하되 저장소를 이원화하거나 Beta 전용 schema를 만들지 않는다.

## 진행 및 변경 기록

- 2026-09-08: settings main branch에서 첫 sub-feature branch를 시작했다.
- 2026-09-08: parent와 이 stage의 개발 기록을 생성했다.
- 2026-09-08: sidebar에 기존 `설정`과 공존하는 `설정 Beta` 진입점과 독립 `view-settings-next`를 추가했다.
- 2026-09-08: 여섯 top tab과 `콘텐츠 공간`, `블로그 발행 채널` local tab 및 keyboard navigation을 구현했다.
- 2026-09-08: Google 계정·Spreadsheet, 네이버 로그인, 워드프레스 연결 상태와 저장·확인 흐름을 구성했다.
- 2026-09-08: `content`, `naver`, `wordpress`만 부분 저장하는 `/api/v1/settings/core-connections`를 추가했다. 기존 AI·자동화·알림 등 다른 JSON 값은 보존하고 손상된 JSON은 덮어쓰지 않는다.
- 2026-09-08: surface 전용 dirty scope와 이탈 확인을 추가하고 기존 Settings controller 및 DOM ID와 분리했다.
- 2026-09-08: 첫 사용자 UI 검토에서 Settings Beta 헤더의 Timer Widget 누락과 Blog Beta와 다른 top/local navigation anatomy를 확인했다.
- 2026-09-08: Blog Beta와 Settings Beta가 같은 `partials/views/shared/page-clock-widget.html`, 공통 clock component style과 초기화 코드를 조합하도록 Timer Widget을 공용화했다. 함께 사용하는 `ui-top-*`, `ui-segmented-*` navigation pattern도 추출하고, 기본 연결 panel을 `intro → local navigation + tool → status → content` 순서의 공통 content frame으로 교정했다.
- 2026-09-08: Blog Beta feature CSS에 남아 있던 공통 tab 시각 규칙을 제거해 navigation pattern의 단일 소유권을 확립하고, danger action도 공통 `.ui-danger-action` variant로 통일했다.
- 2026-09-09: Blog Beta와 Settings Beta에 중복되어 있던 방향키·Home/End 탭 계산을 공통 `handleUiTabNavigationKeydown` controller로 통합했다. 각 feature는 이탈 확인과 panel load 같은 업무 activation만 소유한다.
- 2026-09-09: 사용자 디자인 검토에 따라 connection card footer를 `danger start / 저장 상태 + completion end`로 통일하고 불필요한 세로 간격을 줄였다. 블로그 발행 채널의 단일 합산 summary를 네이버 블로그·워드프레스 1:1 readiness card로 교체해 두 provider의 동등한 제품 위계를 명시했다.
- 2026-09-09: hands-on 검토에서 네이버 로그인 성공 뒤 로그인·로그아웃이 동시에 보이고, 워드프레스 확인 완료 뒤 진행 문구가 남는 상태 전이 누락을 확인했다. 로그인 성공 시 재로그인 action을 숨기고, 워드프레스 footer는 작업 종료 후 저장 상태로 복구하며 상세 성공 feedback만 별도로 유지하도록 교정했다.
- 2026-09-09: 연결 해제·로그아웃은 복구 불가능한 삭제가 아니라 같은 connection의 문맥적 action이라는 사용자 판단을 반영했다. 관련 action을 오른쪽 group에 함께 배치하고 danger outline·확인 dialog로 구분하며, 저장은 자동이 아니라 `저장하고 확인/로그인`에서 수행하도록 유지했다. 저장 후 외부 확인만 실패한 경우에는 persistence 성공과 확인 실패를 함께 표시한다.
- 2026-09-09: persistence는 사용자의 목적이 아니라 내부 단계라는 후속 결정을 반영했다. button과 정상 상태에서 `저장하고`, `저장됨`을 제거하고 `접근 확인`, `로그인`, `연결 확인`만 노출한다. 입력만으로 자동 반영하지 않고 목적 action에서 seamless하게 처리하며, 부분 실패 때만 값이 반영됐음을 예외 feedback으로 알린다.
- 2026-09-09: connection card의 상태와 action 위치가 provider마다 달라지는 문제를 공통 anatomy로 고정했다. 모든 card는 `header(지속 상태 badge 1개) → body → feedback 1개 → footer(action 전용)`를 따르며, loading은 실행 button에서만 표현한다. 워드프레스 검증 직후에도 button이 오래 loading이던 원인은 direct verify 뒤 aggregate status refresh를 `await`한 것이었다. direct operation 완료와 함께 busy를 해제하고 전체 readiness reconciliation은 background에서 수행하도록 분리했다.
- 2026-09-09: 정상 success feedback이 새로 나타날 때 footer button이 아래로 이동한다는 UI 검토를 반영했다. 정상 성공은 header badge만 갱신하고 inline feedback을 비운다. 예외 feedback은 한 줄 높이를 상시 예약해 long message도 줄임 처리하며 footer를 움직이지 않도록 규정·구현·contract test를 보완했다.
- 2026-09-09: 기본 연결 panel의 수동 refresh는 작은 상태 하나를 갱신하는 icon action이 아니라 settings 값과 여러 external connection을 다시 읽는 panel-level recovery action으로 확정했다. secondary text button `새로고침`을 사용하고, 외부 권한·세션·공유 변경 또는 최신 확인 실패에서만 필요한 보조 도구라는 규정을 추가했다.
- 2026-09-09: 저장된 WordPress application password는 원문·부분값·길이를 Settings Beta와 core connection response에 보내지 않고 `등록됨` boolean만 제공하도록 전환했다. 빈 secret input은 기존 값을 유지하며, 새로 직접 입력한 값에만 보기/숨기기 icon control을 제공한다.
- 2026-09-09: readiness summary는 대응하는 connection card로 이동하는 1:1 detail jump로 확정했다. settings card는 고정 높이·footer spacer 없이 content-driven compact density로 구성해, 정상 card의 큰 빈 공간을 제거하면서 feedback/action anchor 규칙은 유지한다.
- 2026-09-09: 사용자 UI 검토에서 compact card의 빈 feedback reservation과 행 gap이 여전히 크게 보이는 것을 확인했다. feedback은 action 위치 안정성을 위해 실제 한 줄만 예약하고 별도 padding을 두지 않으며, card 내부 gap을 compact density로 낮췄다.
- 2026-09-09: baseline을 먼저 커밋한 뒤, Settings Beta에만 있던 readiness card·card anatomy·feedback/jump DOM 조작을 공용 `settings-card` pattern/controller로 추출했다. 공통 layer는 visual anatomy와 local detail 이동만 맡고, Google·네이버·워드프레스의 연결 workflow는 feature controller에 유지한다. 이는 copy/paste 없이 후속 설정 탭이 동일한 card contract를 사용할 수 있게 하는 경계다.
- 2026-09-09: Spreadsheet `접근 확인`이 Google OAuth 상태만 재확인하고 성공 결과를 card badge·readiness summary에 반영하지 않던 누락을 교정했다. 실제 Spreadsheet 조회 성공은 두 surface를 `접근 가능`으로 갱신하고, 실패는 `확인 실패`로, 주소 편집은 `접근 확인 필요`로 즉시 되돌린다.
- 2026-09-08: 저장된 credential과 실제 연결 성공을 구분하고, 최초 load 실패·갱신 실패·연결별 동시 실행 잠금 규약을 Settings Beta controller에 반영했다.
- 2026-09-08: 설정과 local override의 소유권, 필수 연결과 선택적 부가 서비스의 배치 기준을 canonical `settings-information-architecture.md`로 승격했다.

## 검증

- 신규 backend route/service focused tests: 6 passed
- Settings Beta·UI structure·design style focused contracts 포함: 36 passed
- WordPress secret read/write boundary focused tests 포함: 31 passed (latest secret-field run)
- settings API smoke: passed
- browser UI smoke: passed, latest run 229 fixture requests. Settings Beta 진입, Timer 렌더링, top/local tab 방향키와 Home 이동을 명시적으로 포함했다.
- browser UI smoke: passed, latest secret-field run 226 fixture requests.
- 공용 settings-card pattern/controller focused contracts: 30 passed.
- browser UI smoke: passed, latest shared-card run 228 fixture requests. Settings Beta의 summary-to-detail focus 이동을 포함했다.
- browser UI smoke: passed, latest summary-jump/compact-density run 236 fixture requests (summary click → form focus 포함).
- browser UI smoke: passed, latest Spreadsheet verification run 240 fixture requests (접근 확인 → card badge·readiness summary `접근 가능` 포함).
- JavaScript syntax 및 Git whitespace check: passed
- Full TC: 1,540 passed, 0 failed, 1 skipped.
- 사용자 hands-on UI 확인: 대기

## 남은 위험과 확인 사항

- 기존 settings script의 전역 DOM ID 및 dirty/save 상태와 충돌하지 않도록 신규 namespace와 controller를 사용했다. 이후 migration에서도 이 경계를 유지해야 한다.
- Google·네이버 인증과 워드프레스 확인은 기존 session/OAuth API를 사용하고, 설정값 저장만 scoped API가 소유한다.
- 미구현 top menu는 현재 IA를 확인할 수 있는 placeholder와 기존 설정 바로가기를 제공한다. 각 stage가 완료될 때 순차적으로 실제 panel로 대체해야 한다.
- 최종 시각 위계와 narrow layout은 사용자 UI 검토가 필요하다.
- Timer Widget과 공통 navigation의 최종 시각적 인상은 사용자 hands-on UI 확인이 필요하다.
