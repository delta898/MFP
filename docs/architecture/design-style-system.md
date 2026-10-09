# 다중 Style Contract 1.1

## 문서 상태

- Status: 앱은 CSS 규칙과 Warm Editorial fallback만 소유; selectable style metadata와 token은 Amade catalog에서 로드
- Source stage: `codex/feature/design-system-01-principles`
- 목적: 여러 style이 같은 기능·component 위에서 안전하게 동작하기 위한 최소 계약을 정의한다.

## 핵심 모델

```text
Product Experience Principles
    ↓
Semantic Token Contract
    ↓
Shared Components and Patterns
    ↓
Style Pack
    ↓
App Shell and Feature Surfaces
```

### Style

제품의 완결된 시각적 성격을 나타낸다. style pack은 동일한 semantic token에 서로 다른 색상 모드, 서체, radius, elevation, density, motion 값을 연결한다.

### Theme 정책

초기 계약은 `1 style = 1 theme`다. light/dark를 별도 조합 축으로 만들지 않으며 style pack 하나를 하나의 완전한 검증 단위로 관리한다. 별도의 theme 축이 실제로 필요해지면 그 시점에 사용자 경험, 설정 복잡도와 테스트 조합을 다시 검토한다.

### Component variant

시각 취향이 아니라 component의 의미 또는 사용 맥락 차이다. 예를 들어 primary/danger action이나 compact/regular density는 명시적인 variant이며 style 이름으로 대체하지 않는다.

## Root Contract

최종 적용 지점은 document root의 명시적 속성을 기본안으로 한다.

```html
<html data-style="warm-editorial">
```

- `data-style`: Amade catalog에서 검증된 style ID 또는 내장 fallback `warm-editorial`
- 누락되거나 알 수 없는 값은 `warm-editorial`로 fallback
- style 전환은 DOM 재생성이나 feature JavaScript 분기를 요구하지 않음
- 앱 시작 시 `style-bootstrap.js`를 stylesheet보다 먼저 동기 실행해 저장된 선택을 첫 paint 전에 root에 적용함
- bootstrap은 저장된 원격 catalog package의 token map을 안전 검증해 첫 paint 전에 적용하고, cache가 없거나 유효하지 않으면 HTML의 Warm Editorial 기본값을 유지함

선택 ID는 기기의 localStorage에 저장한다. Amade에서 내려받은 Style 패키지는 local API 서버가 검증 후 workspace 캐시에 저장하며, renderer는 검증된 token 데이터만 적용한다. renderer도 마지막 정상 원격 catalog를 localStorage에 캐시해 앱 시작 시 먼저 읽고, 선택된 원격 스타일의 token 값을 stylesheet가 그려지기 전에 안전 검증 후 root에 적용한다. 이후 Amade catalog를 갱신한다. 원격 catalog를 사용할 수 없을 때도 앱은 내장 `warm-editorial` token CSS로 시작한다.

## Token Layers

### 1. Primitive values

style pack 내부에서 사용하는 palette와 scale이다. feature와 component에서 직접 사용하지 않는다.

예:

- color palette steps
- font family candidates
- spacing and radius scale
- shadow recipes
- motion durations and easing

### 2. Semantic tokens

제품 전체에서 의미가 유지되는 contract다.

초기 필수 그룹:

- `canvas`, `surface`, `surface-raised`, `surface-muted`, `overlay`
- `text-primary`, `text-secondary`, `text-muted`, `text-inverse`
- `border-default`, `border-strong`, `border-focus`
- `action-primary`, `action-primary-hover`, `action-secondary`, `action-danger`
- `status-info`, `status-success`, `status-warning`, `status-danger`
- `focus-ring`
- `type-display`, `type-heading`, `type-body`, `type-label`, `type-caption`, `type-mono`
- `space-*`, `radius-*`, `shadow-*`, `motion-*`

구현 시 실제 CSS 이름에는 일관된 namespace를 사용한다. 기존 token은 한 번에 제거하지 않고 migration 기간에 semantic contract로 연결하는 compatibility alias를 둘 수 있다.

### 3. Component tokens

공통 component가 semantic token만으로 표현하기 어려운 반복 규격을 가진 경우에만 추가한다.

예:

- button height/padding
- field background/border/focus ring
- card padding/elevation
- navigation active state
- dialog width and overlay

