# Content Writing Profile Plan

> Status: implementation complete; Stages 01–09 are verified and the parent feature branch is ready for final integration
>
> Scope: one global default/custom profile with shared voice and content-kind projections for blog and shopping generation

## Goal

사용자가 BlogGenius의 AI 블로그와 쇼핑 글에 일관된 글쓰기 성향을 적용하면서, 콘텐츠 종류별 구성과 사실성 계약은 안전하게 분리할 수 있게 한다.

글쓰기 프로필은 글별 주제와 사실 자료를 대체하지 않는다. 생성 입력을 다음 네 층으로 분리한다.

1. `profile strategy`: 선택 프로필에 저장되는 검색 중심 또는 발견 중심이라는 글의 목적과 큰 흐름
2. `common voice`: 블로그와 쇼핑이 공유하는 표현 방식, 높임, 어조와 정보 밀도
3. `content-kind profile`: blog 또는 shopping에 허용된 구성과 지침
4. `post input`: 이번 글/상품의 주제, 공식 데이터, 참고/지시사항과 사실 참고 URL

## Confirmed Decisions

- 선택되는 프로필은 한 개이며 블로그와 쇼핑이 같은 공통 글쓰기 성향을 사용한다.
- 검색/발견 작성 전략은 별도 전역 설정이 아니라 선택 프로필의 사용자 선택 항목이다.
- 멀티 프로필, 카테고리별 프로필과 글별 프로필 선택은 후속 범위로 남긴다.
- 문체 참고 URL은 기존 글별 `reference_urls`와 분리한다.
- 문체 참고자료는 생성할 때마다 원문을 붙이지 않고 저장 시 스타일 특징으로 분석한다.
- 사용자에게 system prompt 원문 편집 기능을 제공하지 않는다.
- 기존 `blog_prompt.md`의 출력/안전 계약과 글쓰기 기본 취향을 분리한다.
- 제품이 versioned `기본 프로필`을 제공하고 사용자는 동일 schema의 `나만의 프로필`을 하나 만들 수 있다.
- 언제든 `기본 프로필 사용`으로 전환할 수 있으며 저장된 사용자 프로필은 삭제하지 않는다.
- 설정 위치는 기존 `설정 > 블로그`의 긴 폼에 추가하지 않고 새 최상위 `설정 > 글쓰기` 탭으로 분리한다.
- 공통 문체와 공통 표현 지침은 블로그와 쇼핑에 적용한다.
- 블로그 길이·구성·이미지 계획과 분석된 세부 구성 특징은 쇼핑에 적용하지 않는다.
- 쇼핑은 기존 상품 사실성, 출력 schema, 편집 계획과 상품/FTC/CTA 이미지 정책을 유지한다.
- 추가 지침은 `공통 표현 지침`, `블로그 추가 지침`, `쇼핑 추가 지침`으로 분리한다.
- 이미지 개수는 `글 길이에 맞게 자동`을 기본으로 하며, 원하는 사용자는 고정 개수로 바꿀 수 있다.
- 작성자 성별은 독립 선택 항목으로 만들지 않는다. 필요한 배경은 선택형 `글쓴이 배경` 입력으로 제공한다.

## Product Principles

1. 옵션 수보다 결과 차이를 설명할 수 있어야 한다.
2. 프로필은 시스템 출력 계약, 사실성 규칙과 안전 규칙을 덮어쓰지 못한다.
3. 프로필 설정용 참고 글과 사실 참고자료는 수집, 저장, 프롬프트에서 끝까지 분리한다.
4. 미리보기와 실제 생성은 동일한 프로필 정규화 및 프롬프트 조합 경로를 사용한다.
5. 글별 명시적 지시는 같은 콘텐츠 종류의 전역 지침보다 우선하지만 프로필 자체를 변경하지 않는다.
6. 참고 URL 장애가 실제 글 생성을 막지 않도록 분석 결과를 로컬에 고정한다.
7. 원문 모방보다 재사용 가능한 일반적 스타일 특징을 추출한다.
8. 프로필은 반복 가능한 취향의 경계이지 모든 글에 같은 목차를 씌우는 고정 템플릿이 아니다.
9. 선택 프로필은 content kind별 허용 capability로 투영하며 raw config 전체를 prompt에 넘기지 않는다.

## Controlled Variation

개인화 프로필을 추가해도 모든 글의 도입과 목차가 같아지면 원래 문제인 variation 부족이 남는다. 1차 버전에서는 별도 사용자 옵션을 늘리지 않고 내부 기본 동작으로 `adaptive variation`을 적용한다.

고정하는 요소:

- 표현/높임 방식
- 어조와 정보 밀도
- 목표 길이 범위
- 사용자가 명시한 금지/추가 지침
- 사실성 및 출력 계약

주제에 맞게 달라질 수 있는 요소:

- 선택한 도입 방식 안의 실제 첫 문장 패턴
- H2 제목과 세부 순서
- 사례, 비교, 체크리스트 또는 설명 비중
- 마무리 문장의 구체적인 표현
- 이미지 장면과 섹션 배치

`전개 방식: 설명형`은 고정 목차를 의미하지 않고 설명형 구조군을 의미한다. 모델은 주제, 전략과 참고자료에 맞는 구체적인 outline을 매 글 새로 구성한다. 초기 버전은 별도 모델 호출이나 과거 글 이력 추적 없이 동일 생성 prompt 안에서 이를 수행한다. 반복 감지와 최근 글 구조 회피는 후속 memory 기반 기능으로 남긴다.

## Scope

### Included

- 기존 검색/발견 작성 전략의 설정 이동
- 기존 표현 방식과 높임 방식의 프로필 통합
- 어조와 정보 밀도
- 블로그 본문 길이 프리셋
- 블로그 도입, 전개, 마무리와 소제목 밀도
- 블로그 이미지 영역 개수 자동 연동 및 고정 개수
- 공통 표현 지침
- 블로그 추가 작성 지침과 선택형 글쓴이 배경
- 쇼핑 추가 작성 지침
- 블로그 참고 텍스트와 문체 참고 URL 분석
- 즉시 설정 요약과 AI 미리보기
- 제품 기본 프로필 선택과 사용자 프로필 복원
- Naver/WordPress 일반 블로그 생성 프롬프트 반영
- 쇼핑 전용 prompt에 공통 voice와 쇼핑 추가 지침을 안전하게 투영

### Excluded

