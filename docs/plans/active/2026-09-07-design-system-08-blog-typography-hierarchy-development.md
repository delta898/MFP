# 디자인 시스템 8단계 — Blog Beta typography hierarchy 개발 기록

## Branch

- Branch: `codex/feature/design-system-08-blog-typography-hierarchy`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 구현 및 사용자 시각 확인 완료 — parent merge gate 대기

## 사용자 필요와 목표

Blog Beta의 상위 가로 탭, panel 제목·설명과 local sub-tab이 서로 다른 기본 font와 암묵적 크기에 의존해
정보 위계가 뒤집혀 보이는 문제를 해결한다. 먼저 역할별 typography 기준을 canonical design guide에 명문화하고,
Blog Beta의 다섯 상위 탭과 내부 panel anatomy에 같은 semantic token을 적용한다.

## 범위

1. Blog Beta 상위 탭 `빠른 글 작성`, `트렌드 포스팅`, `글감 관리`, `스마트 댓글`, `연속 발행 설정`
2. 다섯 panel의 공통 제목과 한 줄 설명
3. Blog Beta의 같은 수준 local segmented navigation과 count badge
4. 제품 font family, size, weight와 line-height의 역할별 계약
5. focused CSS/DOM contract와 사용자 시각 확인

## 명시적 비범위

- 기존 `블로그` surface와 sidebar navigation
- 대시보드, 카드뉴스, 쇼핑커넥트, SNS, 설정 등 다른 제품 메뉴의 typography migration
- 정보 구조, 문구, 기능과 tab 동작 변경
- style palette, spacing, radius 또는 action hierarchy 재설계
- full unit suite, parent merge, release, tag, push 또는 배포

다른 제품 surface는 해당 메뉴를 검토하는 phase에서 이 typography 계약을 적용한다.

## 설계와 기준

Blog Beta에서 다음 역할을 사용한다.

| 역할 | semantic size | weight | 표현 목적 |
| --- | --- | --- | --- |
| panel 제목 | `--ui-type-heading-size` | `--ui-weight-bold` | 현재 화면의 목적 |
| 상위 가로 탭 | `--ui-type-body-size` | `--ui-weight-semibold` | 주요 기능 간 이동 |
| panel 설명 | `--ui-type-body-size` | `--ui-weight-regular` | 제목을 보충하는 읽기 문장 |
| local sub-tab | `--ui-type-label-size` | `--ui-weight-semibold` | 현재 화면 내부 전환 |
| count badge | `--ui-type-caption-size` | label 상속 | tab의 보조 수량 정보 |

- 모든 tab button은 native button 기본 font가 아니라 제품 font family를 상속한다.
- hierarchy는 크기 하나로 만들지 않고 weight, secondary text color, 위치와 surface를 함께 사용한다.
- count badge는 별도 bold로 경쟁하지 않고 작은 크기와 badge surface로만 구분한다.
- style pack은 동일한 semantic role의 구체 값을 바꿀 수 있지만 역할 관계와 component anatomy는 바꾸지 않는다.

## 구현 단계

1. canonical component guide에 역할별 typography mapping을 추가한다.
2. Blog Beta top-level tab, intro와 segmented local navigation을 semantic token으로 교정한다.
3. 사용 중인 semibold font weight가 실제 font source에서 제공되는지 맞춘다.
4. focused contract로 literal 회귀와 font 상속을 검증한다.
5. 사용자 시각 확인 후 commit 및 parent 통합 여부를 별도로 결정한다.

## 사용자와 결정한 사항

- 개별 화면의 시각적 추정으로 font 값을 바꾸지 않고 기준을 먼저 명문화한다.
- 첫 적용 범위는 Blog Beta 안의 다섯 상위 메뉴와 그 panel anatomy로 제한한다.
- 다른 메뉴에는 이 단계에서 일괄 적용하지 않고 각 메뉴 phase에서 같은 기준을 적용한다.
- sub-feature branch에서 독립적으로 검토한 뒤 parent integration 여부를 결정한다.

## 진행 기록

- 2026-09-07: `codex/feature/design-system-main`의 미커밋 typography 조사 변경을 보존한 채 sub-feature branch를 시작했다.
- 2026-09-07: 상위 탭은 font family와 size가 명시되지 않아 native button 기본값에 의존하고, panel 설명도
  semantic body size가 명시되지 않은 반면 local sub-tab만 제품 font와 `14px`을 명시한 불일치를 확인했다.
- 2026-09-07: 사용자와 Blog Beta 우선 적용 및 다른 product surface의 단계별 후속 적용 원칙을 확정했다.
- 2026-09-07: canonical component guide에 panel 제목, top-level tab, 설명, local tab과 count badge의 semantic
  typography mapping을 추가했다. top-level tab과 설명은 같은 body size에서 weight·color로 역할을 구분하고,
  local tab은 label size로 한 단계 낮추도록 정했다.
- 2026-09-07: Blog Beta 다섯 top-level tab에 제품 font 상속과 body/semibold/tight token을 적용하고, 모든 panel
  제목·설명 및 local segmented tab을 역할별 token으로 교정했다. count badge는 별도 bold를 제거했다.
- 2026-09-07: Noto Sans KR font source에 실제 semibold 600 weight를 포함해 `600` 요청이 700으로 대체되지 않게 했다.
- 2026-09-07: 기존 management typography contract가 과거 `14px/700` 리터럴을 요구해 실패한 것을 확인하고,
  새 semantic label/semibold와 badge weight 상속 계약으로 갱신했다.
- 2026-09-08: 사용자가 Blog Beta의 상위 탭, 설명과 local sub-tab typography hierarchy를 시각 확인하고 승인했다.

## 검증 계획

- focused typography/component contract
- `git diff --check`
- 사용자 수동 확인: 다섯 상위 탭, panel 제목·설명, 빠른 글 작성과 글감 관리 local sub-tab
- full unit suite는 현재 작은 typography slice의 범위에 포함하지 않으며 parent merge gate에서 별도 승인 후 수행한다.

## 완료 조건

- Blog Beta의 네 typography 역할이 문서와 semantic token에서 동일하게 대응한다.
- 상위 탭이 native button 기본 font/size에 의존하지 않는다.
- panel 설명과 local sub-tab이 상위 탭보다 더 높은 위계로 보이지 않는다.
- count badge가 tab label과 경쟁하지 않는다.
- 다른 제품 surface의 기존 표현은 변경되지 않는다.

## 최종 결과

- canonical guide와 Blog Beta 우선 적용 구현 완료
- focused anatomy/style contract: 10 passed, 0 failed
- `git diff --check`: passed
- 사용자 시각 확인: 완료
- commit과 parent integration: 대기
