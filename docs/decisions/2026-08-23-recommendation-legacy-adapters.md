# Legacy Suggestion Paths Converge Through Recommendation Adapters

## Status

Accepted on 2026-08-23.

## Context

BlogGenius had two live recommendation-like paths before the canonical Recommendation contract:
generic Agent suggestions under `src/suggestions/` and the specialized topic recommendation lane.
Generic results were copied into `SuggestionNode`, where they mixed with Agent confirmation state.
Topic recommendations already retained useful candidate, ranking and outcome provenance but had no
durable canonical Recommendation identity.

Removing either path immediately would break `agent.suggestions.get`, Telegram callbacks or the
Quick Posting UI. Continuing to write new product behavior into the legacy structures would deepen
the overlap and make the future in-app Recommendation Center harder to build.

## Decision

Existing sources converge through adapters under `src/recommendations/adapters/`. Generic memory
signals become canonical Candidates and use an explicit, temporary
`legacy-suggestion-compat-v1` policy. The existing topic generator and `topic-ranking-v1` remain
specialized and are mapped into canonical Candidate, Policy and Recommendation records after topic
wording. Stable adapter identities replace timestamp ids.

Legacy response adapters preserve the externally used Agent suggestion and Quick Posting idea
shapes. Canonical materialization failure does not block those established workflows, does not
return raw errors and does not offer feedback controls for a record that was not stored.

New generic Agent results are no longer copied to `SuggestionNode`. Confirmation request and
decision materialization remains unchanged, and historic `suggest_feedback:*` callbacks continue
to read/update their original facts. No historic SuggestionNode or preference is backfilled.

Pending confirmation advice remains legacy-only and non-actionable. It points users to the existing
confirmation card instead of displaying a misleading acceptance button that only recorded feedback.

New canonical feedback uses observational `recommendation.feedback_recorded` with `helpful` or
`not_helpful`. Negative feedback then dismisses the active Recommendation; positive feedback does
not claim that an action ran. Telegram uses a bounded `rec_fb` callback while retaining the old
callback namespace for already delivered messages.

Topic selected, saved, drafted and published outcomes remain owner activity facts. They are not
translated into Recommendation action lifecycle before the capability handoff stage. Topic
feedback records both the existing activity evidence and canonical feedback when a durable
Recommendation id exists.

## Consequences

- New product recommendation writes have one lifecycle store and no longer expand SuggestionNode.
- Existing Agent, Telegram and Quick Posting consumers retain their response contracts.
- Historic feedback can influence the temporary compatibility policy without being copied.
- Actual action acceptance remains unavailable until a capability handoff can execute it safely.
- `src/suggestions/` remains a compatibility facade rather than a second recommendation domain.
- Future producers and policy can replace the compatibility adapter without another data migration.
