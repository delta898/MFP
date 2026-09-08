# 디자인 시스템 13단계 — Style Contract 마무리 개발 기록

## Branch

- Branch: `codex/feature/design-system-13-style-contract-hardening`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-08
- Status: 진행 중 — raw style 분류와 side-effect 방지 기준선 수립

## 사용자 필요와 목표

Blog Beta에 남아 있는 원시 typography·shadow와 `!important` 의존을 semantic/component token 계약에 맞춰
정리한다. 기계적인 일괄 치환으로 현재 정보 위계, 두 정식 style의 성격 또는 반응형 layout을 바꾸지 않고,
작은 slice마다 변경 범위와 계산 결과를 검증해 side effect를 차단한다.

## 범위

1. Blog Beta feature CSS의 raw typography, shadow, spacing과 cascade override 분류
2. 기존 semantic role로 의미가 확정된 값의 token migration
3. 기존 token으로 표현할 수 없는 반복 의미의 component/semantic token 설계와 style pack 연결
4. `!important` 및 원시 시각 recipe 제거
5. raw value와 style-specific selector 재유입 방지 contract 보강
6. focused contract, 관련 browser smoke와 사용자 시각 확인

## 명시적 비범위

- feature 고유 grid, column width, preview ratio 같은 layout 계산값의 획일적 token화
- 현재 font hierarchy나 component anatomy의 임의 재설계
- 트렌드 table의 실제 sort button semantics와 empty 상태 affordance
- Blog Beta 밖 compatibility surface의 일괄 migration
- release, version bump, parent merge, tag, push 또는 배포

## Side-effect 방지 원칙

- 숫자가 같다는 이유만으로 의미가 다른 값을 같은 token으로 묶지 않는다.
- layout 크기와 시각 role을 먼저 분류하고, feature 계산값은 그대로 둔다.
- 기존 semantic role과 정확히 일치하는 값만 우선 치환한다.
- 새 token이 필요하면 반복되는 사용자 의미와 style별 표현 차이를 먼저 기록하고 사용자와 합의한다.
- 한 slice에서는 하나의 component family만 변경하고 computed value, narrow layout과 두 style을 함께 확인한다.
- 교정 전 현재 동작을 보호하는 focused contract를 마련하고, 정적 검증 통과만으로 시각 동일성을 주장하지 않는다.

## 제안 Slice

1. **Inventory and migration map**: raw value를 계약 위반, feature layout, 새 token 판단 대상으로 분류한다. CSS는 변경하지 않는다.
2. **Shared form and queue typography**: 확정된 body·label·caption·heading 역할만 기존 type token으로 이동한다.
3. **Smart Comment typography**: 결과 card·badge·metadata 역할을 분리하고 확정된 값부터 이동한다.
4. **Elevation and cascade**: raw shadow와 `!important`를 component contract로 교정한다.
5. **Regression guards**: 허용 범위 밖 raw value, `!important`, style ID selector의 재유입을 막는다.

각 slice는 focused 검증과 사용자 확인 후 다음 slice로 넘어간다. 새 semantic/component token 추가는 별도 사용자 합의점으로 둔다.

## 사용자와의 결정

- 2026-09-08: 문서 계약 정리 후 동작·접근성 단계는 현재 empty table 노출 조건을 고려해 보류하고 known issue로 유지한다.
- 2026-09-08: style contract 마무리는 side effect를 피하기 위해 작은 단계로 진행한다.
- 2026-09-08: 첫 slice는 구현을 바꾸지 않는 inventory와 migration map으로 시작한다.

## 진행 기록

- 2026-09-08: clean `codex/feature/design-system-main`에서 sub-feature branch와 독립 개발 기록을 만들었다.
- 2026-09-08: Blog Beta 관련 일곱 feature stylesheet를 조사했다. raw typography는 size 36건, weight 30건,
  line-height 29건이며, raw shadow recipe 5건과 `!important` 1건을 확인했다. `box-shadow: none`과 icon 크기처럼
  token 대상이 아닌 선언을 숫자만 보고 위반으로 분류하지 않았다.
- 2026-09-08: inventory와 migration map을 `5e15e54`로 먼저 commit했다.
- 2026-09-08: shared form, folder/paste label과 queue의 의미가 확정된 `15/14/12px` 및 weight 선언을 기존
  body·label·caption·regular·medium·semibold·bold token으로 옮겼다. 세 style이 같은 공급값을 사용하므로
  이 slice의 computed typography 값은 바뀌지 않는다. `13px`, line-height, icon 크기와 Smart Comment는 유지했다.
