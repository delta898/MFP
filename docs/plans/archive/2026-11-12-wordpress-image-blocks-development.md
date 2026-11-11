# WordPress 본문 이미지 블록

## 브랜치 정보

- branch: `feature/wordpress-image-blocks`
- 시작일: 2026-11-12
- base/parent branch: `dev`
- 상태: `dev`에 병합. 기능 브랜치는 삭제한다.

## 사용자 필요

WordPress에 올린 글을 편집기로 열면 업로드한 이미지가 image block이 아니라 paragraph block 안에 있다. image block으로 바꾸지도 못한다.

## 목표

발행 본문에 업로드 ID가 있는 Gutenberg `wp:image` 블록을 저장한다.

## 범위

- `src/applications/blog/publishing/wordpress.js`
- `src/applications/blog/publishing/wordpress.test.js`

## 명시적 비목표

- 이미 발행된 글의 본문 수정
- 네이버 발행 본문
- 문단 한가운데 섞인 이미지의 배치 재구성

## 결정

단독 `{{asset:...}}` 문단은 문단 태그를 빼고 `<!-- wp:image {"id":N} -->`와 `wp-image-N` 클래스로 바꾼다. 업로드 ID가 없으면 id 없는 image block을 쓴다. 문단 안의 남은 참조도 같은 블록 마크업으로 바꾼다. 그 경우는 문단 안에 블록이 남을 수 있다.

## 검증

- 사용자는 WordPress 편집기에서 직접 확인하기로 했다.
- `BLOGGENIUS_ENV=local node --test src/applications/blog/publishing/wordpress.test.js`: 7개 통과.
- 전체 유닛 스위트: 2,631개 중 2,630개 통과, 0개 실패, 1개 건너뜀. `npm audit --audit-level=high`는 moderate 24건을 포함해 28건을 보고했고 스위트를 막지 않았다.
- WordPress 편집기에서 이미지 블록으로 열리는지는 사용자가 확인한다.
