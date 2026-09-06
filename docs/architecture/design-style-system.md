# 다중 Style Contract v0.1

## 문서 상태

- Status: 초기 계약 사용자 승인 완료
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
<html data-style="compatibility">
```

- `data-style`: 등록된 style pack ID
- 누락되거나 알 수 없는 값은 안전한 기본 style로 fallback
- style 전환은 DOM 재생성이나 feature JavaScript 분기를 요구하지 않음
- 앱 시작 시 저장된 선택을 가능한 이른 시점에 적용해 불필요한 화면 깜빡임을 줄임

사용자 선택 UI와 계정 동기화 여부는 별도 제품 결정이다. foundation 단계에서는 registry와 기본값만 제공할 수 있다.

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

## File Responsibility 초안

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

실제 디렉터리 변경은 기존 CSS composition 구조를 보존하면서 작은 단계로 수행한다.

## Registry와 Fallback

style registry는 최소한 다음 정보를 제공해야 한다.

- 안정적인 ID와 사용자 표시 이름
- contract version
- 선택 가능 여부 또는 실험 상태
- fallback style

알 수 없는 저장값, 제거된 style, 불완전한 style pack이 앱을 깨뜨리면 안 된다. registry validation에 실패하면 기본 style을 적용하고 기능은 계속 사용할 수 있어야 한다.

## Migration Rules

1. 기존 외형을 기본 compatibility style로 캡처한다.
2. 누락된 기존 변수는 의미를 확인한 뒤 semantic token 또는 명시적인 alias로 연결한다.
3. 공통 shell과 `블로그 Beta`부터 semantic token을 사용하도록 이전한다.
4. 이전 중 기능 JavaScript와 DOM contract는 원칙적으로 바꾸지 않는다.
5. feature별 raw value는 component 의미가 확인된 단위로 치환한다.
6. 한 surface의 이전이 끝날 때 focused contract와 browser regression을 수행한다.
7. 첫 정식 style 이후 작은 두 번째 검증 style을 연결해 숨은 결합을 찾는다.

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

각 style 단계의 Definition of Done을 충족한 뒤에는 [Design Principles v0.1](./design-principles.md)에 정의한 해당 필수 검토 Gate를 수행해야 한다. style 구현 완료만으로 다음 단계 진행이 자동 승인되지는 않는다.

## 2단계 최소 구현 제안

- style registry와 안전한 기본값
- root `data-style` lifecycle
- semantic color, typography, spacing, radius, elevation, motion contract
- 현재 외형을 보존하는 compatibility style
- 기존 token alias와 미정의 변수 교정
- 공통 shell 및 `블로그 Beta`의 제한된 migration
- token completeness와 미정의 참조 자동 검사

style 선택 UI와 앱 전체 surface migration은 각각 별도 sub-feature로 분리한다. 별도 dark theme 축은 현재 범위에 포함하지 않는다.

## 사용자 합의가 필요한 사항

1. 첫 기반 적용 범위는 `공통 shell + 블로그 Beta`로 제한한다. 사용자 승인 완료.
2. 초기 계약은 별도 theme 축 없이 `1 style = 1 theme`로 한다. 사용자 승인 완료.
3. 첫 정식 style 적용 전 현재 외형을 compatibility style로 보존한다. 사용자 승인 완료.
4. style 선택 UI는 둘 이상의 검증된 style이 준비된 이후 제공한다. 사용자 승인 완료.