- 멀티 프로필과 글별 프로필 선택
- 카테고리, 플랫폼, 발행 계정별 프로필
- 쇼핑 길이, block 구조, CTA와 상품 이미지 정책의 사용자 편집
- 문체 참고자료의 쇼핑 자동 적용
- 사용자의 과거 발행 글을 자동 수집하는 학습
- 특정 작가 또는 블로거의 문장 복제
- system prompt 원문 편집
- 원고 폴더와 붙여넣은 완성 원고의 재작성

## Settings Information Architecture

### New top-level tab

설정 탭 순서는 다음처럼 변경한다.

`일반 | AI | 글쓰기 | 블로그 | 쇼핑커넥트 | SNS | 알림`

- `글쓰기`: 생성 결과를 결정하는 콘텐츠 설정
- `블로그`: Naver/WordPress 연결, 인증과 발행 동작
- `AI`: 텍스트/이미지 모델과 provider 설정

현재 `설정 > 블로그`의 `콘텐츠 문체`와 `글 작성 전략`은 `설정 > 글쓰기`로 이동한다. 값과 동작은 마이그레이션해 기존 사용자 선택을 보존한다.

### Section order

1. 사용할 프로필: 기본 프로필 / 내 프로필
2. 참고 글로 자동 설정
3. 작성 전략, 문체와 추가 작성 원칙을 포함한 공통 글쓰기 방식
4. 블로그 전용 글 구성
5. 콘텐츠 종류별 결과 미리보기

참고 글 분석은 최종 문체·길이·구성 값을 자동으로 채우는 선택 도구로 구분한다.

## UX Contract

### Writing strategy

기존 값을 그대로 유지하되 선택 프로필 안에 저장한다.

- 검색 중심
- 발견 중심 (피드)

전략은 사용자가 직접 선택하는 프로필 항목이다. 참고 글 분석은 전략을 추론하거나 변경하지 않는다. `기본 프로필`은 검색 중심을 사용하고 `내 프로필`은 사용자가 저장한 전략을 복원한다.

### Profile selection

- `default`: 제품이 제공하는 versioned 기본 프로필을 사용한다.
- `custom`: 사용자가 저장한 나만의 프로필을 사용한다.

두 프로필은 같은 schema를 사용하는 대등한 선택지다. 런타임은 둘을 겹쳐 적용하지 않고 선택된 프로필 하나만 사용한다. 이렇게 해야 제품 기본 프로필이 업데이트될 때 사용자 글투가 예고 없이 달라지지 않는다.

처음 `나만의 프로필 만들기`를 누르면 현재 기본 프로필을 복사해 편집을 시작하고 `based_on_default_version`을 기록한다. 이후 사용자 프로필은 완전한 snapshot으로 저장한다.

`기본 프로필 사용`은 `active_profile`만 변경하고 사용자 프로필과 분석된 참고자료를 삭제하지 않는다. 다시 나만의 프로필로 돌아오면 이전 설정을 복원할 수 있다.

참고 텍스트와 URL을 실제로 제거하는 동작은 별도의 `사용자 참고자료 삭제`로 제공하고 확인을 받는다.

### Common voice

아래 네 항목은 선택된 프로필의 `common.voice`이며 일반 블로그와 쇼핑 글에 함께 적용한다. 쇼핑에서는 전용 adapter가 표현 규칙으로만 변환하며 상품 사실이나 경험 근거로 취급하지 않는다.

#### 표현 방식

- 구어체 (`conversational`)
- 문어체 (`written`)

#### 높임 방식

- 존댓말 (`polite`)
- 평어 (`plain`)

#### 어조

- 차분한 (`calm`)
- 균형 잡힌 (`balanced`, default)
- 생동감 있는 (`vivid`)

어조는 감정 과장이나 사실 창작을 허용하지 않는다. `생동감 있는`은 문장 리듬과 구체성만 높인다.

#### 정보 밀도

- 가볍게 (`light`)
- 보통 (`balanced`, default)
- 촘촘하게 (`dense`)

정보 밀도는 목표 글자 수와 별개다. 같은 길이 안에서 설명, 근거, 비교와 팁의 비중을 조절한다.

### Blog-only narrator presence

- 최소화 (`minimal`)
- 필요할 때 (`occasional`, default)
- 적극적으로 (`present`)

화자 노출은 `channels.blog`에만 속한다. 어떤 값도 근거 없는 구매, 사용, 방문 또는 체험을 만들어내지 않는다. `present`는 제공된 글쓴이 배경이나 글별 입력에 근거가 있을 때만 1인칭을 더 적극적으로 사용한다.

### Author context instead of gender

작성자 성별을 별도 라디오 옵션으로 제공하지 않는다.

이유:

- 한국어 글의 일반적인 어조는 작성자 성별로 안정적으로 결정되지 않는다.
- 성별 선택이 고정관념에 기반한 어휘와 관심사 추론으로 이어질 수 있다.
- 글과 무관한 이미지 인물 성별에도 잘못 전파될 수 있다.
- 실제로 필요한 것은 성별 하나보다 직업, 생활 단계, 전문성 등 글쓴이의 관련 배경이다.

대신 `글쓴이 배경 (선택)` 자유 입력을 최대 300자로 제공한다.

예: `초등학생 자녀를 둔 30대 직장인이며 주말에 가족 여행을 자주 합니다.`

규칙:

- 사용자가 직접 제공한 사실만 사용한다.
- 현재 주제에 관련 있을 때만 반영한다.
- 직접 경험을 입력하지 않았다면 구매/사용/방문 경험을 창작하지 않는다.
- 참고 글 분석으로 작성자의 성별, 나이, 직업을 추론하지 않는다.
- 이미지 속 인물을 글쓴이로 간주하지 않는다.

### Length

| Preset | Target characters | H2 sections | Auto image areas |
| --- | ---: | ---: | ---: |
| 짧게 (`short`) | 900~1,200자 | 3개 | 3개 |
| 보통 (`standard`) | 1,500~1,800자 | 4~5개 | 4개 |
| 길게 (`long`) | 2,200~2,800자 | 5~6개 | 5개 |

기본값은 `standard`다. 글자 수는 한국어 본문 기준의 목표 범위이며 제목, 해시태그와 이미지 블록은 제외한다.

초기 버전에서는 임의 숫자 입력을 제공하지 않는다. 모델이 지나치게 긴 범위를 안정적으로 맞추기 어렵고, 프리셋이 미리보기와 이미지 자동 연동을 설명하기 쉽기 때문이다.

### Structure

#### 도입 방식

