# 디자인 시스템 2단계 Style Foundation 개발 기록

## Branch

- Branch: `codex/feature/design-system-02-foundation`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-06
- Status: 완료, parent merge 승인

## 사용자 필요

새 스타일을 바로 덧씌우는 대신, 현재 외형과 기능을 유지하면서 여러 style을 안전하게 추가할 수 있는 실제 코드 기반을 만든다. 사용자는 2단계가 끝난 뒤에도 익숙한 BlogGenius를 그대로 사용할 수 있어야 하며, 이후 style 작업은 화면마다 값을 다시 고치는 대신 공통 계약을 통해 진행할 수 있어야 한다.

## 목표

1. 앱이 등록된 style을 명시적으로 선택하고 알 수 없는 값에는 안전하게 fallback한다.
2. 공통 shell과 `블로그 Beta`가 의미 기반 token을 통해 compatibility style을 사용한다.
3. 현재 외형은 의도적으로 바꾸지 않되, 미정의 token처럼 실제 선언을 무효화하는 명백한 결함은 바로잡는다.
4. 필수 token 누락과 허용되지 않은 미정의 custom property를 자동 검출한다.
5. 기능, DOM, ARIA, loading/error 상태와 사용자 입력 보존 동작이 foundation 도입 전후 동일함을 검증한다.
6. 완료 후 Design Principles Gate 1을 반드시 수행하고 사용자 합의 전에는 첫 정식 style 단계로 넘어가지 않는다.

## 범위

### 포함

- 단일 축 style registry와 기본 `compatibility` style
- document root의 `data-style="compatibility"` 계약
- semantic color, typography, spacing, radius, elevation, motion token의 초기 필수 집합
- 기존 전역 token을 새 semantic token에 연결하는 compatibility alias
- 공통 shell과 `블로그 Beta`의 제한된 semantic token migration
- `--text-secondary`, `--brand`, `--border-color`, `--shadow-soft` 등 미정의 전역 token 참조 교정
- style contract completeness와 미정의 custom property 자동 검사
- focused UI contract, browser smoke와 전체 단위 회귀 검증
- Gate 1 검토 자료와 사용자 수동 확인 flow 정리

### 명시적 비범위

- 첫 번째 정식 신규 style의 시각 디자인
- style 선택 UI 또는 사용자 설정 저장
- 별도 light/dark theme 축
- Dashboard, 카드뉴스, 쇼핑커넥트, SNS, 설정 등 전체 surface migration
- legacy `블로그`의 UI나 동작 변경
- 모든 원시 색상, font-size, radius와 inline style의 일괄 제거
- feature 기능, 정보 구조, DOM hierarchy 또는 API 동작 변경
- 버전 변경, release, tag, push 또는 배포

## 제안 구조

```text
ui/styles.css
├─ styles/styles/compatibility.css
├─ styles/tokens/legacy-aliases.css
├─ styles/base/foundation.css
├─ styles/layout/...
├─ styles/components/...
└─ styles/features/...

ui/app.js
└─ scripts/foundation/style-system.js
```

- `compatibility.css`는 현재 외형을 구성하는 primitive와 semantic 값을 공급한다.
- `legacy-aliases.css`는 아직 이전되지 않은 surface가 기존 token 이름으로 동일한 값을 받도록 한다.
- component와 이전 완료 surface는 semantic token만 소비한다.
- `style-system.js`는 registry, 기본값과 알 수 없는 style의 fallback만 담당한다.
- style registry는 UI 설정, 계정 동기화나 feature 동작을 소유하지 않는다.

실제 파일명과 token prefix는 구현 전 focused contract test에서 먼저 고정한다.

## 작업 항목

### Work 1. Foundation contract와 자동 검증부터 작성

- 지원 style ID와 기본 style을 선언하는 registry contract를 만든다.
- 초기 필수 semantic token 목록을 테스트 fixture가 아니라 한 곳의 계약으로 정의한다.
- compatibility style이 필수 token을 모두 제공하는지 검사한다.
- CSS 전체의 `var()` 참조와 정의를 비교하되 JavaScript나 selector가 런타임에 공급하는 layout 변수만 명시적인 allowlist로 관리한다.
- manifest에서 style, alias, foundation, component, feature의 cascade 순서를 검증한다.

