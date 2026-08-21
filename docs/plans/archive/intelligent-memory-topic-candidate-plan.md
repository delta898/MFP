# Intelligent Memory: Topic Candidate Generation

## Status

- Phase: implemented
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-candidate-generation`

## Goal

Create explainable topic seeds from the current request, owner profile, and
normalized trend knowledge before introducing ranking policy or UI.

## Candidate Contract

Schema version 1 candidates contain:

- a stable id and candidate type (`request_seed`, `trend_seed`, `profile_seed`);
- the raw topic seed rather than a prematurely generated article title;
- source references to the request, knowledge provider, or topic facet;
- matched owner keyword/category facts;
- preserved trend date/change/display-order facts;
- raw evidence features and a human-readable explanation.

Candidates deliberately have no aggregate score. Ordering in this phase only
preserves explicit request, provider, and profile input order. Step 8 owns all
ranking and diversity policy.

## Duplicate Boundary

Exact normalized seeds already present in recent owner artifacts are excluded.
Semantic similarity and repeated-angle suppression are deferred to the ranking
policy, where thresholds can be versioned and explained.

## Content Idea Integration

The content idea engine builds candidates after knowledge retrieval and passes
them to its providers. The AI provider uses the bounded candidate list as
grounded input, and its non-AI fallback can also turn the same seeds into useful
ideas. Candidate generation itself does not write to GraphDB.

## Deferred

- weighted relevance and recency;
- diversity selection;
- recommendation outcome persistence;
- UI exposure.
