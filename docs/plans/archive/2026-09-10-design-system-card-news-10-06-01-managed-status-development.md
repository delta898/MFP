# Card News 만든 카드뉴스 상태 체계 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-06-01-managed-status`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · 최종 수정 검증은 slice 6-2 이후 통합 수행

## 사용자 필요와 목표

`새 카드뉴스 > 피드에서 선택`과 `만든 카드뉴스`에서 같은 작업을 서로 다른 상태명으로 표시하는 혼란을 없앤다.
목록의 상태명, badge와 클릭 목적지를 하나의 상태 기준에서 파생해 사용자가 다음에 할 일을 예측할 수 있게 한다.

## 범위

1. Card News 원천 상태와 사용자 표시 상태의 현재 흐름 조사
2. `구성 있음`, `작업 중`, `발행 대기`, `발행 완료`, `확인 필요`의 표시 기준 통일
3. 피드 목록과 만든 카드뉴스 목록이 같은 상태 표현을 재사용하도록 정리
4. 만든 카드뉴스 항목의 클릭 목적지를 상태에 맞게 명확화
5. 관련 문서와 계약 갱신

## 명시적 비범위

- ZIP 저장·복원 UI 및 동작 변경
- 이미지 생성·SNS 발행 backend 재설계
- Card News 전체 responsive/accessibility 전수 점검
- 실제 외부 AI·Buffer·Google Drive 호출

## 진행 원칙

- 상태 label을 화면별 조건문으로 중복하거나 CSS에 개별 색상을 hard-code하지 않는다.
- 이번 slice는 상태 체계와 목록에만 한정한다.
- 구현 후 변경 내용을 사용자에게 먼저 공유하고, focused test와 browser 회귀 test는 별도 승인 후 실행한다.

## 결정과 변경 이력

- 2026-09-10: 피드 목록은 `generation_id`만 보고 `구성 있음`을 만들고 관리 목록은 workflow·publishing 사실을
  별도로 계산해 `작업 중`으로 표시하는 중복을 확인했다.
- 2026-09-10: 사용자 표시 상태와 tone·기본 action은 Card News domain의 단일 파생 계약이 소유하고 두 API surface가
  이를 전달하도록 정리했다. 화면별 상태명과 색상 조건은 추가하지 않는다.
- 2026-09-10: 첫 구현에서 generation이 있는 피드 항목을 바로 결과로 열어 선택한 글의 미리보기가 이전 글에 남는
  문맥 불일치를 사용자 테스트에서 확인했다. 6-1에서는 상태와 무관하게 피드 선택이 원문 미리보기를 먼저 갱신하도록
  바로 열기 분기를 제거했다.
- 2026-09-10: 6-2에서는 단일 `projects.json` 대신 `workspace/card-news/projects/{project_id}/project.json`에
  원문 snapshot을 보존하고 generation이 `project_id`를 참조하도록 한다. 기존 저장 형식 호환은 요구하지 않는다.

## 구현 결과와 검증

- `작업 중`, `발행 대기`, `발행 완료`, `확인 필요`를 workflow·publishing·error 사실에서 한 번만 파생한다.
- 피드와 관리 목록이 동일한 label, semantic key, design-system badge tone과 action label을 사용한다.
- Card News 전용 badge raw color 규칙을 제거하고 공통 `ui-status-badge` pattern을 사용한다.
- 피드 항목은 상태와 관계없이 선택한 원문의 미리보기를 갱신하며, 저장 결과 열기는 관리 목록에서만 제공한다.
- 상태 통합의 첫 구현 기준 focused test 37개와 browser UI smoke 262 fixture 요청이 통과했다.
- 사용자 테스트에서 발견된 피드 미리보기 문맥 문제를 수정했다. 사용자의 요청에 따라 이 마지막 수정의 focused 및
  browser 회귀 검증은 slice 6-2 프로젝트 snapshot 복원까지 구현한 뒤 통합 수행한다.

## 남은 위험과 후속 작업

- 작업 재진입은 후속 6-2에서 프로젝트별 원문 snapshot을 먼저 복원한 뒤 generation을 여는 구조로 다룬다.
- 현재 `만든 카드뉴스`에서 generation을 열 때 원문 미리보기가 복원되지 않는 제한은 6-2 완료 전까지 남아 있다.
