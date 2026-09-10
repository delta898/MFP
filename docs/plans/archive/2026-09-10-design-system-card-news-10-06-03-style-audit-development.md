# Card News style hard-coding 전수 검사 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-06-03-style-audit`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · parent 병합 준비

## 사용자 필요와 목표

Card News 전체에서 특정 style이나 색상·치수에 종속된 hard-coding을 전수 검사한다. 현재 기본 style뿐 아니라
초기에 검토한 대안 style도 같은 DOM과 동작을 공유하고, 시각적 차이는 공통 semantic/component token으로만
표현되게 한다.

## 범위

1. Card News HTML의 inline style 및 화면별 style 속성 검사
2. Card News JavaScript의 색상·치수·style ID 분기 검사
3. Card News feature CSS의 raw color, 고정 그림자·radius·spacing·typography 검사
4. 공통 pattern과 style token을 우회하는 선언 교체
5. hard-coding 재유입을 막는 focused contract test 보강

## 명시적 비범위

- Card News 상태와 재진입 기능 변경
- RSS 조회 개수, 삭제, 주기 발행 기능
- Card News 외 화면의 전면 style 이관
- 실제 외부 AI·Buffer·Google Drive 호출

## 설계 원칙

- style ID를 feature selector나 JavaScript 조건으로 사용하지 않는다.
- 상태와 action의 의미는 semantic/component token으로 표현한다.
- 콘텐츠 비율처럼 제품 의미가 있는 치수와 responsive breakpoint는 무조건 제거하지 않고 근거를 확인한다.
- 공통 component로 승격 가능한 값은 feature별 새 token을 늘리기 전에 기존 pattern을 재사용한다.
- 구현 중 focused contract test만 실행하며, browser 회귀와 전체 단위 테스트는 사용자 승인 뒤 실행한다.

## 조사·구현 결과

- Card News 전용 HTML에는 inline style이 없었고, 네 JavaScript module에도 style ID 분기, 직접 style mutation,
  raw color 설정이 없음을 확인했다.
- `card-news-management.css`의 ZIP 가져오기 영역에서 compatibility 시절의 푸른 border/background, 고정
  success/danger 색, dark sequence badge, raw focus shadow와 legacy alias 사용을 발견했다.
- 기본 source/preview/generation CSS에 남은 legacy text/radius alias, 고정 type size·weight와 반복 spacing을
  semantic typography·spacing·shape token으로 교체했다.
- ZIP panel, preview item, field, 상태 안내와 managed error를 공통 surface, border, action, status, focus와
  typography token으로 교체했다. 따라서 Warm Editorial과 Quiet Sage가 같은 구조에서 각자의 palette, density,
  radius와 elevation을 표현한다.
- 결과·발행 CSS를 포함한 세 feature stylesheet에서 cascade를 강제하던 `!important`를 제거하고 더 구체적인
  hidden selector 계약으로 유지했다.
- Card News의 세 stylesheet를 공통 design-system 금지값 검사 대상에 포함하고, 고정 색·raw shadow·style
  selector·legacy alias·고정 type·inline presentation·JavaScript presentation 분기의 재유입을 막았다.
- 카드 이미지 비율, 목록 viewport/row 높이, 입력 최소 높이와 responsive breakpoint는 취향 값이 아니라 동일
  workflow와 상호작용 영역을 유지하는 feature geometry로 분류해 보존했다.

## 검증과 남은 위험

- focused contract: `node --test scripts/design-style-foundation.test.js scripts/card-news-shell-contract.test.js`
  — 30/30 통과
- 정적 전수 검사 결과 Card News feature CSS의 raw color, numeric type, legacy alias와 `!important`, HTML inline
  style, JavaScript style 분기는 0건이다.
- browser 회귀: `npm run test:ui-browser` — 통과, 250 fixture 요청
- 전체 단위 회귀: `npm run test:unit` — 1,599건 중 1,598건 통과, 플랫폼 전용 1건 정상 skip
- 실제 앱에서 ZIP 가져오기, source preview와 카드 결과가 Warm Editorial 기준으로 자연스럽고, 향후 style 전환 시
  Quiet Sage의 density·radius·palette가 같은 정보 위계로 반영되는지 사용자 확인이 남아 있다.
