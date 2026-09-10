# Card News 결과·개별 이미지 작업 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-04-results`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · 사용자 UI 승인 · parent merge gate 통과

## 사용자 필요와 목표

카드 구성이 만들어진 뒤 전체 결과와 각 카드의 이미지 상태·내용·가능한 행동을 빠르게 이해하고, 이미지 생성·교체·받기를
혼동 없이 수행할 수 있게 한다. 앞선 Card News slice와 같은 workflow surface, action hierarchy와 semantic token을 재사용한다.

## 범위

1. 결과 heading, 요약과 전체 action의 정보 위계 정리
2. 개별 카드의 이미지 있음·미지정·작업 중 상태 표현 정리
3. `이미지 만들기/다시 만들기`, 내 이미지 선택·교체, 이미지 받기와 prompt 보조 action 위계 정리
4. 카드 수와 화면 비율에 따른 responsive grid 및 keyboard/focus 접근성 검증
5. 두 product style, Card News focused contract와 browser smoke 검증

## 명시적 비범위

- Card News 내부·관리 화면 상태 모델과 클릭 동작 통합
- Buffer SNS 발행 panel 개편
- 만든 카드뉴스 목록·filter와 ZIP 복원 UI 개편
- 이미지 생성 backend, prompt 또는 저장소 계약 변경

## 설계 원칙

- 이미지 자체가 primary content이며 카드 shell, 번호와 빈 상태는 이를 방해하지 않는 neutral surface를 사용한다.
- 개별 카드의 primary action은 현재 다음 필수 단계 하나만 강조한다. prompt 확인·복사와 다운로드는 보조 action으로 둔다.
- 이미지 작업 중에는 충돌 가능한 전체·개별 image action을 잠그되 완성된 다른 카드와 마지막 정상 결과는 유지한다.
- feature stylesheet는 aspect ratio와 result grid 같은 domain geometry만 소유하고 색상·radius·typography는 공통 token을 사용한다.

## 구현 진행

