# 네이버 연관글 발행 링크 형식 개발 기록

## 브랜치 정보

- Branch: `codex/feat/naver-related-link-format`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: 부모 브랜치 병합 완료, 네이버 실발행 UI 수동 확인 대기

## 사용자 필요와 목표

블록 편집기에서 연관글이 Markdown 인라인 링크로 표현되더라도, 네이버 발행에서는 Markdown 문법이 본문에 노출되지 않고 네이버가 처리할 수 있는 URL 링크 형태로 입력되게 한다.

## 범위

- 네이버 발행 직전의 연관글 섹션만 URL 단독 문단으로 변환한다.
- 변환 시 연관글 목록 마커(bullet)를 제거한다.
- 변환은 네이버 발행용 입력에만 적용하고 저장된 원고와 블록/Markdown/보기 화면은 변경하지 않는다.
- 기존 URL 단독 문단의 네이버 링크 카드 자동 삽입 경로를 재사용한다.
- 변환 규칙 단위 테스트를 추가한다.

## 비범위

- 본문에 사용자가 직접 작성한 인라인 링크의 발행 형식 변경
- 워드프레스 발행 형식 변경
- 블록 편집기에서의 링크 표현 변경
- 네이버 외부 링크의 별도 처리 정책

## 설계 및 진행

- 연관글은 공통 원고에서 `- [제목](URL)` Markdown 형식으로 유지한다.
- 네이버 발행기가 내용을 파싱하기 전에, 알려진 연관글 섹션의 링크 항목만 URL 단독 줄로 바꾼다. 기존 네이버 URL 단독 문단 처리기가 이를 링크 카드로 입력한다.
- 발행 직전 복사본만 변환하여 canonical manuscript 내용을 보존한다.

## 구현 결과

- `src/content/naver-related-posts.js`에 알려진 연관글 제목 아래의 Markdown bullet 링크만 URL 단독 줄로 바꾸는 순수 변환기를 추가했다.
- `src/core.js`의 네이버 발행 진입점에서만 원고를 파싱하기 직전에 변환기를 적용한다. 저장된 `contents.md`, 화면 표시, 워드프레스 발행 경로에는 변경을 쓰지 않는다.
- 관련글 섹션 밖의 링크와 섹션 안의 일반 문장은 그대로 둔다.
- `src/content/naver-related-posts.test.js`에서 변환, 적용 범위, 일반 문장 보존을 검사한다.

## 검증 및 남은 확인

- 통과: `node --check src/content/naver-related-posts.js`, `node --check src/core.js`, `node --test src/content/naver-related-posts.test.js`, `git diff --check`.
- 미실행: 기존 `related-post-mobile-links.test.js`는 worktree에 설치된 의존성이 없어(`axios` 미설치) 시작되지 않았다.
- 수동 확인: 네이버 발행 테스트에서 연관글 항목이 bullet/Markdown 링크 텍스트가 아니라 URL 카드로 입력되는지 확인하고, 원고 재열기 및 워드프레스 출력이 바뀌지 않는지 확인한다.
- 수동 확인: 연관글 bullet 제거 및 링크 카드 표시, 원고 재열기 후 Markdown과 워드프레스 출력 불변.