### Work 2. Compatibility style과 legacy bridge 구현

- 현재 `foundation.css`의 palette, shadow, radius와 transition 값을 compatibility style로 옮긴다.
- 기존 token 이름은 semantic token을 참조하는 alias로 유지해 미이전 surface의 외형을 보존한다.
- fallback 없는 미정의 전역 token을 의도에 맞는 semantic token 또는 alias로 연결한다.
- runtime-only custom property는 global token과 구분하고 소유 selector 또는 JavaScript를 검사한다.

### Work 3. Root lifecycle과 안전한 fallback 구현

- 초기 HTML에 `data-style="compatibility"`를 명시해 첫 paint부터 style이 결정되게 한다.
- registry에 없는 style 값은 `compatibility`로 복원한다.
- 현재는 style이 하나뿐이므로 선택 UI와 persistence를 추가하지 않는다.
- style 적용은 DOM 재작성이나 feature별 JavaScript 분기를 만들지 않는다.

### Work 4. 공통 shell migration

- body/canvas, sidebar, navigation, main surface, topbar, footer, 전역 banner와 공통 action이 semantic token을 사용하도록 이전한다.
- 공통 shell이 feature 색상값을 소유하지 않게 한다.
- 기존 hover, active, focus, collapsed와 mobile navigation 동작을 유지한다.
- 불명확한 공통 selector는 이 단계에서 전면 재작성하지 않고 후속 component 단계 후보로 기록한다.

### Work 5. `블로그 Beta` 제한 migration

- form, queue, management, automation, smart comment의 핵심 surface/text/border/action/status/focus 표현을 semantic token에 연결한다.
- feature 고유 layout 계산값은 feature token으로 유지한다.
- 원시 값을 기계적으로 전부 치환하지 않고 style 변경을 막는 전역 시각 결정부터 이전한다.
- legacy `블로그` DOM/CSS와 사용자 흐름은 변경하지 않는다.

### Work 6. 회귀 검증과 Gate 1 준비

- style/CSS structure와 token contract focused test를 실행한다.
- 공통 shell 및 `블로그 Beta` 관련 contract test를 실행한다.
- 관련 browser smoke에서 desktop, 좁은 화면, navigation, form, loading, disabled, error와 focus 흐름을 확인한다.
- 전체 단위 테스트를 실행한다.
- compatibility style 이전 전후의 의도하지 않은 외형 차이와 발견된 결함 수정 목록을 사용자에게 전달한다.
- Design Principles Gate 1에서 각 원칙을 `유지`, `수정`, `보류`로 검토하고 사용자 합의를 받는다.

## 구현 순서와 중단 기준

1. Work 1의 contract test를 먼저 실패 상태로 만든다.
2. Work 2~3의 최소 foundation으로 contract test를 통과시킨다.
3. Work 4 공통 shell을 이전하고 focused/browser 검증한다.
4. Work 5 `블로그 Beta`를 작은 CSS 경계별로 이전하며 focused test를 반복한다.
5. Work 6 전체 검증 후 사용자 UI 확인과 Gate 1을 수행한다.

다음 상황에서는 임의로 범위를 넓히지 않고 기록 후 사용자와 다시 합의한다.

- compatibility style로 현재 외형을 보존할 수 없는 구조적 충돌
- feature DOM 또는 JavaScript 변경이 필요한 경우
- style contract에 component별 예외가 과도하게 필요해지는 경우
- 공통 shell 변경이 비대상 surface의 사용성을 바꾸는 경우
- token 교정이 사용자-visible 색상 의미를 실질적으로 변경하는 경우

## 완료 조건

- root와 registry가 `compatibility` style을 일관되게 선택한다.
- 알 수 없는 style 값이 기능 손실 없이 기본 style로 fallback한다.
- compatibility style이 필수 semantic token을 모두 제공한다.
- 허용되지 않은 미정의 custom property 참조가 없다.
- 공통 shell과 `블로그 Beta`의 핵심 전역 시각 결정이 semantic token을 사용한다.
- 기존 외형과 사용자 흐름에는 의도적인 변경이 없다.
- 발견된 명백한 CSS 결함은 수정되고 회귀 테스트가 추가된다.
- focused contract, browser smoke와 전체 단위 테스트가 통과한다.
- 수동 확인이 필요한 대표 flow를 사용자에게 전달한다.
- Design Principles Gate 1 검토와 사용자 합의가 완료된다.