- 2026-09-08: 대상 selector가 다시 raw size/weight로 돌아가지 않도록 focused contract를 추가했다.
- 2026-09-08: shared form·queue typography slice를 `8ea1d8a`로 commit했다.
- 2026-09-08: Smart Comment에서 역할과 기존 token이 정확히 대응하는 status body, card metadata와 bold
  emphasis만 token으로 옮겼다. `11/13/16/17/20px`와 line-height는 새 role 합의 또는 시각 변화가 필요하므로
  그대로 유지했다.

## Inventory and migration map

### 기존 token으로 계산값을 유지할 수 있는 항목

| 현재 값 | 의미가 확인된 역할 | 교체 token | 현재 세 style의 계산값 변화 |
|---|---|---|---|
| `15px` | form body, input, queue title, status title | `--ui-type-body-size` | 없음 |
| `14px` | field·picker label, standard row action | `--ui-type-label-size` | 없음 |
| `12px` | count/order badge, secondary metadata | `--ui-type-caption-size` | 없음 |
| `400` | regular body/input/metadata | `--ui-weight-regular` | 없음 |
| `500` | medium hint | `--ui-weight-medium` | 없음 |
| `600` | label·row title·compact action | `--ui-weight-semibold` | 없음 |
| `700` | heading·strong label·button | `--ui-weight-bold` | 없음 |

이 항목도 selector의 실제 의미를 확인한 뒤에만 바꾼다. 특히 icon의 `font-size`와 layout 크기는 typography
token으로 이동하지 않는다.

### 의미 결정 또는 새 token 합의가 필요한 항목

- `11px`: Smart Comment의 platform/tone micro badge. caption과 다른 의도인지 먼저 결정해야 한다.
- `13px`: hint, metadata, compact action에 반복되지만 현재 label과 caption 사이의 semantic role이 없다.
- `16px`: AI sparkle icon과 Smart Comment card title이 같은 숫자지만 의미가 다르다.
- `17px`: Smart Comment 결과 section heading.
- `20px`: panel heading 역할이면 heading token이 맞지만 Quiet Sage에서는 현재보다 1px 작아진다.
- `22px`: close icon과 원고 preview title이 같은 숫자지만 각각 icon layout과 content heading이다.
- `line-height 1–1.65`: icon, button, label, metadata, long-form copy를 역할별로 나눠야 하며 숫자 일괄 치환을 금지한다.

### Typography가 아닌 layout·component 항목

- `box-shadow: none`: hover/disabled/sticky action reset이므로 token 대상이 아니다.
- icon glyph의 `font-size`와 `line-height: 1`: 고정 icon box의 layout contract로 유지할 수 있다.
- grid, gap, padding, control height, column width: feature 고유 layout 여부를 개별 판단한다.

### 별도 교정 대상

- editor sticky footer의 raw color shadow recipe 1건
- selected/active/row·table header 상태의 inline shadow recipe 4건
- queue running text의 `!important` 1건

### 다음 안전한 slice

먼저 세 style에서 값이 동일한 `15/14/12px`와 `400/500/600/700` 중 역할이 명백한 shared form·queue
selector만 token으로 옮긴다. 이 slice는 computed typography 값을 바꾸지 않고, Smart Comment와 새 token 판단
항목은 건드리지 않는다.

## 검증 계획

- raw typography·shadow·`!important` 위치 및 selector role inventory
- semantic/component token 정의와 style별 공급값 비교
- slice별 focused design contract
- reviewable UI slice별 관련 browser smoke
- 사용자 hands-on UI 확인 후 최종 merge gate 결정

## 현재 검증

- Inventory 문서: `git diff --check` 통과
- Shared form and queue typography focused contracts: 33 passed, 0 failed
- Smart Comment safe typography focused contracts and style foundation: 15 passed, 0 failed
- 현재 style 공급값 비교: body `15px`, label `14px`, caption `12px`, weight `400/500/600/700`이
  Compatibility, Warm Editorial과 Quiet Sage Studio에서 동일함을 확인
- browser smoke와 사용자 시각 확인: 이 slice의 computed 값은 동일하므로 후속 시각 변화 slice와 묶어 수행 예정

## 최종 결과

- 진행 중