선택·실행 상태의 outline, table header divider와 sticky footer처럼 여러 feature에서 같은 역할로 해석되는
shadow recipe도 component token으로 공급한다. feature stylesheet가 색상과 blur 값을 직접 소유하지 않으며,
단순 구분선과 떠 있는 surface의 elevation은 서로 다른 역할로 이름을 구분한다.

component token이 feature 이름을 포함하지 않도록 한다.

### 4. Feature layout tokens

feature 고유의 계산값이나 layout contract만 허용한다. color나 일반 type 값을 feature token으로 우회하지 않는다.

예:

- queue column width
- preview aspect ratio
- trend grid column count

## Style이 변경할 수 있는 것

- palette와 대비 관계
- typography family, weight와 role scale
- radius와 elevation의 성격
- 허용 범위 안의 spacing/density
- motion의 duration과 easing
- texture나 background treatment

## Style이 소유하지 않는 것

- feature 기능과 데이터
- DOM 구조와 navigation hierarchy
- 버튼 의미와 action priority
- loading, disabled, error, success의 상태 전이
- ARIA role, accessible name, keyboard order
- destructive action 확인 여부
- 마지막 정상 결과 보존 정책

style에 따라 component anatomy를 바꿀 필요가 생기면 style 분기가 아니라 공통 component variant가 정말 필요한지 먼저 검토한다.

## Amade Style package

Amade catalog's `styles[]` references each `amade/styles/<style-id>/style.json` package. A package shares Amade common metadata and declares `style_id`, `compatibility.min_bloggenius_version`, `compatibility.contract` (`id: bloggenius-ui-style-tokens`, `version: 1.1`), and the complete required token map. It carries token data, not CSS selectors, JavaScript, or other executable assets. The Amade package `spec_version`, package release version, minimum app version, and token contract version are separate values. Current Style packages require BlogGenius `0.6.0`.

Contract 1.1 adds `--ui-form-control-disabled-opacity`, owned by each style package. Shared BlogGenius form-control styling consumes it for disabled form fields; button disabled appearance remains controlled separately by `--ui-button-disabled-opacity`.

The local API fetches the catalog and all Style manifests at one immutable Git revision. It offers only `active` packages whose minimum BlogGenius version is met and whose exact contract ID/version is supported. Incompatible future packages are skipped; malformed compatibility declarations fail validation. It validates IDs, metadata, exact token names, token count, contract version, and each value before writing a local cache. Values that could introduce declarations, rules, imports, or external resources (`;`, braces, `url()`, `@import`, and similar constructs) are rejected. The renderer repeats token allowlist/value validation before calling `CSSStyleDeclaration.setProperty`; packages never become a `<style>` block or stylesheet import.

The Appearance UI lists only active compatible Amade styles; it does not reconstruct selectable style names from an app-bundled list. A valid remote response with zero active compatible styles is authoritative: clear the remote cache and show no remote choices, rather than restoring stale cached packages. Network, retrieval, or contract validation failures may use the last valid remote cache. The app bundle contains only the Warm Editorial baseline token CSS; it is not a selectable package unless Amade independently publishes it. All other style metadata and token values come from Amade and are cached locally. Remote styles provide no CSS modules: validated semantic tokens override the same app-owned CSS rules at the document root. Appearance preview cards apply the same token map to their isolated preview element.

## File Responsibility

```text
ui/styles/
├─ base/                 reset, root lifecycle, accessibility defaults
├─ tokens/               token contract와 compatibility aliases
├─ styles/               style pack별 primitive/semantic 값
├─ components/           semantic token을 소비하는 공통 component
├─ patterns/             loading, empty, error, form actions 등 반복 흐름
├─ layout/               shell과 responsive layout
└─ features/             feature 고유 layout과 예외
```

2단계 foundation은 기존 CSS composition 구조를 보존하면서 `--ui-*` namespace를 semantic contract로 사용한다. `ui/styles/styles/warm-editorial.css`가 오프라인 기본값을 공급하고, `ui/styles/tokens/legacy-aliases.css`가 아직 이전되지 않은 surface를 연결한다.

## Cascade Layer 계약

`ui/styles.css`는 CSS module의 단일 composition manifest이자 cascade 우선순위의 source of truth다. 모든 product rule은 다음 순서의 `bloggenius.*` layer 안에서 합성한다.

```text
reset → tokens → base → components → features → utilities → overrides → legacy
```