## 사용자와 이미 합의한 결정

- 첫 기반 적용 범위는 공통 shell과 `블로그 Beta`다.
- 초기 계약은 `1 style = 1 theme`다.
- 현재 외형을 compatibility style로 먼저 보존한다.
- style 선택 UI는 둘 이상의 검증된 style이 준비된 이후 제공한다.
- Gate 1 검토를 완료하기 전에는 첫 정식 style 단계로 넘어가지 않는다.

## 이번 단계에서 확인할 제안

1. 2단계는 위 Work 1~6을 하나의 reviewable sub-feature로 진행한다.
2. token 이름은 구현 세부이므로 사용자가 개별 명칭을 결정하지 않고 semantic 역할과 화면 결과를 검토한다.
3. 외형 보존을 기본으로 하되 미정의 token, 사라진 focus처럼 명백한 결함 수정은 허용한다.
4. 전체 raw value 제거율을 완료 기준으로 삼지 않고 공통 shell과 `블로그 Beta`의 style 교체 가능성을 완료 기준으로 삼는다.

## 진행 및 변경 기록

- 2026-09-06: `codex/feature/design-system-main`에서 2단계 sub-feature branch를 시작했다.
- 2026-09-06: 목표, 범위, Work 1~6, 완료 조건과 중단 기준 초안을 작성했다.
- 2026-09-06: 사용자가 제안 범위를 승인해 구현을 시작했다.
- 2026-09-06: `--ui-*` semantic token 계약, 단일 `compatibility` registry, root `data-style` lifecycle과 알 수 없는 style의 fallback을 구현했다. style 선택 UI와 persistence는 범위대로 만들지 않았다.
- 2026-09-06: compatibility style pack과 legacy alias bridge를 분리하고, 기존에 선언 없이 참조되던 전역 token을 semantic 역할에 연결했다.
- 2026-09-06: 공통 shell, 반응형 layout, 시계, 전역 feedback/status와 `블로그 Beta`의 핵심 CSS 경계를 semantic token으로 이전했다. 시계 계절색과 confetti 위치처럼 component 또는 runtime이 소유하는 값은 해당 경계에 유지했다.
- 2026-09-06: 최초 contract test에서 테스트 fixture의 잘못된 문자열, JavaScript가 공급하는 runtime custom property 미인식, 이전 대상의 구형 token 잔존을 발견했다. fixture를 교정하고 `setProperty` 정의를 검사하도록 보완한 뒤 대상 경계를 이전했다.
- 2026-09-06: cross-realm 배열을 직접 비교하던 테스트 자체의 오류를 길이 비교로 고쳤다.
- 2026-09-06: compatibility 화면 검토에서 사용자가 완료형 form의 좌측 button 배치와 파란색·짙은 slate색 filled button의 경쟁을 지적했다. Gutenberg Diagram은 참고 근거로만 사용하고, 이를 절대적인 우측 정렬 원칙이 아니라 완료형 form과 dialog에 적용하는 action placement 운영 가이드로 분류했다.
- 2026-09-06: 사용자는 Product Experience Principles 8개를 모두 `유지`하고 `결정 행동의 위치와 위계` 가이드를 추가하는 Gate 1 안에 합의했다. 큰 문제가 아니므로 compatibility foundation의 현재 배치와 색상은 즉시 변경하지 않고, 첫 정식 style에서 공통 action pattern으로 적용·검증하기로 했다.
- 2026-09-06: 사용자가 Gate 1 합의 후 2단계 마무리와 `cmd`를 요청했다. 현재 compatibility 외형을 승인 범위로 삼고 나머지 광범위한 시각 개선은 첫 정식 style 단계에서 검증한다.

## 최종 결과 및 검증

