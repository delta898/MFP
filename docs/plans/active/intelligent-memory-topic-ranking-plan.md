# Intelligent Memory: Topic Ranking and Diversity

## Status

- Phase: implemented
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-ranking-diversity`

## Goal

Rank grounded topic candidates with a transparent, replaceable policy and keep
the shortlist varied before any article title is generated.

## Policy Boundary

`topic-ranking-v1` is a service policy, not stored user truth. It consumes raw
candidate evidence and emits a score breakdown. The weights can therefore be
changed or replaced without rewriting GraphDB facts.

Version 1 considers:

- an explicit current request;
- owner keyword/category evidence frequency;
- external trend freshness and direction;
- explicit helpful/not-helpful feedback.

Every non-zero contribution retains a code, points, and supporting evidence.
There is no opaque model score in this phase.

## Diversity Policy

Scoring and diversity selection are separate operations. The shortlist:

- keeps at most two ordinary candidates from the same known category;
- defers candidates over the token-similarity threshold;
- never hides an explicit current request due to diversity;
- preserves original candidate order for equal scores;
- retains deferred candidates and reasons for diagnostics.

Category-less personal interests are grouped by their own seed rather than one
global `profile` bucket. This avoids suppressing unrelated long-term interests.

## Content Idea Integration

The content idea engine passes only the ranked shortlist to providers. The AI
prompt receives the visible score breakdown and the deterministic fallback uses
the same shortlisted candidates. Neither ranking nor fetching trends creates
owner-memory evidence.

## Deferred

- recommendation outcome persistence and learning linkage (step 9);
- product exposure and interaction tracking (step 10);
- UI controls or operator-editable weights.
