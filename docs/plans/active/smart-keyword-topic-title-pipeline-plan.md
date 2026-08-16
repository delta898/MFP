# Smart Keyword Topic Title Pipeline Plan

## Status

- Phase: architecture proposal
- Source systems reviewed:
  - BlogGenius `content.idea.suggest`, topic recommendation service, memory/profile/trends ranking
  - KeywordMaster `keywordmaster_core` and `keyword-research` skill
- Implementation principle: reuse KeywordMaster Core through a stable boundary; do not duplicate keyword scoring logic in BlogGenius

## Goal

BlogGenius의 글감 추천 흐름을 `키워드 -> 글감 -> 최종 제목`의 단계형 추천 파이프라인으로 확장한다.

현재 BlogGenius는 사용자 기억, 최근 글감, 네이버 트렌드 지식을 바탕으로 글감 후보를 추천한다. KeywordMaster는 네이버 검색광고 검색량, API Hub 블로그 문서수, 연관 키워드, 경쟁강도, 공략 우선순위 계산을 담당한다. 두 기능을 합쳐서 글감 후보를 검색 수요와 문서 경쟁도까지 고려해 검증하고, 최종 제목 후보까지 제안한다.

## Current Shape

### BlogGenius

- `src/content-ideas/engine.js`
  - knowledge route `content_ideas`에서 트렌드 지식을 조회
  - owner memory/profile/recent artifacts를 사용해 후보 생성
  - `topic-ranking-policy`로 후보 점수화
  - provider가 글감 title/summary/reason/keywords를 생성
- `src/recommendations/topic-candidate-generator.js`
  - request seed, trend seed, profile seed를 topic candidate로 정규화
- `src/recommendations/topic-ranking-policy.js`
  - 사용자 관심 근거, 트렌드 신선도, 수락/거절 feedback을 점수화
- `src/ui-api/services/topic-recommendations.service.js`
  - UI의 `나를 위한 글감 추천` API surface

### KeywordMaster

- `keywordmaster_core`
  - `KeywordResearchRequest`
  - `analyze_keywords`
  - Naver Search Ads, API Hub Blog Search client
  - 검색량, 블로그 문서수, 경쟁강도, 공략 우선순위, 후보 eligibility 계산
- `tools/keywordmaster-cli/scripts/naver_keyword_metrics.py`
  - CLI adapter only
- `SKILL.md`
  - 사용자 입력 해석, 제목 생성 규칙, 출력 설명 정책

## Recommended Architecture

KeywordMaster를 BlogGenius 내부에 복붙하지 않는다. 책임을 다음처럼 나눈다.

```text
BlogGenius
  Agent Runtime
    -> Capability Registry
      -> content.idea.suggest
      -> content.keyword.research
      -> content.title.suggest
    -> Content Recommendation Pipeline
      1. topic candidates
      2. keyword research enrichment
      3. topic ranking with keyword signals
      4. final title suggestions

KeywordMaster Core
  -> Naver keyword metrics
  -> related candidate expansion
  -> deterministic ranking metrics
```

BlogGenius는 orchestration, memory, UI, feedback learning을 가진다. KeywordMaster Core는 네이버 키워드 데이터와 deterministic scoring을 가진다.

## Integration Boundary

초기 구현은 Node에서 repository-local Python Core를 호출하는 adapter가 가장 현실적이다.

- 새 모듈: `src/keyword-research/keywordmaster-adapter.js`
- 책임:
  - BlogGenius input을 KeywordMaster request로 변환
  - `tools/keywordmaster-cli/scripts/naver_keyword_metrics.py` 또는 package entrypoint 실행
  - JSON 결과 parsing
  - timeout, error, missing credentials를 앱 친화적 오류로 변환
  - 결과 schema를 BlogGenius 내부 DTO로 정규화
- 장점:
  - KeywordMaster Core 변경을 한 곳에서만 관리
  - BlogGenius JS 코드에 Python scoring logic을 복제하지 않음
  - 추후 HTTP/MCP transport로 바꾸기 쉬움

장기적으로는 KeywordMaster Core를 다음 중 하나로 승격할 수 있다.

| Option | 설명 | 권장 시점 |
| --- | --- | --- |
| Repository-local Python package | `packages/keywordmaster-core`를 BlogGenius repo 안에서 관리 | 초기 연동 |
| Local HTTP sidecar | Python service를 localhost에서 띄우고 JSON API 호출 | 호출 빈도 증가, cache 필요 |
| MCP tool provider | `kind=keyword_research`, `transport=mcp_tool`로 일반화 | 외부 도구/원격 provider 확장 |
| JS port | Python Core를 JS로 재작성 | 비권장, 중복 관리 위험 |

초기에는 repository-local Python package와 bundled CLI adapter를 사용한다. JS port는 피한다.

## Capability Model

새 capability는 raw config mutation이 아니라 명시적 기능으로 노출한다.

### `content.keyword.research`

입력:

- `keywords`: 1~3개
- `subject`: 글감 또는 글의 약속
- `related_assist`: 기본 `true` for recommendation enrichment, 수동 요청은 사용자의 선택 존중
- `min_search_volume`: 기본 300
- `candidate_limit`: 기본 30

출력:

- selected keyword
- input keyword analyses
- eligible candidates
- reference candidates
- source metadata
- eligibility/reason codes

### `content.title.suggest`