- style foundation focused tests: 20 passed, 0 failed
- 공통 shell 및 `블로그 Beta` focused contract tests: 28 passed, 0 failed
- browser UI smoke: passed, 204 fixture requests
- Blog automation API smoke: passed
- full unit suite: 1,479 passed, 0 failed, 1 skipped
- 첨부 화면을 통한 사용자 검토: 결정 행동 위치와 button 색상 위계 개선 필요 확인
- Gate 1: Product Experience Principles 8개 `유지`, 운영 가이드 1개 추가로 사용자 합의 완료
- 사용자 승인: Gate 1 합의와 함께 2단계 마무리 승인
- integration: `codex/feature/design-system-main` fast-forward merge 및 sub-feature branch 삭제 요청
- release, tag, push, 배포: 수행하지 않음

## Gate 1 검토 초안

자동 검증과 compatibility 화면 검토를 근거로 8개 Product Experience Principle을 모두 `유지`하기로 사용자와 합의했다.

| 원칙 | 제안 | foundation에서 확인한 근거 |
| --- | --- | --- |
| 1. 사용자의 목적이 화면의 주인공이다 | 유지 | style foundation이 DOM, navigation hierarchy와 feature 흐름을 변경하지 않았다. |
| 2. 아름다움은 차분한 명료함에서 나온다 | 유지 | 이번 단계는 외형을 추가 장식하지 않고 기존 시각 결정을 명시적 계약으로 분리했다. 실제 미감 안내력은 Gate 2에서 다시 검토한다. |
| 3. 시작은 단순하게, 필요한 깊이는 가까이에 둔다 | 유지 | 하나의 style만 있는 동안 선택 UI와 persistence를 노출하지 않았다. |
| 4. 시스템 상태가 보이면 신뢰가 생긴다 | 유지 | 전역 발행 상태와 Blog Beta 상태 표현을 semantic 경계로 옮기고 기존 상태 contract를 통과했다. |
| 5. 사용자의 작업은 가능한 한 이어져야 한다 | 유지 | style 적용은 root 속성만 바꾸며 DOM을 재작성하지 않는다. Blog Beta 실패 시 결과·입력 보존 contract도 유지됐다. |
| 6. 같은 의미는 같은 방식으로 표현한다 | 유지 | 흩어진 전역 이름을 `--ui-*` semantic contract로 연결했고, 선언 없이 사용되던 token을 자동 검사로 발견·교정했다. |
| 7. 접근성과 반응형 동작은 기본 품질이다 | 유지 | focus token과 기존 반응형 구조를 보존했고 browser smoke가 통과했다. 실제 keyboard focus와 좁은 화면의 시각 확인은 사용자 점검이 남아 있다. |
| 8. 스타일은 달라져도 제품은 낯설어지지 않는다 | 유지 | registry와 root contract가 style을 feature JavaScript·DOM에서 분리하며, 알 수 없는 ID는 compatibility로 fallback한다. 두 style 사이의 실제 불변성은 Gate 3에서 다시 검증한다. |

### 사용자 합의로 추가한 운영 가이드

- 완료형 form과 dialog의 action group은 기본적으로 inline-end 하단에 배치하고 primary action을 가장 끝에 둔다.
- secondary action은 primary보다 시각적 강도를 낮추며, 삭제·초기화처럼 성격이 다른 행동은 분리한다.
- toolbar, 반복 list row, navigation과 좁은 화면은 작업 맥락에 따라 예외를 허용하고 keyboard 순서를 보존한다.
- compatibility style은 즉시 바꾸지 않는다. 첫 정식 style에서 공통 action pattern과 새로운 primary 색상 방향을 함께 검증한다.

### 구현에서 발견한 하위 규칙 후보

- JavaScript가 공급하는 runtime custom property와 style contract token을 검사에서 구분한다.
- 공통 semantic token으로 설명하기 어려운 시계의 계절색 같은 반복 규격은 component token으로 소유한다.
- 미이전 surface는 legacy alias로 연결하되, 이전 완료 경계가 다시 legacy token을 사용하면 테스트가 실패하게 한다.
- raw color 전량 제거를 foundation 완료 조건으로 삼지 않는다. 첫 정식 style 적용을 막는 값부터 component 의미를 확인해 후속 단계에서 이전한다.
