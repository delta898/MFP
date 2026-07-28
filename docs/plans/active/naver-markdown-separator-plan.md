# Naver Markdown Separator Plan

## Goal
Markdown 원고의 단독 줄 `---`를 네이버 블로그 발행 시 SmartEditor 구분선 블록으로 변환한다.

## Platform Boundary
- WordPress: 기존 `marked()` Markdown-to-HTML 변환이 `---`를 `<hr>`로 처리한다. 발행 코드 변경 없이 회귀 테스트만 추가한다.
- Naver: SmartEditor가 HTML 삽입을 계약으로 제공하지 않으므로, 현재 문단을 기준으로 문서 툴바의 구분선 선택 메뉴를 열고 구분선 옵션을 클릭한다.

## Naver Interaction Contract
1. `separator` 콘텐츠 블록을 만나면 현재 입력 위치에서 구분선 삽입을 시작한다.
2. 문서 툴바의 `구분선 선택` 버튼을 연다.
3. `구분선 4`(메뉴의 네 번째 옵션)를 클릭한다.
4. 방금 삽입된 구분선 블록을 다시 선택한 뒤 문단 정렬 메뉴의 가운데 정렬을 적용한다.
5. 구분선 뒤에 SmartEditor가 만든 다음 문단으로 이동한다.

가운데 정렬은 Markdown 문법 확장이 아니다. `separator` 블록 자체를 네이버에서 표현할 때만 적용하는 에디터 동작이다. 다음 본문 문단의 정렬은 바꾸지 않는다.

## Selector Strategy
- 우선 접근성 이름(`구분선 선택`)과 SmartEditor의 의미 있는 클래스명을 사용한다.
- 구분선 옵션은 `se-toolbar-option-insert-horizontal-*` 계열 중 네 번째 버튼을 사용한다. 옵션 수가 부족하면 다른 스타일로 대체하지 않고 실패 처리한다.
- 정렬은 기존 텍스트 문단 정렬 메뉴의 `data-value="center"`를 우선한다.
- DOM에 직접 `<hr>`를 삽입하는 방식은 사용하지 않는다.

## Validation
- parser: 단독 줄 `---`만 `separator`로 분류한다.
- preview: `separator`를 다시 `---`로 직렬화한다.
- WordPress: `marked()` 결과에 `<hr>`가 포함되는지 확인한다.
- Naver: 임시저장 smoke test에서 구분선이 실제 블록으로 가운데 정렬되고, 다음 문단이 기본 좌측 정렬을 유지하는지 확인한다.

## Non-goals
- Markdown에 가운데 정렬 지시문을 추가하지 않는다.
- WordPress의 정렬 또는 구분선 렌더링 코드를 변경하지 않는다.