- `tokens`: style pack과 compatibility alias가 값을 공급한다.
- `base`: document foundation과 application shell을 소유한다.
- `components`: 여러 화면이 공유하는 component와 interaction pattern을 소유한다.
- `features`: 한 feature에만 필요한 layout과 상태 표현을 소유한다.
- `utilities`: responsive처럼 feature 전반을 횡단하는 제한된 규칙을 소유한다.
- `overrides`: 제거 계획과 이유가 있는 일시적 예외에만 사용한다.
- `legacy`: 아직 분류할 수 없는 frozen module의 격리용이며, 현재 module을 배정하지 않는다.

일반 선언은 뒤 layer가 앞 layer보다 우선하므로 feature가 component 기본값을 낮은 selector specificity로 조정할 수 있다. `!important` 선언은 layer 우선순위가 반대로 적용되므로 접근성·가시성처럼 이미 계약으로 허용한 예외 외에는 추가하지 않는다. Layer 밖의 author rule은 모든 layered normal rule보다 강하므로 Google Fonts `@import`를 제외한 product rule을 unlayered 상태로 추가하지 않는다.

새 CSS module은 디렉터리 소유 경계와 같은 layer에 등록한다. 우선순위 문제를 해결하기 위해 selector를 키우거나 `overrides`·`legacy`에 먼저 넣지 말고, component 기본값과 feature variant의 소유 관계를 확인한다.

하나의 화면이나 component가 커지면 manifest 순서는 유지한 채 책임별 companion module로 나눈다. 기본 shell은 원래 이름을 유지하고, media·actions·queue·automation·responsive처럼 독립적으로 설명할 수 있는 하위 책임은 `소유자-책임.css` 이름을 사용한다. 분할된 module은 다음 계약을 지킨다.

- selector와 선언을 중복하지 않고 한 module만 소유한다.
- 같은 layer 안에서 분할 전 상대 순서를 유지한다.
- feature 전용 responsive 규칙은 해당 feature module에 두고, 여러 화면을 횡단하는 shell·form·footer 규칙만 `layout/responsive-*.css`가 소유한다.
- 새 module은 `ui/styles.css` manifest, 디자인 시스템 대상 manifest와 관련 contract test에 함께 등록한다.
- 파일 크기만 줄이기 위한 임의 분할보다 DOM·interaction 책임이 분명한 경계를 우선한다.

## Registry와 Fallback

Amade 원격 catalog는 선택 가능한 style마다 다음 정보를 제공한다.

- 안정적인 ID와 사용자 표시 이름
- contract version
- 선택 가능 여부 또는 실험 상태
- fallback style

내장 baseline의 ID는 `warm-editorial`이며, 이 CSS는 앱 시작과 오프라인 상태에서만 안전한 시각 기본값을 공급한다. 원격 selectable style ID는 CSS module과 일대일로 연결하지 않는다. Amade manifest가 표시 이름과 설명, 호환성 선언 및 전체 token map의 source of truth다. 테스트는 내장 CSS가 Warm Editorial 하나뿐인지, 원격 패키지 token 계약이 완전하고 안전한지 확인한다.

Warm Editorial baseline은 앱의 유일한 bundled style이다. 새 selectable style은 BlogGenius 앱 코드/asset에 추가하지 않고 Amade Style package와 적절한 environment catalog에 등록한다. 기본값 CSS 계약을 수정할 때는 다음 위치를 함께 확인한다.

1. `ui/styles/styles/warm-editorial.css`에 필수 fallback token을 정의한다.
2. `DESIGN_STYLE_DEFAULT_ID`를 `warm-editorial`로 유지한다.
3. `ui/styles.css`의 `bloggenius.tokens` layer에서 baseline module을 명시적으로 include한다.

Amade에서 제공하는 Style package는 별도로 Amade의 공통 메타데이터와 token schema를 만족하고 `styles[]` catalog에 등록한다. CSS manifest는 bundled fallback의 cascade 순서에 대한 source of truth이므로 자동 directory scan으로 대체하지 않는다. 설정 Beta의 style 선택 UI는 원격 active package 목록만 렌더링한다. catalog가 아직 로드되지 않았거나 비어 있으면 selectable style을 임의로 채우지 않는다.

알 수 없는 저장값, 제거된 style, 불완전한 style pack이 앱을 깨뜨리면 안 된다. package validation에 실패하면 마지막 정상 캐시 또는 bundled style을 적용하고 기능은 계속 사용할 수 있어야 한다.

## Migration Rules

