# Blog Writing Strategy

## Overview

BlogGenius의 AI 블로그 글은 플랫폼과 관계없이 두 가지 작성 전략을 지원한다.

- `검색 중심` (`search`): 검색 의도와 핵심 정보를 명확하게 전달한다.
- `발견 중심 (피드)` (`discovery`): 피드에서 우연히 글을 만난 독자의 관심과 읽기 흐름을 고려한다.

작성 전략은 글의 목적과 구성 우선순위를 바꾸는 기능이다. 검색 결과 또는 피드 노출을 보장하거나 예측하지 않는다.

## Settings

전역 기본값은 사용자 설정에 저장한다.

```json
{
  "content": {
    "blog": {
      "writing_strategy": "search"
    }
  }
}
```

누락되거나 지원하지 않는 값은 `search`로 정규화한다. 런타임에서는 `CONFIG.BLOG_WRITING_STRATEGY`로 제공한다.

## Per-post Override

빠른 포스팅의 AI 생성 모드와 일괄 포스팅의 글감 편집 팝업에서 다음을 선택할 수 있다.

- 기본 설정 사용
- 검색 중심
- 발견 중심 (피드)

명시적인 개별 선택만 글감 `options.writing_strategy`에 저장한다. `기본 설정 사용`을 선택하면 이 키를 삭제하므로 글이 실제로 생성되는 시점의 전역값을 따른다. 개별 선택은 전역 설정을 변경하지 않는다.

자동 수집·자동 포스팅 글감은 기본적으로 전역 설정을 상속한다. 원고 폴더, 원고 붙여넣기, 쇼핑 글에는 적용하지 않는다.

## Resolution

전략값은 다음 순서로 결정한다.

1. 글감의 명시적인 `options.writing_strategy`
2. `CONFIG.BLOG_WRITING_STRATEGY`
3. `search`

전략 프롬프트는 공통 블로그 생성 프롬프트와 문체 프롬프트 사이에 별도 레이어로 조합한다. 사용자의 참고/지시사항이 전략과 충돌하면 명시적인 사용자 지시가 우선한다.

## Code Ownership

- `src/content/writing-strategy.js`: 값 정규화, 상속 해석, 설명 및 프롬프트 생성
- `src/content/publish-sheet-options.js`: 글별 명시적 오버라이드 저장·복원
- `src/config-loader.js`: 전역 기본값 해석
- `src/core.js`: 최종 전략 해석 및 공통 글 생성 프롬프트 조합
- Settings service/server: 전역 설정 영속화 및 실행 중 설정 반영