- 핵심부터 (`direct`)
- 공감 상황부터 (`contextual`, default)
- 장면이나 이야기부터 (`scene`)

#### 전개 방식

- 설명형 (`explanatory`, default)
- 문제 해결형 (`problem_solution`)
- 경험·리뷰형 (`experience_review`)
- 비교·선택형 (`comparison`)

`경험·리뷰형`도 실제 경험 근거가 없으면 관찰, 조건과 판단 기준 중심으로 쓴다.

#### 마무리 방식

- 핵심 요약 (`summary`)
- 개인적 판단 (`judgment`, default)
- 다음 행동 제안 (`next_step`)

#### 소제목 밀도

- 적게 (`sparse`)
- 보통 (`balanced`, default)
- 많게 (`dense`)

길이 프리셋이 기본 H2 범위를 제공하고 소제목 밀도는 그 범위 안에서 하단, 중간, 상단을 선택한다. 따라서 서로 모순되는 독립 숫자를 만들지 않는다.

### Image plan

이미지 생성 여부와 이미지 영역 계획을 분리한다.

- `channels.blog.image_plan`: 일반 블로그 본문에 몇 개의 `[[IMAGE_N ...]]` 영역과 프롬프트를 배치할지 결정한다.
- 글별 `image_options.generate`: 해당 영역에 실제 AI 이미지 파일을 생성할지 결정한다.

#### Count mode

- `auto` (default): 길이 프리셋에 따라 3/4/5개를 정확히 사용한다.
- `fixed`: 사용자가 1~6개 중 정확한 수를 선택한다.

자동 모드에서도 최종 프롬프트에는 범위가 아니라 해석된 정확한 수를 전달한다. 예를 들어 `standard`는 `이미지 블록을 정확히 4개 작성`이 된다.

글별 `image_options.count`가 명시돼 있으면 선택 profile의 blog image plan보다 우선한다. 기존 Google Sheet의 `이미지개수`도 이 경로를 사용한다.

현재 구현은 `image_options.count`를 작업 데이터에 전달하지만 공통 프롬프트가 `4~5개`로 고정돼 있어 실제 생성 개수를 강제하지 못한다. 구현 시 중앙 `resolveImagePlan`에서 값을 해석하고 프롬프트와 후속 검증이 동일한 정확한 개수를 사용하도록 수정한다.

이미지 생성이 꺼져 있으면 이미지 파일 생성만 건너뛰고 영역 프롬프트는 원고에 유지하는 현재 동작을 보존한다. UI 도움말에서 이 차이를 명시한다.

### Instruction scopes

#### Common style instruction

`common.style_instruction`은 최대 500자이며 블로그와 쇼핑에 모두 적용한다. 문장 표현만 조정하며 사실 근거로 사용하지 않는다.

예: `문단을 짧게 쓰고 전문용어는 쉬운 말로 풀어 주세요.`

#### Blog additional instruction

`channels.blog.additional_instruction`은 최대 1,000자이며 블로그의 구성과 표현을 조정한다.

예: `결론에서 장단점을 함께 정리하고 체크리스트 소제목을 하나 포함해 주세요.`

#### Shopping additional instruction

`channels.shopping.additional_instruction`은 최대 1,000자이며 모든 쇼핑 글의 판단 기준과 설명 순서를 조정한다.

예: `가격보다 배송·설치 조건을 먼저 설명하고 마지막에 적합한 사용자를 정리해 주세요.`

공통/블로그/쇼핑 지침은 해당 profile projection의 마지막에 들어가므로 같은 범위의 구조화된 선택보다 우선하지만 다음은 덮어쓰지 못한다.

- 출력 JSON 계약
- 사실성 및 허위 경험 방지
- 참고자료 비복제 규칙
- 이미지 블록 문법
- 시스템 안전 규칙

쇼핑 지침은 추가로 다음을 덮어쓰지 못한다.

- Official Product Data와 Review Data의 출처 분리
- 근거 없는 구매·사용 경험, 가격, 효능과 긴급성 금지
- 쇼핑 JSON output schema와 editorial plan의 필수 조건
- FTC/CTA 및 상품 이미지 정책

## Style Reference Design

### Source types

- `sample_text`: 문장, 문단 또는 글 전체를 사용자가 붙여넣음
- `blog_url`: 문체를 참고할 공개 블로그 URL

1차 제한:

- 참고 텍스트: 한 항목, 최대 12,000자
- 참고 URL: 1개
- URL scheme: 공개 `https`만 허용

### Separate from factual references

| Input | Ownership | Purpose | Lifetime |
| --- | --- | --- | --- |
| 문체 참고 텍스트/URL | `channels.blog` | 블로그 구성, 리듬, 어휘 성향 분석 | 다시 분석할 때까지 유지 |
| 글별 `reference_urls` | post input | 이번 글의 사실, 논지와 사례 | 해당 글 생성에만 사용 |
| 글별 참고/지시사항 | post input | 이번 글의 명시적 요구 | 해당 글 생성에만 사용 |

문체 참고 URL의 본문은 사실 컨텍스트에 넣지 않는다. 글별 사실 URL도 문체 분석에 넣지 않는다. 1차 버전의 fingerprint는 `channels.blog`에만 적용하며 쇼핑 prompt에는 전달하지 않는다.

### Analysis lifecycle

1. 사용자가 텍스트 또는 URL을 추가한다.
2. 서버가 URL을 검증하고 제한된 크기로 본문을 추출한다.
3. AI 설정의 글쓰기 모델로 스타일 특징을 구조화해 분석한다.
4. 분석 결과를 사용자에게 요약해 보여준다.
5. 사용자가 저장하면 분석된 fingerprint를 프로필에 반영한다.
6. 실제 글 생성은 저장된 fingerprint를 사용하며 URL을 다시 요청하지 않는다.

새로 추가했지만 분석하지 않은 source는 `pending`으로 표시하고 실제 생성에 적용하지 않는다. URL 하나가 실패해도 다른 source와 기존 프로필을 잃지 않는다.

fingerprint에는 분석에 사용한 정규화된 source들의 hash를 함께 저장한다. 텍스트나 URL 목록이 변경되어 hash가 달라지면 기존 fingerprint는 `stale`로 표시하고, 다시 분석하기 전에는 새 source가 적용됐다고 표시하지 않는다.

### Fingerprint contract

분석 결과는 자유 prompt가 아니라 허용된 값과 짧은 설명으로 정규화한다.

