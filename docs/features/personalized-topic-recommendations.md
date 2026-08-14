# Personalized Topic Recommendations

## User Experience

`블로그 -> 빠른 포스팅` shows a compact `나를 위한 글감 추천` lane before
the existing input-mode switch. The original `바로 생성`, `원고 폴더`, and
`원고 붙여넣기` workflows remain unchanged below it.

Each recommendation provides:

- a short evidence label;
- title and bounded keywords;
- an expandable recommendation reason;
- `빠른 포스팅`, which fills the existing form;
- `글감 저장`, which fills the form and reuses the existing topics append;
- a dismiss action that records explicit `not_helpful` feedback.

`다른 추천` bypasses the 30-minute in-process response cache and asks the same
intelligent runtime for another grounded set. Ordinary tab changes reuse the
cache to avoid repeated AI and knowledge calls.

## Runtime Flow

```text
Quick Posting UI
  -> GET /api/v1/blog/topic-recommendations
  -> Memory Retrieval v2
  -> Agent Runtime
  -> content.idea.suggest capability
  -> candidate generation + knowledge route + ranking + content idea provider
```

The UI API does not implement a separate recommendation algorithm. It composes
the established Agent Runtime, Capability Registry, Memory Retrieval, and
recommendation learning services.

## Learning Boundary

Visibility is not recorded as user interest. The product records only explicit
or successful outcomes:

- `selected` after the user accepts a recommendation into Quick Posting;
- `saved` after the topics row is successfully created or reused;
- `drafted` or `published` after a platform confirms the corresponding result;
- `feedback` when the user explicitly dismisses a grounded recommendation.

Scheduled publication does not imply a successful publish outcome. Outcome
recording requires recommendation run and candidate identity; ungrounded ideas
remain usable but do not create candidate-specific learning evidence.

## Trend Relationship

Naver trend data can be one of the recommendation's knowledge sources. Trend
Posting remains the explicit manual discovery and filtering screen, so the
recommendation lane is intentionally not repeated there.
