# Card News SNS 발행 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-05-publishing`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · parent branch 병합 준비

## 사용자 필요와 목표

완성한 카드뉴스를 Buffer 채널에 발행하는 흐름을 현재 디자인 시스템과 같은 정보 구조로 정리한다. 연결 설정은
Settings Beta가 소유하고, 카드뉴스는 이번 실행의 채널·문구·결과만 다룬다. Bitly가 설정되어 있으면 카드뉴스 원문
주소에도 실제로 적용해 설정 안내와 동작을 일치시킨다.

## 범위

1. 완성 결과 아래에 사전 조건 기반의 inline `3단계 · 선택` 발행 surface 추가
2. 공통 workflow-card와 selectable-card pattern 재사용
3. Buffer·Google Drive readiness, 채널 선택, 발행 문구와 footer feedback 위계 정리
4. 진행·완료·요청 완료·부분 실패·실패 및 실패 채널 재시도 표현 정리
5. 공통 URL 단축 capability를 통한 선택적 Bitly 적용과 원본 URL fallback
6. 두 product style, responsive, keyboard/focus와 fixture 기반 자동 검증

## 명시적 비범위

- Buffer API, Google Drive media transport와 terminal polling 방식 재설계
- 자동 또는 예약 카드뉴스 발행 추가
- Card News 목록 상태·재진입 규칙 통합
- 실제 외부 Buffer·Bitly·Google Drive 호출을 포함한 테스트

## 설계

- 완성 결과를 보면서 이어서 선택해야 하므로 발행은 modal이 아닌 다음 inline workflow 단계가 소유한다.
- Buffer 연결·호환 채널, Google Drive 전달과 완성 이미지가 준비된 뒤에만 3단계를 표시한다. 미충족 사유는 결과
  surface의 feedback에 정확한 설정 위치만 안내하고 현재 작업 화면에서 내부 설정 화면으로 이동시키지 않는다.
- header에는 제목·설명과 별도 web page로 여는 Buffer 도움말만 두고, footer에는 primary 발행 action만 둔다.
- channel checkbox는 이번 실행 대상을 고르는 selectable-card다. 비호환·이미 발행 완료 상태와 이유를 같은 item에서
  알 수 있어야 한다.
- 정상 readiness를 반복하지 않고 warning/error만 사용자가 대응할 수 있는 feedback으로 표시한다. 실행 결과는
  channel별 행으로 보존하며 부분 성공 뒤에는 실패 channel만 다시 시도한다.
- URL 단축은 publishing service에 주입된 capability로 3단계 표시 전에 준비한다. 단축된 source URL을 발행 문구에
  바로 보여 주고 모든 channel이 재사용한다. provider 미설정·실패는 원본 URL로 fallback하며 단계 표시를 막지 않는다.

## 구현 단계

1. 공통 workflow/selectable-card pattern 정리
2. Card News inline 3단계 DOM·style 이관
3. 사전 조건·selection·operation state 정리
4. Bitly URL 단축 capability 연결과 fallback 검증
5. focused contract/service test와 browser smoke
6. 사용자 UI 확인, full unit gate, parent merge

## 결정과 변경 이력

- 2026-09-10: 사용자는 기존 발행 기능을 유지하면서 Settings Beta와 같은 디자인 문법으로 정리하는 계획을 승인했다.
- 2026-09-10: 코드 확인 결과 SNS 자동 배포만 Bitly를 사용하고 Card News는 원본 URL을 그대로 사용해, Settings Beta의
  `카드뉴스에서도 사용` 안내와 실제 동작이 불일치함을 확인했다. 이번 slice에 capability 기반 단축과 fallback을 포함한다.
- 2026-09-10: Card News가 Bitly API와 token을 직접 다루지 않도록 provider-neutral URL 단축 service를 추가했다.
  현재 Bitly adapter는 runtime 조립부에만 위치하며 Card News, SNS 배포와 자동 발행 알림은 공통 `shorten(url)` 계약만
  사용한다. provider 미설정·실패 시에는 원문 URL을 반환한다.
- 2026-09-10: 공통 transactional dialog와 selectable-card CSS를 추가하고 source manager 및 SNS 발행 dialog가 같은
  중앙 배치·footer·responsive 계약을 사용하도록 변경했다. Card News 전용 CSS는 업무 layout만 남겼다.