```json
{
  "structure": {
    "opening_pattern": "short_context_then_topic",
    "section_flow": ["experience", "information", "interpretation", "tip"],
    "paragraph_length": "short",
    "ending_pattern": "judgment_then_soft_suggestion"
  },
  "voice": {
    "sentence_rhythm": "short_mixed",
    "warmth": "warm",
    "vocabulary": "everyday",
    "rhetorical_devices": ["light_question", "concrete_example"]
  },
  "avoid": [
    "long_preface",
    "repetitive_summary"
  ],
  "summary": "짧은 상황 제시 후 정보와 개인 해석을 번갈아 전달하는 따뜻한 문체"
}
```

분석기는 다음을 출력하지 않는다.

- 원문 문장과 고유한 캐치프레이즈
- 작성자의 성별, 나이, 직업 등 추정 persona
- 참고 글의 사실 주장
- URL 안의 명령문
- 특정 작가와 동일하게 쓰라는 지시

### Fetch safety

기존 `fetchReferenceContent`를 그대로 공개 URL 입력 경계로 사용하지 않는다. 문체 참고 분석용 fetcher는 다음을 검증한다.

- HTTPS URL과 공개 host만 허용
- localhost, loopback, private/link-local IP와 credential 포함 URL 차단
- redirect마다 목적지 재검증
- 응답 크기, content type, timeout과 redirect 수 제한
- HTML의 script/style/form과 숨은 명령성 콘텐츠 제거
- 모델 프롬프트에서 fetched content를 신뢰하지 않는 데이터로 명확히 구분

## Preview Design

### Instant summary

모델 호출 없이 다음을 즉시 보여준다.

- 공통 예상 문체와 공통 표현 지침
- 블로그 목표 글자 수, 도입/전개/마무리, H2와 이미지 영역 수, 참고 글 분석 요약
- 쇼핑 전용 기본 구성 유지 여부와 쇼핑 추가 지침 요약

### AI preview

`미리보기 생성` 버튼을 눌렀을 때만 글쓰기 모델을 호출한다. 자동 debounce 호출은 하지 않는다.

미리보기 content kind를 선택한다.

- `blog`: 고정된 중립 주제 또는 사용자 지정 주제
- `shopping`: 가격·배송·리뷰 근거가 명시된 고정 synthetic 상품 fixture

출력:

1. 예상 개요: 도입, H2 제목과 각 역할, 마무리
2. 400~600자 샘플 본문

블로그 기본 주제는 고정된 중립 주제를 사용하고 사용자가 선택적으로 주제를 바꿀 수 있게 한다. 쇼핑은 프로필 차이 비교 중 사실 입력이 변하지 않도록 제품이 제공하는 synthetic fixture만 사용한다. 같은 입력을 유지해야 설정 전후 차이를 비교할 수 있다.

미리보기는 저장 전 draft 프로필을 받을 수 있지만, 참고 source는 성공적으로 분석된 fingerprint만 사용한다. 실제 생성과 동일한 `normalizeWritingProfile`, kind projection, strategy adapter와 해당 prompt builder를 사용하고 출력 형식만 preview contract로 바꾼다. 쇼핑 미리보기에는 blog fingerprint가 포함되지 않는다.

## Persistence Model

프로필은 `config/config.json`의 대형 major settings payload에 합치지 않고 전용 파일로 관리한다.

기본 경로:

`config/writing_profile.json`

이유:

- 참고 텍스트와 분석 결과는 일반 연결 설정보다 크고 생명주기가 다르다.
- 분석, 미리보기와 저장을 독립적으로 검증할 수 있다.
- 기본/사용자 프로필 전환과 사용자 자료 삭제를 명시적으로 분리할 수 있다.
- 향후 멀티 프로필 저장소로 확장할 때 `config.json` schema를 흔들지 않는다.

```json
{
  "schema_version": 1,
  "active_profile": "custom",
  "custom_profile": {
    "based_on_default_version": 1,
    "common": {
      "voice": {
        "writing_mode": "conversational",
        "speech_level": "polite",
        "tone": "balanced",
        "information_density": "balanced"
      },
      "style_instruction": ""
    },
    "channels": {
      "blog": {
        "narrator_presence": "occasional",
        "length": { "preset": "standard" },
        "structure": {
          "opening": "contextual",
          "development": "explanatory",
          "ending": "judgment",
          "heading_density": "balanced"
        },
        "image_plan": {
          "count_mode": "auto",
          "fixed_count": null
        },
        "author_context": "",
        "additional_instruction": "",
        "style_references": {
          "sample_text": {
            "value": "",
            "status": "empty"
          },
          "blog_urls": [],
          "fingerprint": null,
          "fingerprint_input_hash": null,
          "analyzed_at": null,
          "analyzer_version": null,
          "analyzer_model": null
        }
      },
      "shopping": {
        "mode": "product_default",
        "additional_instruction": ""
      }
    }
  },
  "updated_at": "2026-08-26T00:00:00.000Z"
}
```

파일 쓰기는 임시 파일 후 rename 방식으로 원자화한다. 파싱 실패나 지원하지 않는 값은 전체 파일을 덮어쓰지 않고 필드별 기본값으로 정규화하며 경고를 기록한다.

민감정보 파일은 아니지만 사용자의 원문과 URL이 포함되므로 로그, telemetry와 오류 응답에 원문을 싣지 않는다.

## Migration

최초 로드에서 `writing_profile.json`이 없으면 기존 설정을 읽는다.

- `content.writing_style`
- fallback `content.blog.writing_style`
- 기본값 `conversational + polite`

기존 문체가 기본 프로필과 다르면 해당 값을 보존한 사용자 프로필을 생성하고 `active_profile: custom`으로 시작한다. 값이 같으면 `active_profile: default`로 시작한다.

프로필 파일이 아직 없을 때 기존 `content.writing_strategy`와 `content.blog.writing_strategy`를 초기값으로 읽는다. 이후 저장의 단일 원천은 선택된 프로필의 `common.writing_strategy`다. 배포 전 중간 profile schema 간 마이그레이션은 지원하지 않는다.

기존 `BLOG_WRITING_MODE`, `BLOG_SPEECH_LEVEL`, `BLOG_WRITING_STRATEGY` 및 `CONTENT_*` runtime alias는 호환 기간 동안 선택 profile의 `common.voice`와 `common.writing_strategy` 값을 노출한다. 기존처럼 쇼핑도 이 공통 설정을 소비한다.

## Runtime Resolution

