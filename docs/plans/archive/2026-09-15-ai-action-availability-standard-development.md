# Capability Readiness Standard

- Branch: `codex/feat/ai-action-availability-standard`
- Base/parent branch: `release/v0.5.0`
- Start date: 2026-09-15
- Status: Complete; merged candidate for `release/v0.5.0`

## User need and goal

필수 설정이 없는 상태에서도 메뉴와 상품 탐색 등 가능한 작업은 열어 두되, 실제 실행 버튼을 누른 뒤에야 실패하는 경험은 없앤다. 대시보드의 전체 준비 상태와 각 화면의 정확한 실행 조건을 같은 계약으로 연결한다.

## Agreed standard

1. 설정 미완료가 명확한 `false`일 때만 UI를 차단한다. 상태 조회 실패/초기 `unknown`은 서버의 최종 검증에 맡긴다.
2. 안전한 `/api/v1/config/status`의 AI, Spreadsheet, 네이버, 워드프레스 준비 상태만 사용하며 자격 증명은 UI로 보내지 않는다.
3. 메뉴 진입은 허용한다. 화면 안에서 가능한 작업은 유지하고, 각 버튼에 실제로 필요한 capability만 비활성화한다.
4. 팝업 대신 버튼 가까운 인라인 안내와 해당 설정 카드로 가는 복구 링크를 제공한다.
5. UI 사전 차단과 별개로 서버가 AI 원고 생성 등 비용/실행 경계에서 최종 검증한다.

## Affected boundaries

- `ui/scripts/shared/capability-readiness.js`: 상태 정규화, 새로고침, 실행 직전 확인, 설정 이동.
- Blog Beta: AI 원고 생성, 글감 보관/대기열, 선택한 발행 채널을 각각 독립적으로 안내·차단.
- 쇼핑커넥트: 설정 누락 팝업 없이 진입 가능. 상품 불러오기는 유지하고 저장·AI 발행·채널 발행만 조건별 차단.
- 키워드 제목 추천은 추출된 전용 모듈에서 같은 AI 준비 상태를 재사용.
- 서버 AI 원고 생성 경계에 `AI_TEXT_MODEL_REQUIRED` 최종 검증 추가.

## Progress and verification

- 공통 capability 모듈 및 Blog Beta/쇼핑커넥트 연결 구현.
- 키워드 모달을 lifecycle에서 독립 모듈로 분리한 기존 작업을 유지하고 구조 테스트 경로를 교정.
- 설정 미완료 자체로 띄우던 전역 popup을 제거했다. 상태 API 조회 실패는 진단 가능한 실제 오류이므로 기존 오류 popup을 유지한다.
- 집중 계약·구조·쇼핑 UI·Blog Next 서비스 테스트: 36개 통과.
- 브라우저 smoke: 367 fixture requests 통과. AI 미설정 원고 action, 쇼핑커넥트 설정 미완료 진입/인라인 안내/상품 미리보기 허용을 포함한다.
- 전체 unit suite는 실행하지 않았다. parent merge/release gate에서 사용자 승인 후 수행한다.

## Manual checks still required

- 깨끗한 Development 설정에서 Blog Beta `원고 만들기`가 비활성화되고 `AI 설정하기` 이동이 정확한지 확인.
- Spreadsheet 미연결 상태에서 글감 보관/대기열만 비활성화되고 원고 입력·AI 생성은 가능한지 확인.
- 네이버 또는 워드프레스 중 하나만 설정한 상태에서 선택 가능한 채널과 실제 발행 버튼이 일치하는지 확인.
- 쇼핑커넥트에서 popup 없이 진입하고 상품 불러오기는 가능하되 저장/발행 action은 필요한 설정별로 차단되는지 확인.

## Review correction

- 첫 구현의 쇼핑커넥트 page-level 통합 readiness panel은 대시보드 안내를 반복하고 Blog Beta의 action-local 원칙과
  일치하지 않아 제거했다.
- `빠른 글 작성`에서는 `나중에 활용` 아래 Spreadsheet 안내, `지금 포스팅` 아래 AI·선택 채널 안내만 표시한다.
- `글감 관리`의 Spreadsheet 안내는 해당 tab 내부 empty/recovery 문맥에만 표시한다.
- 이 correction에서는 카드뉴스, SNS, Blog Beta 이미지 AI readiness를 확장하지 않았다.
- correction 후 집중 UI·구조 테스트 29개 및 브라우저 smoke 367 fixture requests를 다시 통과했다.

## Blog manuscript image AI stage

- `ai.image` capability를 안전한 setup readiness에 추가했다. 이미지 모델 설정 여부만 제공하며 credential은 노출하지 않는다.
- 바로 생성에서 사용자가 `이미지 생성`을 선택한 경우에만 글쓰기 모델과 이미지 모델을 함께 요구한다. 프롬프트만 포함하거나
  이미지를 사용하지 않는 선택은 이미지 모델 없이 유지한다.
- 바로 생성·원고 폴더·원고 붙여넣기의 이미지 slot에서 `AI로 만들기`, `AI 재생성`, `빈 이미지 모두 만들기`만
  이미지 모델 미설정 시 비활성화한다. 내 이미지 선택, 사용 안 함, 원고에서 제거와 원래 이미지 복원은 차단하지 않는다.
- 이미지 모델이 없더라도 원고 발행 버튼은 유지한다. prompt-backed 빈 이미지가 남아 있으면 기존 publish safety 정책에 따라
  자동 생성 실패 후 임시 저장될 수 있음을 발행 설정에 안내한다.
- 수동 단일/일괄 이미지 생성 server boundary에 `AI_IMAGE_MODEL_REQUIRED` 최종 검증을 추가했다. 발행 전 자동 보정은
  기존 partial-success 및 safe-draft 정책을 유지한다.
- 집중 readiness·구조·account/system·draft/service 테스트 60개 통과.
- 브라우저 smoke 368 fixture requests 통과. 이미지 AI 미설정 상태에서 AI 버튼 차단, local 선택 허용, 발행 허용과
  safe-draft 안내를 확인한다.

## Blog publish readiness UI correction

- 세 원고 방식이 공유하는 `발행 설정` 내부의 독립 안내를 제거했다. 준비되지 않은 발행 채널 안내는 실제 포스팅
  버튼과 같은 action 영역에서만 표시한다.
- 바로 생성, 원고 폴더, 원고 붙여넣기 모두 같은 안내 문구·설정 이동 버튼·배치 구조를 사용한다.
- 현재 선택한 원고 방식의 안내만 노출하고, 설정 이동 후에도 해당 방식의 발행 동작으로 자연스럽게 돌아올 수 있게 했다.
- 입력 방식 전환 직후 발행 capability와 안내 상태를 다시 계산해 이전 방식의 안내가 남지 않도록 했다.
- correction 집중 계약·구조 테스트 14개와 JavaScript 구문 검증을 통과했다. 브라우저 smoke 재실행은 첫 시도에서
  Chrome EGL 초기화 실패, 두 번째 시도에서 변경 범위 이전의 Dashboard Beta 기간 버튼 안정화 timeout으로 중단되어
  이 correction의 상호작용 구간까지 도달하지 못했다.
- parent merge gate 전체 unit suite: 1,831개 중 1,830개 통과, 플랫폼 의존 1개 skip, 실패 0개. 첫 실행에서 발견한
  네 건은 모듈 분리와 action wrapper 추가 전의 코드 위치를 검사하던 정적 계약으로, 새 소유 모듈과 구조를 검사하도록
  교정한 뒤 전체 suite를 재실행해 통과했다.