입력:

- selected keyword
- subject
- optional content/instruction
- title mode: `balanced | search | discovery`
- keyword metrics context

출력:

- 최대 3개 title candidates
- role: `검색 의도형 | 상황 공감형 | 구체 범위형`
- SEO/click/tradeoff explanation
- grounding status

제목 생성은 KeywordMaster Core의 deterministic metric 결과와 BlogGenius의 chat model을 함께 사용한다. 단, 제목 규칙은 `KeywordMaster` skill references를 canonical source로 유지하거나 BlogGenius docs/config로 승격한다.

## Pipeline Proposal

### Phase 1: Manual Keyword Research API

- UI 또는 internal API에서 seed keyword와 subject를 받아 KeywordMaster 결과를 반환
- 결과를 빠른 포스팅 입력의 keywords/title 후보에 적용할 수 있게 한다
- credentials missing 시 명확한 설정 안내를 반환
- network/API 실패는 글감 저장/발행 흐름을 막지 않는다

### Phase 2: Topic Recommendation Enrichment

현재 글감 추천 후보마다 다음 enrichment를 선택적으로 수행한다.

1. candidate `topic_seed`에서 seed keyword 1~3개 추출
2. KeywordMaster Core로 keyword metrics 조회
3. eligible keyword와 opportunity score를 candidate feature로 추가
4. `topic-ranking-policy`에 keyword signals를 낮은 가중치로 반영

추가할 ranking signal 예:

- keyword_monthly_volume
- keyword_opportunity_priority
- keyword_competition_level
- keyword_eligible
- keyword_reference_only_reason

검색 지표가 사용자 관심 신호를 완전히 덮지 않도록 한다. BlogGenius의 추천 철학은 “사용자에게 맞는 글감”이고, KeywordMaster는 “검색 수요 검증”이다.

### Phase 3: Final Title Suggestions

추천 글감 카드에서 `제목 제안` action을 제공한다.

- 선택한 글감 subject
- 추천 keyword
- optional 작성 지시사항/본문 preview
- writing strategy

을 조합해 최종 제목 후보 3개를 만든다. 사용자가 하나를 선택하면 quick publish subject/title과 keywords에 반영한다.

### Phase 4: Feedback Learning

사용자가 다음 행동을 하면 memory event로 남긴다.

- keyword accepted/rejected
- title accepted/rejected
- topic saved
- generated/published

이 feedback은 기존 topic recommendation learning과 연결하되, stage를 구분한다.

- `keyword_selected`
- `title_selected`
- `topic_saved`
- `draft_generated`
- `published`

## Config and Secrets

BlogGenius config에는 provider definition만 둔다.

```json
{
  "knowledge": {
    "providers": [
      {
        "id": "naver-keyword-research",
        "kind": "keyword_research",
        "transport": "builtin_api",
        "enabled": false,
        "config": {
          "vendor": "keywordmaster_core",
          "min_search_volume": 300,
          "candidate_limit": 30
        }
      }
    ]
  }
}
```

API credentials는 config JSON에 평문으로 넣는 것을 피한다. 개발 환경은 local env file을 지원하되, 배포 앱에서는 OS 환경변수 또는 앱의 secret storage 정책을 사용한다.

필요 credentials:

- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`

## UI Placement

초기 UI는 새 화면보다 기존 블로그 빠른 포스팅 흐름 안에 붙인다.

- `나를 위한 글감 추천` 카드:
  - 추천 이유
  - 추천 키워드
  - 검색량/문서수 요약
  - `제목 제안` 버튼
  - `글감 저장` 버튼
- quick publish 입력 영역:
  - keyword research 실행 버튼
  - title candidates 선택 list
  - 선택 결과를 subject/keywords에 반영

검색량과 문서수는 보조 정보로 표시한다. 사용자가 수치를 이해하지 못해도 “추천 키워드/제목을 선택”할 수 있어야 한다.

## Non-goals

- KeywordMaster scoring logic을 JS로 복제
- 네이버 API credentials를 로그나 UI response에 노출
- 검색량만 높은 키워드가 사용자 기억 기반 추천을 압도하도록 ranking 변경
- 제목 생성에서 본문이 뒷받침하지 않는 숫자, 순위, 보장 표현 사용
- Naver Home Feed 노출 보장처럼 검증할 수 없는 주장

## Open Decisions

- packaged Electron/macOS/Windows 빌드에서 Python runtime을 어떻게 보장할지
- API 호출 cache TTL과 quota 보호 정책
- keyword research provider를 `knowledge` route로 볼지, capability service로만 둘지
- 최종 제목 후보를 Google topics sheet에 어느 필드로 저장할지

## Recommendation

1. KeywordMaster Core는 `packages/keywordmaster-core`를 source of truth로 유지한다.
2. BlogGenius에는 `keyword-research` adapter와 capability만 추가한다.
3. 글감 추천 pipeline에는 keyword metrics를 enrichment signal로 붙인다.
4. 최종 제목 생성은 별도 `content.title.suggest` capability로 분리한다.
5. 사용자의 선택/거절은 memory event로 남겨 다음 추천에 반영한다.

이 구조가 `키워드 -> 글감 -> 최종 제목`을 하나의 스마트 흐름으로 만들면서도, KeywordMaster와 BlogGenius 양쪽에 같은 로직을 두지 않는 가장 안정적인 경로다.
