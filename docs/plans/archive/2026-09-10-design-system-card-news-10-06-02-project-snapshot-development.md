# Card News 프로젝트 snapshot·재진입 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-06-02-project-snapshot`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · parent 병합 준비

## 사용자 필요와 목표

Card News의 1~3단계가 항상 같은 원문을 다루게 한다. RSS, URL 직접 입력, 내용 직접 입력 모두 카드 생성 당시의
원문 snapshot을 로컬 프로젝트에 보존하고, `만든 카드뉴스`에서 다시 열 때 원문 미리보기를 먼저 복원한 뒤 생성 결과를
표시한다.

## 범위

1. 단일 `projects.json`을 프로젝트별 `workspace/card-news/projects/{project_id}/project.json` 저장소로 교체
2. 카드 생성 시 검증된 source snapshot을 프로젝트에 저장
3. generation manifest에 `project_id` 참조 저장
4. 저장 결과 조회 API가 프로젝트 snapshot을 함께 반환
5. `새 카드뉴스`와 `만든 카드뉴스`를 독립된 작업 문맥으로 유지
6. 두 탭의 목록 UI와 카드 설정·결과·발행 모듈을 공통화
7. `만든 카드뉴스` 선택 시 같은 탭 하단에 저장 snapshot과 generation 표시
8. canonical 문서와 회귀 계약 갱신

## 명시적 비범위

- 기존 generation manifest 호환·migration
- ZIP 저장·복원 구조 변경
- 원문 snapshot 수동 새로고침 UI
- 실제 외부 AI·Buffer·Google Drive 호출

## 설계 원칙

- 원문 전문은 generation마다 복제하지 않고 project가 한 번 소유한다.
- generation은 `project_id`만 참조하며 service boundary가 project와 generation을 조합한다.
- RSS, URL 직접 입력, 내용 직접 입력은 프로젝트 생성 전에는 서로 다른 입력 방식일 뿐이며, 생성 뒤에는 모두 같은 snapshot 계약을 사용한다.
- `새 카드뉴스`의 입력·미리보기 상태와 `만든 카드뉴스`의 프로젝트·결과 상태를 분리한다.
- 목록 행과 하단 workflow는 공통 UI 모듈을 재사용하되 각 탭의 상태 소유권은 섞지 않는다.
- 두 목록은 같은 높이·스크롤, 도구 영역, 행 정보 위계, hover/focus/선택 상태를 사용한다. 상태 필터, 소스 관리,
  ZIP 가져오기 같은 차이는 공통 도구 영역의 선택적 기능으로만 둔다.
- 목록 행은 제목·상태·날짜의 고정 열과 한 줄 보조 정보만 가진다. 원문과 발행 링크는 선택 뒤 상세 문맥에 두며,
  상태색은 화면별 색상값이 아닌 공통 neutral/action/success/warning 의미 토큰을 사용한다.
- 생성 결과 영역은 완료 여부와 무관한 `카드 작업`으로 이름 붙이고, 전체 구성·이미지 액션은 설명 아래 카드 목록
  직전에 우측 정렬해 해당 카드 묶음에 작용한다는 위계를 드러낸다.
- 구현 뒤 focused 및 browser 회귀 test는 사용자 승인 후 실행한다.
- 기존 `workspace/card-news/projects.json`은 이관하지 않고 저장소 초기화 시 삭제한다. 삭제 실패를 숨기지 않으며 새
  프로젝트별 저장소 사용을 중단한다.
- 새 구조 이전에 만들어져 `project_id`가 없는 결과는 호환 복원하지 않는다. 결과 자체는 열되 별도 안내나 원문
  미리보기를 표시하지 않는다.

## 구현 결과와 검증