- 2026-09-10: 내부 도움말·설정 이동 뒤 native dialog가 숨은 top layer로 남아 앱 입력을 막는 문제와 복귀 문맥의
  복잡성을 확인했다. 사용자는 발행 중 화면 이동이 없어야 한다고 결정했다. SNS 발행을 완성 결과 아래의 inline
  `3단계 · 선택`으로 변경하고, 내부 설정 이동 action을 제거했다. source manager만 transactional dialog를 유지한다.
- 2026-09-10: 단축 URL은 3단계 준비 시점에 발행 문구에 반영한다. UI는 특정 단축 provider를 언급하지 않으며
  준비 실패 시 원본 URL을 그대로 보여 준다. Buffer 도움말만 외부 새 page로 연다.
- 2026-09-10: 첫 inline 구현에서 workflow card 외형만 재사용하고 내부 padding과 앞 단계 간격을 빠뜨려 내용이
  card 경계에 붙는 시각적 회귀가 발생했다. publishing panel 자체가 공통 spacing token으로 inset과 단계 간격을
  소유하도록 보정하고, browser smoke에 header·footer의 실제 geometry 검증을 추가했다.
- 2026-09-10: native fieldset의 legend에는 grid gap이 안정적으로 적용되지 않아 `발행 채널`과 card grid가 붙었다.
  `.ui-selectable-card-group`이 공통 spacing token으로 legend 아래 간격을 소유하도록 pattern과 계약을 보강했다.
- 2026-09-10: 첫 full unit gate에서 Card News 외부 도움말 계약, script/style manifest, 파일 크기 한도 등 구조 계약
  4건이 실패했다. 발행 UI를 별도 module로 분리하고 manifest와 Help 계약을 실제 설계에 맞춰 보정했으며, URL 단축
  runtime 조립도 공통 factory로 이동해 경계를 명확히 했다.
- 2026-09-10: 사용자가 최종 UI와 CMD 진행을 승인했다.

## 검증 계획

- Card News shell/design contract
- Card News publishing service focused unit test
- Browser smoke: inline 단계 표시, 사전 조건, 외부 도움말, channel selection, 발행 중 잠금, 완료·부분 실패·재시도
- URL 단축 성공, 미설정, 실패 fallback, 직접 입력 URL 비변경
- 사용자 수동 확인 후 승인을 받아 full unit suite를 실행한다.

## 구현 결과와 자동 검증

- SNS 발행을 완성 결과 아래의 inline `3단계 · 선택`으로 전환했다.
- 연결 미준비 상태에는 Settings Beta의 정확한 Buffer·Google 계정 위치를 안내하되 작업 화면을 이탈시키는 action은 두지 않는다.
- 채널은 공통 selectable-card로 표시하며 server가 제공하는 최대 선택 수, 비호환 및 이미 성공한 채널을 반영한다.
- channel별 결과를 유지하고 부분 성공 시 성공 채널은 잠근 채 실패 채널만 다시 실행할 수 있다.
- 공통 URL 단축 capability와 provider registry를 추가했다. 현재 runtime은 Bitly adapter를 조립하지만 소비 기능은
  provider와 credential을 알지 않는다. 카드뉴스 원문 URL만 한 번 단축해 모든 선택 채널에 재사용하고, 실패 시 원문을 쓴다.
- focused unit/contract: Card News·SNS·자동 발행·URL 단축·디자인·구조 계약 관련 검사 통과.
- full unit suite: 1,589개 통과, 실패 0, 환경 의존 1개 스킵.
- browser UI smoke: 253 fixture 요청 통과. inline 단계 배치와 내부 padding, legend와 channel card 사이의 실제 간격,
  준비된 단축 URL 표시, 외부 도움말, 채널 선택과 Buffer·Google 계정 미준비 시 단계 차단을 확인했다.
- 실제 Buffer·Bitly·Google Drive 호출은 수행하지 않았다.

## 남은 위험과 후속 작업

- 목록의 `구성 있음/작업 중` 상태와 재진입 동작은 후속 기능 정합성 단계에서 통합한다.
- 실제 Buffer/Google Drive 장시간 응답과 원격 발행 누락 관측은 별도 기능 테스트에서 확인한다.
- 실제 외부 서비스의 연결 미준비·부분 실패 흐름은 후속 통합 기능 테스트에서 확인한다.