### Effective profile

1. `active_profile === custom`이고 사용자 프로필이 유효하면 저장된 `custom_profile`
2. `active_profile === default`이면 제품의 versioned 기본 프로필
3. 사용자 파일 누락/오류 또는 유효하지 않은 custom 선택이면 제품 기본 프로필

### Content-kind projection

선택된 raw profile을 prompt에 직접 넘기지 않는다.

- `projectWritingProfile(profile, { kind: 'blog' })`
  - `common.voice`, `common.style_instruction`, `channels.blog`만 반환
- `projectWritingProfile(profile, { kind: 'shopping' })`
  - `common.voice`, `common.style_instruction`, `channels.shopping.additional_instruction`만 반환

shopping projection은 blog length, structure, narrator, author context, image plan과 style fingerprint에 접근할 수 없다. blog projection도 shopping editorial/image policy를 소유하지 않는다.

### Effective image count

1. 글별 명시적 `image_options.count` (1~6)
2. 선택된 profile의 `channels.blog.image_plan.fixed_count` when mode is `fixed`
3. length preset 자동 mapping
4. system fallback `4`

### Per-post inputs

일반 블로그 생성 요청은 프로필을 복사하거나 수정하지 않고 다음을 조합한다.

```text
system output/safety contract
→ resolved search/discovery strategy
→ resolved common voice/style instruction
→ resolved blog channel profile
→ resolved image plan
→ post subject/title/keywords
→ post additional instructions
→ post factual reference context
```

글별 참고/지시사항은 이번 글의 문체, 구성 또는 길이에 대한 명시적인 지시가 있으면 선택 profile의 blog channel보다 우선한다. 그러나 이를 프로필에 학습하거나 저장하지 않는다.

글별 `reference_urls`는 현재처럼 사실과 논지를 위한 컨텍스트로 사용한다. 프로필 fingerprint와 섞지 않는다.

쇼핑 생성 요청은 다음을 조합한다.

```text
shopping output/factuality/safety contract
→ shopping-adapted search/discovery strategy
→ resolved common voice/style instruction
→ shopping global additional instruction
→ product-specific editorial plan and instruction
→ Official Product Data and Review Data
```

충돌 시 쇼핑 사실성·출력 계약이 항상 우선하고, 상품별 명시적 지시는 안전한 범위에서 쇼핑 전역 지침보다 우선한다.

## Default Profile and Prompt Ownership

기존 `src/config/blog_prompt.md`는 그대로 유지하거나 통째로 사용자 설정화하지 않는다. 구현 시 내용을 다음처럼 재배치한다.

- `src/config/blog_prompt_contract.md`
  - 출력 JSON, 사실성, 참고자료 비복제, 이미지 블록 문법과 안전 규칙
- `src/config/default_content_writing_profile.json`
  - 제품이 제공하는 공통 voice, 블로그 구성과 쇼핑 channel 기본 mode
- `src/config/blog_prompt_search.md`
  - 검색 중심 전략
- `src/config/blog_prompt_discovery.md`
  - 발견 중심 전략

기존 `blog_prompt.md`의 문체, `1,500~1,800자`, `4~5개 H2`, 서론/마무리와 이미지 개수 같은 기본 취향은 새 기본 프로필로 옮긴다. 계약 파일에는 특정 기본 프로필의 취향이 남지 않아야 한다.

초기 제품 기본 프로필은 현재 동작을 무리 없이 계승하되 새 schema로 명시한다.

```json
{
  "schema_version": 1,
  "profile_version": 1,
  "id": "product-default",
  "label": "기본 프로필",
  "profile": {
    "common": {
      "voice": {
        "writing_mode": "conversational",
        "speech_level": "polite",
        "tone": "balanced",
        "information_density": "balanced"
      },
      "style_instruction": ""
    },
    "channels": {
      "blog": {
        "narrator_presence": "occasional",
        "length": { "preset": "standard" },
        "structure": {
          "opening": "contextual",
          "development": "explanatory",
          "ending": "judgment",
          "heading_density": "balanced"
        },
        "image_plan": {
          "count_mode": "auto",
          "fixed_count": null
        },
        "author_context": "",
        "additional_instruction": ""
      },
      "shopping": {
        "mode": "product_default",
        "additional_instruction": ""
      }
    }
  }
}
```

기존 경로가 필요하면 한 릴리스 동안 compatibility alias로 읽을 수 있지만 새 prompt composer의 source of truth는 위 계약 파일과 선택된 프로필이다.

제품 기본 프로필 자체도 동일한 profile normalizer와 validator를 통과한다. 기본 프로필에는 `id: product-default`, 표시 이름, schema version과 profile version을 둔다. 제품 업데이트로 기본 프로필이 바뀌어도 저장된 사용자 프로필 snapshot은 자동 병합하지 않는다.

`shopping_prompt.md`의 상품 사실성, 1,400~2,000자, 5~6개 block, CTA와 image insertion 계약은 이번 profile 파일로 옮기지 않는다. 이는 쇼핑 제품 기본 구성의 code-owned contract다. profile은 허용된 공통 표현과 쇼핑 추가 지침만 투영한다.

### Immutable code-owned contract

- 순수 JSON 출력 구조
- title/keywords/hashtags/content schema
- reference non-copying and factuality
- image block syntax
- 안전 및 anti-fabrication rules

### Strategy overlay

- 검색 중심 또는 발견 중심 목적
- 제목과 도입부의 우선순위
- 큰 정보 흐름

### Selected profile

- 공통 문체, 높임, 어조, 정보 밀도와 표현 지침
- blog projection: 길이, H2, 도입/전개/마무리, 이미지 영역, 글쓴이 배경, 블로그 지침과 style fingerprint
- shopping projection: 쇼핑 추가 지침만 포함하며 blog-only field는 제외

### Post input

- 이번 글의 실제 내용과 명시적 요구
- 사실 참고 URL에서 가져온 context

## Module Boundaries

권장 소유권은 다음과 같다.

- `src/content/writing-profile.js`
  - shared schema, normalization and default/custom selection
- `src/content/writing-profile-projection.js`
  - `kind`별 허용 capability projection과 field isolation
- `src/content/writing-profile-repository.js`
  - 전용 파일 read/write와 migration
- `src/content/writing-profile-prompt.js`
  - blog projection을 제한된 prompt 규칙으로 변환
- `src/content/shopping-writing-profile-prompt.js`
  - common/shopping projection을 쇼핑 안전 규칙 아래 표현 지침으로 변환
