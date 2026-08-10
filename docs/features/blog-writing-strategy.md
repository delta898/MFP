# Blog Writing Strategy

## Overview

BlogGenius의 AI 블로그 글은 플랫폼과 관계없이 두 가지 작성 전략을 지원한다.

- `검색 중심` (`search`): 검색 의도와 핵심 정보를 명확하게 전달한다.
- `발견 중심 (피드)` (`discovery`): 피드에서 우연히 글을 만난 독자의 관심과 읽기 흐름을 고려한다.

작성 전략은 글의 목적과 구성 우선순위를 바꾸는 기능이다. 검색 결과 또는 피드 노출을 보장하거나 예측하지 않는다.

## Settings

전역 기본값은 블로그와 쇼핑 콘텐츠가 공유하는 콘텐츠 설정에 저장한다.

```json
{
  "content": {
    "writing_strategy": "search"
  }
}
```

기존 `content.blog.writing_strategy`는 호환 fallback으로 유지한다. 누락되거나 지원하지 않는 값은 `search`로 정규화하며, 런타임에서는 `CONFIG.CONTENT_WRITING_STRATEGY`와 기존 `CONFIG.BLOG_WRITING_STRATEGY`가 같은 값을 제공한다.

## Per-post Override

빠른 포스팅의 AI 생성 모드는 설정 화면과 동일한 세그먼트 선택 버튼을 제공한다.

- 검색 중심
- 발견 중심 (피드)

화면을 열거나 입력을 초기화하면 현재 전역 전략을 선택 상태로 표시한다. 사용자가 다른 전략을 고르면 해당 빠른 글에만 적용하며 전역 설정은 변경하지 않는다.

일괄 포스팅의 글감 편집 팝업에서는 다음을 선택할 수 있다.

- 기본 설정 사용
- 검색 중심
- 발견 중심 (피드)

빠른 포스팅은 화면에서 선택된 유효 전략을 글감에 저장한다. 일괄 포스팅 편집에서 명시적인 개별 선택만 글감 `options.writing_strategy`에 저장한다. `기본 설정 사용`을 선택하면 이 키를 삭제하므로 글이 실제로 생성되는 시점의 전역값을 따른다. 어떤 개별 선택도 전역 설정을 변경하지 않는다.

자동 수집·자동 포스팅 글감은 기본적으로 전역 설정을 상속한다. 원고 폴더와 원고 붙여넣기에는 적용하지 않는다.

쇼핑 콘텐츠는 별도 UI나 상품별 override 없이 전역 전략을 상속한다. 빠른 포스팅, 일괄 포스팅, 자동 포스팅이 모두 `ShoppingManager.buildPostFromShortUrl`을 통과하므로 같은 쇼핑 전용 전략 규칙이 적용된다.

## Resolution

전략값은 다음 순서로 결정한다.

1. 글감의 명시적인 `options.writing_strategy`
2. `CONFIG.CONTENT_WRITING_STRATEGY` (`CONFIG.BLOG_WRITING_STRATEGY` 호환 별칭)
3. `search`

최종 프롬프트는 공통 출력 계약, 선택된 전략, 문체, 사용자 입력 순서로 조합한다. 사용자의 참고/지시사항이 전략과 충돌하면 명시적인 사용자 지시가 우선한다.

## Prompt Composition

프롬프트 책임은 다음 세 파일로 분리한다.

- `src/config/blog_prompt.md`: 두 전략이 공유하는 JSON 출력, 본문 구조, 참고자료, 인용구와 `[[IMAGE_N ...]]` 이미지 플레이스홀더 계약
- `src/config/blog_prompt_search.md`: 검색 의도, 제목과 정보 구조를 위한 검색 중심 규칙
- `src/config/blog_prompt_discovery.md`: 피드 제목, 도입부와 읽기 흐름을 위한 발견 중심 규칙

런타임은 공통 파일과 선택된 전략 파일 하나만 읽는다. 따라서 발견 중심에도 기존 이미지 프롬프트 규약이 그대로 적용되며, 검색 중심 규칙이 발견 중심에 섞이지 않는다. 문체 설정과 입력 데이터는 그 뒤에 결합한다.

쇼핑은 위 블로그 전략 파일을 읽지 않는다. 독립된 `shopping_prompt.md`의 상품 사실·리뷰·출력 계약을 유지하면서 `buildShoppingWritingStrategyPrompt`가 다음 규칙만 주입한다.

- 검색 중심: 상품 식별 키워드와 가격·혜택·배송·용도 등 검색 의도를 빠르게 해소
- 발견 중심 (피드): 사용 상황이나 고민으로 관심을 열고 장면 → 근거 → 선택 기준으로 전개
- 공통 안전장치: 근거 없는 어그로, 긴급성, 과장 및 열린 결말형 제목 금지

## Code Ownership

- `src/content/writing-strategy.js`: 값 정규화, 상속 해석 및 설명
- `src/content/writing-preferences.js`: 공통 콘텐츠 설정과 기존 블로그 설정 fallback 해석
- `src/content/blog-prompt.js`: 공통·전략 프롬프트 경로 선택, 검증 및 조합
- `src/config/blog_prompt*.md`: AI가 따르는 공통 계약과 전략별 작성 규칙
- `src/content/publish-sheet-options.js`: 글별 명시적 오버라이드 저장·복원
- `src/config-loader.js`: 전역 기본값 해석
- `src/core.js`: 최종 전략 해석 및 공통·전략·문체·입력 프롬프트 조합
- `src/shopping-manager.js`: 공통 전역값을 쇼핑 전용 문체·전략 규칙으로 변환
- Settings service/server: 전역 설정 영속화 및 실행 중 설정 반영
