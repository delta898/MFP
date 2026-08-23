# Recommendation Grounding and Provenance

## Status

Accepted and implemented during Proactive Guidance Stage 4 regression testing on 2026-08-23.

## Context

Topic recommendation UI inferred a user-facing label from raw `source_refs` and defaulted unknown
references to `내 글쓰기 기반`. A `topic_facet` could originate from a saved Naver Trend, a selected
recommendation, or a manually entered topic, so that fallback overstated the evidence. The AI text
provider also authored the displayed recommendation reason and could claim popularity or search
demand that the ranking evidence did not establish.

Generated content-idea artifacts and explicit feedback shared one recent-signal window. Enough new
recommendations could therefore evict an older `not_helpful` event before ranking, allowing the same
candidate to return. Bare profile keywords also lost their source article context, so an ambiguous
movie keyword such as `오디세이` could be rewritten as an unrelated product brand.

## Decision

1. Recommendation context carries an explicit additive `candidate_type` and `basis` contract.
2. UI labels use the explicit basis and activity stage. Unknown evidence is shown as
   `근거 확인 필요`; it is never guessed to be user writing.
3. The system-owned candidate explanation is the displayed recommendation reason. AI may edit the
   title, summary and keywords but cannot author evidence claims.
4. Topic-facet projections retain bounded source context from the latest supporting topic artifacts.
   This context is passed to the AI editor with an instruction not to change entity meaning.
5. Explicit feedback has a protected bounded lane in owner activity retrieval. The latest negative
   feedback makes the matching candidate ineligible rather than merely lowering its score.
6. Generated and feedback signals are not activity candidates. Saved, selected, drafted and
   published signals remain eligible and keep their actual stage.
7. Topic facets supported only by `auto-trends` observation are not owner-interest candidates.
   External observation remains Knowledge until a separate user action supplies owner evidence.
8. Existing stored recommendations and topic artifacts are not migrated or deleted. The corrected
   evaluation applies to new recommendation runs.

## Consequences

- A saved trend or selected topic is labeled as a saved interest, not a published writing history.
- Draft and publish evidence can be distinguished in the UI.
- A dismissed candidate stays suppressed even after many later recommendation generations.
- Ambiguous profile seeds carry the original subject/category/instruction context.
- Recommendation reasons remain auditable against candidate provenance and ranking evidence.