1. 기존 외형을 Warm Editorial fallback으로 캡처한다.
2. 누락된 기존 변수는 의미를 확인한 뒤 semantic token 또는 명시적인 alias로 연결한다.
3. 공통 shell과 `블로그 Beta`부터 semantic token을 사용하도록 이전한다.
4. 이전 중 기능 JavaScript와 DOM contract는 원칙적으로 바꾸지 않는다.
5. feature별 raw value는 component 의미가 확인된 단위로 치환한다.
6. 한 surface의 이전이 끝날 때 focused contract와 browser regression을 수행한다.
7. 첫 정식 style 이후 작은 두 번째 검증 style을 연결해 숨은 결합을 찾는다.
8. 이전이 끝난 feature CSS는 구체적인 style ID, `!important` cascade 예외와 숫자형 shadow recipe의 재유입을
   contract test로 차단한다. 합의되지 않은 layout·typography 값까지 숫자라는 이유만으로 일괄 금지하지 않는다.

## Definition of Done

하나의 style pack이 완료되었다고 판단하려면 다음 조건을 충족해야 한다.

- 필수 token이 모두 정의되어 있고 미정의 참조가 없다.
- 주요 component의 default, hover, focus, active, disabled, loading, error 상태가 구분된다.
- 최소 대비와 keyboard focus가 유지된다.
- 좁은 화면에서 주요 작업과 상태가 보존된다.
- reduced-motion 환경에서 불필요한 motion이 제거된다.
- style 전환이 진행 중 입력과 마지막 정상 결과를 지우지 않는다.
- style을 바꿔도 기능·DOM·ARIA contract가 유지된다.
- focused UI test와 관련 browser smoke가 통과한다.
- 사용자가 대표 flow의 시각적 완성도를 확인한다.

각 style 단계의 Definition of Done을 충족한 뒤에는 [Design Principles v1.0](./design-principles.md)에 정의한 검토 기준을 적용한다. 새 style 구현 완료만으로 제품 제공이나 전체 surface 확산이 자동 승인되지는 않는다.

## 현재 검증 결과

- Amade selectable style package와 앱 내장 Warm Editorial baseline은 동일한 99-token contract 1.1을 사용한다. Amade는 선택 가능한 style의 이름, 설명, 버전 및 token map을 보유한다. BlogGenius 앱 번들에는 Warm Editorial fallback token CSS만 있다. 테스트 fixture인 `remote-test-style`은 별도다.
- 정식 style은 따뜻한 밝은 화면, 차분한 세이지, 어두운 월넛, 한지·청자·쪽빛, 저광량 phosphor 계열로 palette뿐 아니라 spacing/density, radius와 elevation을 달리하면서 동일 DOM·기능·상태·ARIA·keyboard 순서를 유지한다.
- style ID와 CSS 파일명은 일대일 규칙을 사용하고, 설정의 2열 선택 UI는 selectable registry entry를 자동 렌더링한다. 새 style 추가는 token module, registry metadata와 ordered CSS manifest 등록 세 곳으로 제한한다.
- `가을밤 서재`는 dark surface의 modal footer와 공통 feedback을 semantic surface token으로 교정했고, `한지 위의 단청`은 일반 secondary와 명시적 negative/danger action의 의미를 style 색상과 분리해 검증했다.
- CSS composition은 `tokens → base → components → features → utilities → overrides → legacy` cascade layer를 따르며, 큰 feature CSS는 manifest 순서를 유지한 책임별 companion module로 분할한다.
- runtime style 전환 중 동일 input DOM과 입력값이 보존된다.
- 공통 component, pattern, layout과 feature CSS는 정식 style ID를 직접 판별하지 않는다.
- 후속 style 적용으로 발견한 feedback, trend surface, modal footer와 embedded clock 외곽의 raw palette·형태 결합을 semantic/component 규칙으로 교정했다.
- 미이전 surface는 명시적인 Compatibility containment를 유지한다.

필수 token의 제거·의미 변경, style 소유 범위 변경과 별도 theme 축 추가는 contract version 변경 대상으로 본다. 하위 호환 token 추가와 새 style pack 연결은 검증을 거쳐 `v1.x` 범위에서 확장할 수 있다.

초기 foundation 제안과 사용자 승인 과정은 완료된 개발 이력이므로
[디자인 시스템 1단계](../plans/archive/2026-09-06-design-system-01-principles-development.md),
[2단계](../plans/archive/2026-09-06-design-system-02-foundation-development.md) 및
[4단계](../plans/archive/2026-09-07-design-system-04-extensibility-validation-development.md) 개발 기록에서 관리한다.
현재 구현과 후속 style은 이 문서의 계약, Definition of Done과 위 검증 기준선을 따른다.
