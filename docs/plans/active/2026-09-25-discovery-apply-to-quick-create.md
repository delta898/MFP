# Discovery 소재 적용 → 바로 생성

- Branch: `codex/feature/discovery-apply-quick-create`
- Base branch: `dev` (the branch was created from this commit)
- Integration parent: `codex/feature/card-news-image-stop` (user-requested parent merge target)
- Started: 2026-09-25
- Status: merged into `codex/feature/card-news-image-stop`; awaiting user hands-on validation

## 사용자 요구와 목표

대시보드의 `새로운 발견`에서 `소재 적용`을 선택했을 때, 발견 항목 제목이 카드 목록에서 잘린 표시 텍스트가 아니라 원본 전체 제목으로 빠른 글 작성의 `바로 생성`에 전달되도록 한다. 이동 목적지도 사용자가 직전에 보고 있던 블로그 하위 메뉴와 무관하게 `블로그 → 빠른 글 작성 → 바로 생성`으로 고정한다.

## 범위와 비목표

- 범위: 발견 항목의 원본 제목 전달, 명시적 Blog Beta/빠른 글 작성/바로 생성 목적지 선택, 관련 상태 초기화 및 회귀 테스트.
- 비목표: 발견 카드의 표시 스타일 변경, 소재 설명/출처의 작성 화면 추가 전달, 카드뉴스·SNS 흐름 변경, 별도 발견 기능 리디자인.
- 기존 작성 중 데이터가 있을 때 이를 조용히 덮어쓰지 않도록 현재 이벤트/임시 상태 흐름을 확인하고, 필요한 경우 기존 앱 관례에 맞는 보존 또는 확인 처리를 한다.

## 제안 설계 및 단계

1. `소재 적용` 이벤트가 참조하는 발견 레코드와 표시 제목/원본 제목의 데이터 흐름을 확인한다.
2. 발견 원본의 전체 제목을 바로 생성 주제/제목 입력에 전달하고, 현재 블로그 메뉴에 의존하지 않는 목적지 내비게이션을 구현한다.
3. 전달값 무절단 및 목적지 선택을 위한 집중 계약/브라우저 테스트를 추가·실행한다.
4. 결과와 남은 수동 확인 사항을 기록한다.

## 사용자 결정

- `소재 적용`은 바로 글을 작성하려는 명시적 동작이므로 항상 `블로그 → 빠른 글 작성 → 바로 생성`으로 이동한다.
- 제목은 카드의 시각적 줄임 표시가 아닌 원본 값을 그대로 사용한다. 입력 필드에서 일부만 보이는 것은 데이터 절단과 구분한다.

## 진행 및 검증

- 작업 브랜치는 `dev`에서 분기해 만들어졌으며, 결과는 사용자 요청에 따라 `codex/feature/card-news-image-stop` 통합 브랜치로 병합한다. 따라서 두 브랜치는 현재 형제 관계이고, 통합에는 fast-forward가 아닌 merge commit이 필요하다.
- 발견 뉴스 제목은 추천 카드 제목 길이 제한(180자)과 별도로 발행 화면 handoff에 원문 제목(최대 1000자)을 보존한다. 기존 `query`는 호환성을 위해 유지하며, 새 원문 필드가 있으면 따옴표 정규화 없이 작성 주제로 넣는다.
- `blog.quick` 목적지는 `navigateToBlogQuickCreate()`를 재사용해 Blog Beta의 빠른 글 작성 및 `바로 생성` 입력 모드까지 활성화한 뒤 주제를 입력한다. 이전에 원고 폴더/붙여넣기를 선택했더라도 목적 모드가 남지 않는다.
- 뉴스 추천 원문/저장 뉴스 원문에 대한 handoff 보존 테스트와 Dashboard Beta 계약 테스트 25/25 통과. `npm run test:ui-browser`도 발견 소재 시나리오(기존 붙여넣기 모드에서 바로 생성으로 전환, 180자보다 긴 제목의 완전 전달 포함)를 포함해 통과했다.
- 수동 확인 뒤 기존 항목에서 잘림이 재현됨. 저장 추천은 `original_title`이 없을 수도 있고, 있어도 짧을 수 있다. UI handoff에서 뉴스 근거 문장의 제목이 저장 제목보다 길고 동일 제목의 접두부임을 검증해 더 긴 값을 사용한다. 구버전은 표시 `query`의 접두부가 일치할 때만 복구하며, 불완전 표시(말줄임표) 제목은 원문으로 승격하지 않는다.
- 재검증: `node --test src/recommendations/producers/content-opportunity.test.js` 통과(13/13), `npm run test:ui-browser` 통과(393 fixture requests), `git diff --check` 통과.
- 통합: `codex/feature/discovery-apply-quick-create`를 `codex/feature/card-news-image-stop`에 merge commit `3f812894`로 병합하고, 요청에 따라 소스 feature branch를 삭제했다.
- 남은 수동 확인: 실제 대시보드에서 기존·새 `새로운 발견` 항목 각각의 `소재 적용`을 눌러 제목 전체가 주제 필드에 들어가고 `바로 생성`이 열리는지 확인. 입력 필드의 시각적 말줄임과 실제 값 절단은 구분해서 확인한다.