- 2026-09-10: Slice 3을 사용자 승인과 full unit gate 후 parent에 merge하고 sub-branch를 삭제했다.
- 2026-09-10: 피드 목록의 `구성 있음`과 관리 목록의 `작업 중`이 서로 다른 투영 규칙과 클릭 동작을 갖는 점을 확인했다. 이번 UI slice에서는 변경하지 않고 후속 기능 정합성 항목으로 분리했다.
- 2026-09-10: 첫 review에서 최대 400px auto-fill이 기본 3장 결과에서도 2열과 큰 여백을 만드는 문제가 확인됐다. 사용자 결정에 따라 desktop 3열, 중간 폭 2열, mobile 1열로 수정했다.
- 2026-09-10: 순번은 상태 badge와 분리한 공통 `.ui-sequence-badge`로 이관하고, 빈 이미지는 style token 기반 muted surface로 통일했다.
- 2026-09-10: hover에 숨었던 `＋` file picker를 명시적인 `내 이미지 선택/교체` 보조 button으로 바꿨다. 이미지가 없을 때만 개별 `이미지 만들기`와 전체 만들기를 primary로 두고, 완성 후에는 재생성을 secondary로 낮추며 `SNS 발행`을 다음 primary action으로 유지한다.
- 2026-09-10: 전체 이미지 받기 anchor를 공통 `.ui-button-link` 위계로 이관했다. 생성 중에는 구성 재생성, 전체·개별 이미지 action, 로컬 file picker, 발행과 export를 하나의 잠금 함수로 함께 제어한다.
- 2026-09-10: 순번 media, 결과 action hierarchy와 button 역할 anchor 규칙을 공통 component guide에 추가했다.
- 2026-09-10: 첫 review에서 파일 선택을 본문 button으로 내린 방식보다 media 중앙의 보편적인 선택 affordance가 낫다는 피드백을 반영했다. 빈 media 중앙에는 `AI 이미지 만들기`와 `＋ 내 이미지 선택`을 함께 표시하고, 완성 후에는 같은 media 영역의 항상 보이는 작업 bar에서 다시 만들기·교체·받기를 제공한다. 본문 action은 prompt 확인·복사만 소유한다.
- 2026-09-10: 빈 media의 단조로운 단색 면은 실제 결과로 오해할 기본 이미지 대신 semantic token 기반의 낮은 대비 dot pattern으로 보완했다. 고정 palette나 style별 selector는 추가하지 않았다.
- 2026-09-10: 결과 heading action이 넓은 화면에서도 이르게 왼쪽 아래로 내려가던 1500px breakpoint를 제거해 우측 위계를 유지했다.
- 2026-09-10: `프롬프트 복사`의 bordered ghost button이 보조 action보다 강하게 보이고 disclosure와 분리되어 보인다는 review를 반영했다. native `프롬프트 보기` disclosure와 우측 `복사` text action을 divider 아래 하나의 detail tool row로 묶고, 이 반복 원문 도구 규칙을 공통 component guide에 추가했다.
- 2026-09-10: 완성 이미지의 항상 보이는 작업 bar가 결과 일부를 가리고 세 action이 두 줄로 꺾여 면적을 과도하게 차지한다는 review를 반영했다. 완성 상태는 세 action을 한 줄 group으로 고정하고 pointer hover·keyboard focus에만 style token 기반 반투명 overlay로 표시한다. hover 없는 터치 환경은 발견 가능성을 위해 항상 표시하며, 빈 상태의 두 생성 경로는 계속 노출한다.
- 2026-09-10: 첫 구현의 implicit grid가 browser smoke에서 세 action을 두 행으로 배치하는 것을 확인했다. 동일 너비의 nowrap flex action group으로 교정해 action 수와 관계없이 한 행을 보장했다.
- 2026-09-10: 실제 콘텐츠 review에서 완료 bar 문구가 넘치고 반투명도가 약하며 본문 길이에 따라 prompt tool row가 어긋나는 점을 확인했다. 완료 action은 `AI 재생성 · 이미지 교체 · 받기`로 축약하고 token 기반 투명 surface 비율을 높였다. 같은 grid row의 card·copy를 stretch하고 prompt section을 자동 하단 정렬해 고정 높이 없이 위치를 통일했다.
- 2026-09-10: 사용자 재검증에서 피드 목록이 `공개 글 목록을 불러오는 중입니다`에 고정되는 문제가 발견됐다. 앱 로그에는 목록 성공·실패가 모두 남지 않았고, 서버 경로가 RSS 조회 후 보조 관리대장 동기화를 제한 없이 기다리고 있었다. 관리대장 동기화를 3초로 time-box하여 지연되면 상태 annotation 없이 원문 목록을 먼저 반환하고, 진행 중인 동기화와 기존 결과는 취소하거나 지우지 않도록 수정했다.
- 2026-09-10: 같은 재검증에서 `만든 카드뉴스`도 관리대장 read에 종속되어 로딩에 고정됨을 확인했다. 관리대장 조회도 3초로 time-box하고, 로컬 export manifest를 읽는 `listGenerations`를 정식 generation service capability로 추가했다. 정상 시에는 관리대장과 로컬 결과를 generation ID로 합치고, 지연·실패 시에는 로컬 결과를 즉시 fallback 목록으로 반환한다.

## 검증

- `node --check ui/scripts/features/card-news/source-preview.js`
- `node --check scripts/test-ui-browser-smoke.js`
- `node --test scripts/card-news-shell-contract.test.js scripts/design-style-foundation.test.js`: 27 passed, 0 failed
- `node --test scripts/card-news-shell-contract.test.js src/card-news/generation-service.test.js src/ui-api/services/card-news.service.test.js src/card-news/ledger-sync-service.test.js`: 44 passed, 0 failed. prompt detail tool row, 관리대장 지연 fallback, 로컬 generation 열거와 중복 제거 사례 포함
- `npm run test:ui-browser`: latest run passed, 261 fixture requests
- browser smoke는 9:16 미지정 이미지 3장과 서로 다른 제목·본문 길이의 1:1 완성 이미지 3장을 각각 렌더링해 desktop 3열, 순번, media 내부의 생성·file picker·교체·download, 완성 action bar의 hover 전후 opacity와 한 행 정렬, 동일 card 높이와 prompt 하단 정렬, prompt disclosure·text copy action, heading 우측 전체 action과 완성 후 발행/export 노출을 검증했다.
- 사용자 UI 확인 완료: 이미지가 없는 결과와 완성 결과에서 card 폭·행동 위계, 생성·교체·받기 overlay, prompt 도구와 서로 다른 본문 길이의 하단 정렬을 승인했다.
- `npm run test:unit`: 301 files, 1581 passed, 0 failed, 1 skipped

## 남은 위험과 후속 작업

- `구성 있음`과 `작업 중`의 상태 명칭 및 재진입 동작은 이번 visual slice에 섞지 않았다. 모든 Card News UI slice가 끝난 뒤 하나의 상태 projection·재진입 규칙으로 통일한다.
- SNS 발행 panel과 만든 카드뉴스·ZIP surface에는 기존 palette가 남아 있으며 각각 다음 slice에서 처리한다.