- `src/content/image-plan.js`
  - 길이/고정/글별 override 해석과 검증
- `src/content/style-reference-analyzer.js`
  - text/URL source를 fingerprint로 분석
- `src/content/style-reference-fetcher.js`
  - 공개 URL 검증과 제한된 본문 추출
- `src/content/writing-preview.js`
  - 동일한 effective profile을 사용하는 preview contract
- `src/content/blog-prompt.js`
  - contract/strategy/selected-profile layer 조합
- `src/core.js`
  - 일반 블로그 생성 orchestration과 글별 입력 전달
- `src/shopping-manager.js`
  - shopping projection, 상품별 지시와 공식/리뷰 데이터 조합

`Core.generateContent` 안에 profile parsing, URL 분석 또는 UI별 fallback을 추가하지 않는다.

## API Shape

권장 내부 UI API:

- `GET /api/v1/settings/writing-profile`
  - 저장값, effective profile, product default와 reference status 조회
- `PUT /api/v1/settings/writing-profile`
  - draft profile 검증 및 원자적 저장
- `POST /api/v1/settings/writing-profile/references/analyze`
  - text/URL 분석 후 저장 전 fingerprint 반환
- `POST /api/v1/settings/writing-profile/preview`
  - draft profile과 분석된 fingerprint로 개요/샘플 생성
- `POST /api/v1/settings/writing-profile/use-default`
  - custom data를 보존하고 active profile만 변경
- `DELETE /api/v1/settings/writing-profile/references`
  - 확인 후 사용자 참고자료와 fingerprint 삭제

분석과 preview endpoint는 모델 호출임을 usage label에서 구분한다.

## Validation and Conflict Rules

- enum은 저장 전에 strict validation한다.
- fixed image count는 정수 1~6만 허용한다.
- common style instruction 500자, author context 300자, blog/shopping additional instruction 각각 1,000자, sample text 12,000자로 제한한다.
- 붙여넣은 글 또는 URL 하나만 저장한다.
- 사용자의 custom instruction을 system role 원문으로 취급하지 않는다.
- 참고자료 분석 실패 시 마지막 성공 fingerprint를 자동으로 덮어쓰지 않는다.
- profile save 실패 시 runtime effective profile을 변경하지 않는다.
- 미리보기 실패가 저장된 프로필이나 실제 생성 가능 상태에 영향을 주지 않는다.

## Testing Contract

### Domain tests

- 각 필드의 독립 normalization과 default fallback
- legacy style migration
- product-default/custom profile selection and fallback
- blog/shopping projection allowlist and cross-kind field isolation
- length, heading and auto image mapping
- per-post image count precedence and 1~6 validation
- post instruction precedence without profile mutation
- shopping factuality precedence over common/shopping global instructions
- fingerprint allowlist and raw phrase exclusion

### Prompt tests

- 공통 JSON 및 이미지 문법 계약 유지
- 검색/발견 중 하나만 포함
- 선택된 profile 하나만 정확히 한 번 포함
- resolved exact image count가 prompt에 포함
- factual reference와 style fingerprint가 별도 delimiter에 위치
- default profile 선택 시 custom reference와 instruction 미포함
- shopping prompt에 blog length/structure/author/image/fingerprint 미포함
- blog prompt에 shopping additional instruction 미포함

### Repository/API tests

- atomic write and corrupted file fallback
- source limit and safe URL rejection
- partial URL analysis failure
- restore preserves custom data
- reference deletion removes raw input and fingerprint
- preview uses draft but does not persist it

### UI runtime tests

- 기존 문체/전략 값 표시와 이동
- custom field 변경 시 dirty state
- pending/analyzed/failed reference state
- instant summary length/H2/image count
- default/custom profile 전환과 custom 복귀
- destructive reference deletion confirmation

### End-to-end checks

- short/standard/long 결과에 목표 길이와 정확한 이미지 블록 수 반영
- blog/shopping quick, batch and auto generation inherit the same selected profile through kind projections
- explicit Sheet image count overrides global auto/fixed count
- per-post instruction changes one post only
- Naver and WordPress use the same resolved blog projection
- shopping inherits common voice and shopping instruction without changing its output/factuality/image contract

## Branch and Delivery Plan

### Parent feature branch

- Parent: `codex/feature/content-writing-profile-main`
- Base: 작업 시작 시점의 최신 `dev`
- 현재 설계 문서 변경은 사용자가 개발 시작을 요청할 때 parent branch로 함께 가져간다.
- 모든 sub-feature branch는 갱신된 parent에서 순차적으로 분기한다.
- 각 sub-feature는 코드, 테스트와 관련 문서를 함께 완료한 뒤 사용자 요청이 있을 때만 commit하고 parent에 merge한다.
- parent는 전체 기능이 승인된 뒤에만 사용자 요청에 따라 `dev`로 merge한다.
- branch 생성, commit, merge, delete와 push는 각각 사용자가 요청했을 때 수행한다.
- 개발 중 version은 올리지 않는다.

### Stage 01 — Shared profile and projection contracts

- Work branch: `codex/feature/content-writing-profile-01-contracts`
- `common`과 `channels.blog/shopping`을 가진 profile schema, enum, 제품 기본 프로필과 normalizer를 만든다.
- `projectWritingProfile(profile, { kind })` allowlist 계약을 구현한다.
- 기존 `blog_prompt.md`를 contract와 기본 blog profile 책임으로 분해한다.
- `shopping_prompt.md`의 사실성, output, editorial/image 계약은 그대로 유지한다.
- 아직 저장소나 UI를 연결하지 않고 제품 기본 프로필로 기존 결과를 보존한다.

완료 조건:

- 제품 기본 프로필이 동일 schema validator를 통과한다.
- blog projection은 common+blog만, shopping projection은 common+shopping만 노출한다.
- blog JSON/reference/image 계약과 shopping factuality/output 계약이 profile 밖에 남는다.
- 기존 blog/shopping prompt 테스트가 회귀하지 않는다.

### Stage 02 — Custom profile persistence and settings API

- Work branch: `codex/feature/content-writing-profile-02-store-api`
- `config/writing_profile.json` repository와 atomic write를 구현한다.
- `default/custom`, full custom snapshot과 `based_on_default_version`을 저장한다.
- common style, blog channel, shopping channel을 field별 strict validation한다.
- 기존 문체 설정 migration과 `BLOG_*`/`CONTENT_*` compatibility alias를 구현한다.
- profile GET/PUT/use-default API를 추가한다.
- blog style reference 필드는 저장 가능하게 준비하되 fetch/AI 분석은 아직 실행하지 않는다.

