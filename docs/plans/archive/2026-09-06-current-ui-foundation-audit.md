# 현재 UI 기반 조사

## 문서 상태와 범위

- 조사일: 2026-09-06
- 작성 단계: `codex/feature/design-system-01-principles`
- 범위: `ui/`의 HTML composition, CSS composition, UI JavaScript의 표현 상태
- 목적: 다중 style 기반을 도입하기 전에 현재 강점, 결합 지점, 잠재 결함과 점진적 이전 경계를 확인한다.

이 조사는 코드 기반 정적 조사다. 시각적 완성도와 실제 사용자 흐름의 품질은 후속 단계에서 browser regression과 사용자 UI 확인으로 검증한다.

## 현재 구성

- `ui/index.html`은 shell을 제공하고 11개 view partial을 조합한다.
- `ui/styles.css`는 manifest 역할을 하며 33개 CSS partial을 순서대로 조합한다.
- 전체 CSS partial은 약 15,209줄이다.
- UI JavaScript도 `ui/app.js` manifest와 foundation/feature별 partial 구조를 사용한다.
- `styles/base/foundation.css`의 `:root`에 전역 색상, shadow, radius, transition token이 일부 정의되어 있다.
- 공통 app chrome, form widget, feedback, modal과 feature CSS가 이미 분리되어 있다.
- `블로그 Beta`는 `blog-next.html`과 continuous-publishing 계열 CSS/JavaScript로 legacy 블로그와 구분되어 있다.

## 유지할 강점

1. HTML, CSS, JavaScript가 composition manifest를 사용하므로 파일 경계를 유지한 채 단계적으로 이전할 수 있다.
2. shell, component, feature, responsive 디렉터리가 이미 구분되어 있어 전면 재작성보다 책임을 재정렬하는 접근이 가능하다.
3. `블로그 Beta`, Dashboard Beta, 카드뉴스 등 최근 surface는 loading, disabled, `aria-busy`, `focus-visible` 같은 상태 표현을 일부 갖추고 있다.
4. UI structure, CSS composition, view contract와 browser smoke 등 기존 자동 검증 기반을 확장할 수 있다.
5. legacy와 Beta surface가 구분되어 있어 새 기반을 Beta에서 먼저 검증한 뒤 확대할 수 있다.

## 주요 발견

### A. 기존 token은 style contract로 쓰기에는 범위와 의미가 부족하다

현재 전역 foundation에는 약 20개의 기본 token만 있다. `--brand-primary`, `--text-muted`, `--radius-sm`처럼 일부는 의미와 원시 값의 중간 단계이며 다음 영역은 contract가 없다.

- typography role과 line-height
- spacing scale과 layout rhythm
- action, border, focus, selected, disabled의 상태 의미
- 여러 단계의 surface와 overlay
- field, card, navigation 등 component token
- density, motion duration/easing, breakpoint 정책
- style 선택 root

### B. 원시 시각 값이 feature CSS에 넓게 퍼져 있다

정적 집계 기준으로 CSS에는 다음 값이 직접 사용된다.

- 772개의 hex color 사용, 160개의 고유 hex color
- 491개의 `font-size` 선언
- 362개의 `border-radius` 선언
- 55개의 `!important`
- HTML partial의 201개 inline `style`

모든 원시 값이 문제인 것은 아니지만, style 교체 시 변경 지점이 넓고 값의 의도를 자동 검증하기 어렵다. 특히 inline style은 cascade와 style pack 적용을 방해한다.

### C. 정의되지 않은 semantic 형태의 CSS 변수가 있다

전역 또는 feature scope에서 정의를 찾을 수 없는 다음 변수들이 실제 선언에 사용된다.

- `--text-secondary`
- `--brand`
- `--border-color`
- `--shadow-soft`
- legacy inline style의 `--surface-color`, `--text-primary`, `--secondary-bg`

fallback 없는 `var()`가 해석되지 않으면 해당 CSS 선언 전체가 무효가 된다. `블로그 Beta`에서도 보조 텍스트 색상과 focus outline이 `--text-secondary`, `--brand`에 의존하므로 이는 단순 정리 항목이 아니라 실제 표시 결함 후보이다.