- 프로젝트 저장소를 단일 aggregate JSON에서 프로젝트별 디렉터리와 `project.json` 파일로 분리했다.
- 저장소 초기화 시 지원하지 않는 기존 `projects.json`을 이관 없이 삭제하며, 경로 이탈이 가능한 프로젝트 ID를 거부한다.
- 새 구성 생성 시 service가 확인된 source snapshot으로 프로젝트를 먼저 만들고 generation에 `project_id`를 전달한다.
- 같은 프로젝트에서 구성을 다시 만들 때 클라이언트가 보낸 snapshot 대신 프로젝트에 보존된 snapshot을 사용한다.
- 생성 결과 조회가 연결된 프로젝트 snapshot을 함께 반환하며, 연결 정보가 없는 이전 결과는 `null` snapshot과 함께 정상 반환한다.
- `만든 카드뉴스` 재진입은 탭을 이동하지 않고 왼쪽 목록 선택, 오른쪽 저장 snapshot 미리보기, 하단 카드 결과·발행 순서로 연다. `새 카드뉴스`와 같은 2열 상단 + 공통 하단 workflow를 사용한다.
- snapshot이 없는 이전 결과는 별도 안내나 원문 미리보기 없이 결과만 연다.
- 두 탭의 목록은 같은 고정 높이·스크롤·도구 영역과 공통 행 컴포넌트를 사용하고, 상태·날짜·카드 수 등 보조
  데이터만 다르게 구성했다. `만든 카드뉴스`의 별도 `결과 보기` 버튼은 제거하고 마우스와 키보드 모두 행 전체
  선택으로 원문 미리보기와 하단 작업 영역을 갱신한다.
- 두 목록 행을 같은 고정 높이와 제목·상태·날짜 열로 정렬하고 보조 정보를 한 줄로 제한했다. 만든 목록의 외부
  링크는 선택한 원문의 우측 상세 영역으로 옮겼다.
- 새 글 목록의 native button 글꼴 상속 차이를 제거하고, 만든 카드뉴스에서 사용하던 제목 위계를 공통 행의
  font family·크기·굵기·행간 토큰으로 승격해 두 목록에 동일하게 적용했다.
- `작업 중`의 푸른 정보색을 제거해 중립 상태로, `발행 대기`는 공통 action accent로 연결했다. `발행 완료`와
  `확인 필요`는 각각 기존 success와 warning 의미를 유지한다.
- 결과 eyebrow를 `완성`에서 `카드 작업`으로 바꾸고 전체 작업 버튼 묶음을 제목 옆에서 설명 아래·카드 목록 위로
  이동했다.
- 카드 설정·결과·발행 DOM은 복제하지 않고 공통 workflow를 두 탭의 전용 slot에서 재사용하며, 탭별 상태를 별도로 보존한다.
- 다른 원문을 확인하면 현재 화면의 2·3단계 문맥만 초기화하며 이미 저장된 프로젝트·generation 파일은 유지한다.
- repository/service/generation/UI contract/browser 회귀 시나리오를 새 계약에 맞게 갱신했다.
- focused 검증: `node --test src/card-news/project-repository.test.js src/card-news/generation-service.test.js src/card-news/management-status.test.js src/ui-api/services/card-news.service.test.js scripts/card-news-shell-contract.test.js` — 48/48 통과
- style·shell 계약 검증: `node --test scripts/design-style-foundation.test.js scripts/card-news-shell-contract.test.js` — 29/29 통과
- 브라우저 회귀: `npm run test:ui-browser` — 통과, 257 fixture 요청
- 전체 단위 회귀: `npm run test:unit` — 1,598건 중 1,597건 통과, 플랫폼 전용 1건 정상 skip
- 브라우저 회귀 중 snapshot이 없는 결과의 미리보기 뱃지가 `hidden` 속성보다 component display 규칙에 의해
  노출되는 결함을 발견해 hidden 계약을 명시적으로 보완했다.
- 수동 확인: 사용자의 실제 앱 UI·탐색 검증 대기

## 남은 위험과 후속 작업

- 실제 앱에서 RSS, URL, 직접 입력으로 새 프로젝트를 각각 만든 뒤 `만든 카드뉴스` 재진입 시 같은 탭 하단에 동일 원문과 결과가 복원되는지 확인해야 한다.
- 두 탭을 왕복해도 새 작업의 선택·미리보기와 만든 작업의 프로젝트·결과가 서로 바뀌지 않는지 확인해야 한다.
- 프로젝트 연결 정보가 없는 이전 결과를 열 때 결과는 유지되고 만든 탭의 원문 미리보기만 나오지 않는지 확인해야 한다.
- ZIP import를 프로젝트 snapshot 계약에 연결하는 작업은 이 slice의 명시적 비범위다.