완료 조건:

- 저장 파일 누락/손상 시 제품 기본 프로필로 안전하게 돌아간다.
- default/custom 전환이 custom과 reference data를 삭제하지 않는다.
- 기존 공통 문체를 블로그와 쇼핑이 동일하게 이어받는다.
- cross-kind field와 길이 제한이 저장 전에 검증된다.

### Stage 03 — Blog generation runtime

- Work branch: `codex/feature/content-writing-profile-03-blog-runtime`
- 선택 profile의 blog projection을 `Core.generateContent` 전에 한 번 해석한다.
- blog contract/strategy/common/blog-channel/post-input composer를 연결한다.
- common voice/style instruction과 blog 길이, 구조, 화자, 배경, 추가 지침을 적용한다.
- factual `reference_urls`와 style reference의 경계를 보존한다.
- quick, batch, auto 및 Naver/WordPress 일반 블로그 경로를 동일 resolver로 수렴한다.

완료 조건:

- default/custom 전환과 common/blog 지침이 최종 blog prompt에서 확인된다.
- 글별 참고/지시사항은 해당 글에서만 전역 blog profile보다 우선한다.
- shopping 추가 지침과 shopping config는 blog prompt에 들어가지 않는다.
- profile 값이 `Core`에서 다시 저장되거나 UI식 fallback으로 재해석되지 않는다.

### Stage 04 — Shopping profile projection

- Work branch: `codex/feature/content-writing-profile-04-shopping-runtime`
- shopping manager에 common voice/style instruction과 shopping additional instruction projection을 연결한다.
- 기존 검색/발견 전략을 shopping 전용 adapter로 유지한다.
- quick, batch, auto shopping 경로가 동일한 선택 profile을 사용하게 한다.
- 상품별 사용자 지시는 안전한 범위에서 shopping global instruction보다 우선하게 한다.
- blog length/structure/narrator/author/image/fingerprint가 shopping prompt에 들어가지 않도록 차단한다.

완료 조건:

- 공통 문체 변경이 일반 블로그와 쇼핑 모두에 일관되게 반영된다.
- common style과 shopping instruction이 상품 사실 근거로 취급되지 않는다.
- Official/Review Data 출처, 허위 경험 금지, output blocks, CTA와 상품 이미지 계약이 유지된다.
- blog-only field가 shopping prompt에 없음을 구조 테스트로 확인한다.

### Stage 05 — Exact blog image plan

- Work branch: `codex/feature/content-writing-profile-05-blog-image-plan`
- 중앙 `resolveImagePlan`을 구현한다.
- short/standard/long 자동 mapping 3/4/5와 fixed 1~6을 지원한다.
- 글별 `image_options.count`와 Google Sheet `이미지개수`가 blog profile보다 우선하게 한다.
- prompt에는 범위가 아닌 정확한 `[[IMAGE_N ...]]` 수를 전달하고 응답 count/index를 검증한다.
- 실제 이미지 생성 off와 이미지 영역 prompt 유지의 의미를 UI/API 문구와 맞춘다.
- shopping의 상품/FTC/CTA 이미지 정책에는 이 resolver를 연결하지 않는다.

완료 조건:

- blog quick, batch와 auto에서 같은 우선순위가 적용된다.
- 요청한 정확한 블로그 이미지 영역 수와 실제 block이 일치한다.
- Naver/WordPress 후속 이미지 처리에 회귀가 없다.
- shopping image insertion count와 asset policy가 변하지 않는다.

### Stage 06 — Writing settings UI

- Work branch: `codex/feature/content-writing-profile-06-settings-ui`
- 새 최상위 `설정 > 글쓰기` 탭을 추가하고 기존 문체/전략 UI를 이동한다.
- default/custom 선택과 custom 생성/편집/저장을 구현한다.
- `공통 글쓰기 성향`, `블로그 글 구성`, `쇼핑 글 구성` 영역을 분리한다.
- common style instruction, blog additional instruction, shopping additional instruction을 별도 입력으로 제공한다.
- 쇼핑 구성은 product default임을 표시하고 사실성/이미지 안전 계약을 안내한다.
- 모델 호출 없는 kind별 instant summary를 구현한다.
- blog reference 입력은 다음 stage 전까지 준비 상태로 둔다.

완료 조건:

- 기존 문체/전략 값이 새 탭에 정확히 표시된다.
- 각 지침 입력의 적용 대상이 UI 문구와 저장 schema에서 일치한다.
- 기본 프로필은 읽기 전용이며 custom은 현재 기본 snapshot에서 시작한다.
- dirty/save/error/default 복귀 상태가 명확하다.
- 사용자 UI 확인 후에만 parent merge 후보가 된다.

### Stage 07 — Blog style reference analysis

- Work branch: `codex/feature/content-writing-profile-07-blog-style-reference`
- 참고 텍스트 또는 blog URL 하나의 source lifecycle을 구현한다.
- 공개 HTTPS URL만 허용하는 safe fetcher와 redirect 재검증을 추가한다.
- 글쓰기 모델로 allowlisted blog fingerprint를 생성한다.
- input hash, pending/analyzed/stale/failed와 마지막 성공 결과 보존을 구현한다.
- 분석 요약과 source 상태를 UI에 연결한다.
- fingerprint가 blog projection에만 포함되도록 테스트한다.

완료 조건:

- private/loopback/credential URL과 비HTML/과대 응답이 차단된다.
- 원문 문장, persona 추정과 URL 내 명령이 fingerprint에 보존되지 않는다.
- 일부 source 실패가 기존 성공 profile을 깨뜨리지 않는다.
- URL은 생성 시 다시 fetch되지 않고 shopping prompt에도 들어가지 않는다.

### Stage 08 — Blog and shopping AI preview

- Work branch: `codex/feature/content-writing-profile-08-preview`
- 저장 전 draft profile을 받는 preview API를 구현한다.
- 실제 생성과 동일한 normalizer, kind projection, strategy adapter와 prompt builder를 사용한다.
- blog는 고정/사용자 주제, shopping은 고정 synthetic product fixture로 outline과 400~600자 sample을 만든다.
- 버튼 클릭 시에만 writing model을 호출하고 usage label을 kind별로 분리한다.
- preview 실패가 저장 profile이나 실제 생성 runtime에 영향을 주지 않게 한다.