### D. style을 선택하는 명시적인 기반이 없다

- document root에 `data-style` 계약이 없다.
- style registry, 지원 조합, 안전한 fallback이 없다.
- 앱 시작 시 style을 적용하고 유지하는 lifecycle이 없다.
- 현재 `clock-style`은 시계 component 내부 옵션이며 앱 전체 style system으로 재사용할 대상이 아니다.

### E. 공통 component와 feature 표현의 경계가 아직 약하다

- `.card`, `button.primary`, `button.secondary` 같은 넓은 공통 selector가 존재한다.
- feature CSS가 색상, type, radius, 상태 표현을 각자 소유한다.
- 같은 `loading`, `disabled`, focus 상태가 feature별 selector와 표현으로 반복된다.
- 공통 의미를 변경할 때 source order와 selector specificity의 영향을 넓게 받는다.

### F. 반응형과 접근성 규칙이 분산되어 있다

- 36개의 media query가 640, 700, 720, 760, 768, 820, 860, 900, 960, 1100, 1200, 1240, 1500px 등 여러 기준을 사용한다.
- reduced-motion 처리는 현재 시계와 전역 발행 상태 component에만 명시되어 있다.
- focus-visible 지원은 최근 surface에 부분적으로 존재하지만 전역 interactive contract는 없다.
- 일부 입력은 outline을 제거한 뒤 feature별 focus border를 제공하므로 누락 token과 결합되면 focus 표시가 사라질 수 있다.

### G. font loading이 외부 네트워크에 의존한다

`foundation.css`가 Google Fonts의 Inter와 Noto Sans KR을 import하고 system fallback을 제공한다. 오프라인에서도 기능은 유지되지만 글자 폭과 줄바꿈이 달라질 수 있으므로 style contract에서는 font loading 성공 여부에 따른 layout 안정성을 고려해야 한다.

## 위험도별 정리

### 우선 수정 후보

- 정의되지 않은 token 때문에 무효가 되는 색상, border, shadow, focus 선언
- keyboard focus가 보이지 않을 수 있는 상호작용 요소
- loading 중 중복 실행 방지와 마지막 정상 결과 보존이 화면마다 다른 부분

### 기반 구현 전 해결할 구조 문제

- style root와 fallback 부재
- semantic token contract 부재
- 공통 component state와 feature style의 혼합
- migration 대상에서의 inline style과 원시 색상값

### 점진적으로 정리할 부채

- legacy surface의 대량 inline style
- 세분화되지 않은 breakpoint 집합
- feature별 유사 카드·버튼·입력 표현
- 사용 목적이 불분명한 `!important`

## 권장 이전 경계

1. foundation contract와 앱 공통 shell을 먼저 이전한다.
2. 사용자 기능 변경은 기본적으로 `블로그 Beta`에만 적용한다.
3. legacy `블로그`는 동작을 유지하고 공통 token의 호환 alias만 적용한다.
4. Dashboard Beta, 카드뉴스, 설정 등은 별도 reviewable sub-feature로 이전한다.
5. 한 파일의 모든 원시 값을 기계적으로 치환하지 않고, component와 state 의미를 확인한 단위로 이전한다.

## 필요한 자동 검증

- CSS에서 fallback 없는 미정의 custom property 탐지
- 모든 style pack의 필수 semantic token 완전성 검사
- 이전 완료 파일에서 금지된 원시 색상 및 inline style 회귀 검사
- style 변경 전후 DOM, 사용자 행동, ARIA state 불변 검사
- keyboard focus, loading, disabled, error, empty state browser smoke
- 좁은 화면과 기본 desktop 폭의 주요 flow regression
- reduced-motion에서 불필요한 animation 비활성화 확인

## 1단계에서 수정하지 않는 이유

정의되지 않은 변수와 접근성 결함 후보가 발견되었지만, 이번 단계의 목적은 원칙과 contract 합의다. token 이름과 의미를 먼저 확정하지 않고 alias를 추가하면 기존 혼선을 새 foundation에 고정할 수 있으므로 실제 수정은 다음 구현 sub-feature에서 수행한다.