완료 조건:

- instant summary와 AI preview의 kind별 적용 범위가 일치한다.
- preview가 draft를 영속화하거나 synthetic shopping facts를 실제 데이터로 저장하지 않는다.
- default/custom을 같은 blog 주제와 shopping fixture로 비교할 수 있다.
- 사용자 UI 확인 후에만 parent merge 후보가 된다.

### Stage 09 — Integration and stabilization

- Work branch: `codex/feature/content-writing-profile-09-stabilization`
- 전체 unit, structure, UI runtime과 end-to-end regression을 실행한다.
- 일반 blog quick/batch/auto/Naver/WordPress와 shopping quick/batch/auto 대표 경로를 검증한다.
- legacy config migration, 손상 fallback과 default/custom 복귀를 fixture로 재검증한다.
- prompt/token 크기, reference privacy, cross-kind leakage와 오류 로그를 점검한다.
- 구현된 현재 사실을 `docs/features/`와 필요 시 `docs/architecture/`로 승격한다.
- 완료된 active plan의 archive 시점을 사용자와 확인한다.

완료 조건:

- Testing Contract 전체가 통과한다.
- blog/shopping 계약과 글별 전략/지시 override가 회귀하지 않는다.
- 사용자 최종 UI 및 blog/shopping 실제 생성 확인을 받는다.
- parent branch가 `dev` merge 후보 상태가 된다.

### Stage 10 — UI simplification

- Work branch: `codex/feature/content-writing-profile-10-ui-simplification`
- 기본 프로필에서는 작성 전략, 표현 방식과 높임 방식만 노출하고 별도 override로 저장한다.
- 기본 프로필의 어조, 추가 작성 원칙, 참고 글, 길이, 구성과 이미지 영역은 제품 기본값을 사용하며 UI에서 숨긴다.
- 내 프로필은 기본 프로필과 분리된 완전한 snapshot으로 유지한다.
- 설정 방법 선택은 두지 않고 `참고 글로 자동 설정`을 항상 보이는 선택 도구로 제공한다.
- 참고 입력은 붙여넣은 글 하나 또는 공개 blog URL 하나만 허용한다.
- 참고 글 분석 결과로 문체, 길이, 도입, 전개와 마무리 값을 채우고 사용자가 다시 편집할 수 있게 한다.
- narrator, author context, information density, heading density와 channel별 추가 지침을 기본 UI에서 제거한다.
- 추가 작성 원칙은 blog/shopping 공통 입력 하나로 통합한다.
- 프로필 저장은 설정 상단의 단일 `저장 및 적용` lifecycle에 합친다.
- 배포 전 중간 profile schema에 대한 마이그레이션 코드는 두지 않는다.
- 작성 전략을 profile의 `common.writing_strategy`로 통합하고, 프로필 파일이 없는 기존 설치에서는 종전 전역값으로 기본 override를 초기화한다.

완료 조건:

- 기본 프로필에는 전략, 표현 방식과 높임 방식만 나타나며 나머지 세부 설정은 나타나지 않는다.
- 분석된 값과 사용자가 수정한 최종 설정이 경쟁하지 않고 하나의 profile로 생성에 적용된다.
- 길이, 구성, 이미지 영역과 글별 지시 우선순위가 유지된다.
- blog/shopping projection과 기존 저장 파일 회귀 테스트가 통과한다.

### Per-stage routine

각 stage는 동일한 순서를 따른다.

1. 최신 parent에서 sub-feature branch 생성
2. 해당 stage 범위만 구현
3. 관련 unit/structure/runtime 테스트 실행
4. 변경 파일, 테스트 결과와 남은 위험 보고
5. UI 또는 실제 모델 영향이 있으면 사용자 확인 요청
6. 사용자가 요청하면 conventional commit 생성
7. 사용자가 요청하면 sub-feature를 parent에 merge
8. merge 후 parent에서 통합 테스트 및 상태 확인
9. 다음 stage는 갱신된 parent에서 새로 분기

### Stage 11 — Per-post blog image mode

- Work branch: `codex/feature/content-writing-profile-11-image-mode`
- 설정 profile에는 추가하지 않고 개별 AI 글쓰기, 원고 선택과 원고 붙여넣기 화면의 boolean을 하나의 3상태 선택으로 바꾼다.
- `generate`, `prompt_only`, `none`을 중앙 계약으로 정의하고 기존 boolean은 API 호환 입력으로만 유지한다.
- `none`은 AI prompt에서 이미지 영역을 금지하고 사용자가 제공한 원고의 기존 이미지 prompt block도 제거한다.
- 세 개별 화면은 마지막 선택을 공유하되 batch, auto와 Google Sheet UI는 이번 단계에서 변경하지 않는다.

완료 조건:

- 세 개별 글쓰기 화면이 같은 라벨과 값을 사용한다.
- 실제 이미지 생성, prompt block 유지와 prompt block 미포함이 서로 독립적으로 동작한다.
- Naver/WordPress 공통 생성 경로와 직접 원고 경로가 같은 mode 의미를 사용한다.
- 기존 boolean 요청과 batch/auto/Sheet workflow에 회귀가 없다.

### Stage 12 — Image mode workflow convergence

- Work branch: `codex/feature/content-writing-profile-12-image-mode-workflows`
- Topics Sheet와 UI의 이미지 boolean을 `generate`, `prompt_only`, `none` 3상태로 전환한다.
- Sheet의 표시값과 `options.image_mode` canonical 값을 함께 저장하고 기존 `Yes/No`를 읽는 호환 경계를 유지한다.
- 행 편집, batch와 자동 발행 consumer가 저장된 행 mode를 그대로 사용하게 한다.
- 자동 트렌드/RSS 수집 설정에는 새 Topics 행의 초기 mode만 정하는 선택을 제공한다.

완료 조건:

- Topics 표와 편집창에서 같은 3상태를 선택하고 Sheet에 보존할 수 있다.
- batch와 자동 발행이 기존 행의 mode를 덮어쓰지 않고 실제 prompt/asset 처리에 전달한다.
- 자동 수집으로 추가된 새 행은 자동 포스팅 설정의 기본 mode를 가진다.
- 기존 `이미지 생성` 헤더와 `Yes/No`, API boolean 입력을 계속 읽을 수 있다.

## Later Extensions
- named multi profiles
- category/platform/account routing
- profile import/export
- prior published-post opt-in analysis
- shopping length/block/CTA/product-image policy customization
- automatic suggestions based on accepted drafts
