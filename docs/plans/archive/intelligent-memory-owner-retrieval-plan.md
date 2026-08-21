# Intelligent Memory: Owner-Scoped Retrieval and Activity Signals

## Status

- Phase: implemented, awaiting review/commit
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-owner-retrieval`

## Goal

Make durable owner identity useful for later personalization by retrieving
events and artifacts by owner and translating supported evidence into a small,
explicit cross-domain activity vocabulary.

This phase does not calculate recommendation scores, call trend providers, or
add recommendation UI.

## Current Data Inventory

The isolated snapshot taken before the owner migration contains:

- 149 `content.topic.registered` events and 149 `topic` artifacts;
- 7 `shopping.item.recorded` events and 7 `shopping_item` artifacts.

The available evidence is therefore a set of topics and shopping items that were
successfully appended to their Sheets. It does not prove that the user selected,
drafted, or published them.

SNS discovery and publishing currently do not write owner activity to GraphDB.
Their activity contract is defined here, but instrumentation belongs to the next
collection phase.

## Owner Retrieval Contract

Owner retrieval is independent from actor and conversation retrieval:

- `owner_user_id` selects whose local memory is queried;
- `actor_id` remains useful for channel-specific history;
- `conversation_id` remains useful for short-term conversational context.

The store provides owner-scoped event and artifact reads. If an owner id is
omitted, the durable local owner is used. Unknown owners return an empty result;
they must not fall back to global data.

## Domain and Signal Vocabulary

Signals are grouped by `blog`, `shopping`, and `sns`. Domain separation prevents
a shopping product from being mistaken for a blog topic while allowing a later
profile/recommender to combine domains intentionally.

Signals describe evidence stages, not recommendation scores:

| Stage | Meaning | Evidence strength | Supported now |
| --- | --- | --- | --- |
| `observed` | surfaced or collected without a user action | weak | no |
| `generated` | generated or proposed by the system | weak | `content_idea` artifact |
| `saved` | durably registered in an application Sheet | medium | `topic`, `shopping_item` artifacts |
| `selected` | explicitly chosen for writing | strong | no |
| `drafted` | successfully stored as a draft | strong | no |
| `published` | successfully published | strong | no |
| `feedback` | explicit positive or negative response | explicit | no content-qualified mapping yet |

No stage may be inferred from a weaker stage. In particular, a saved topic is
not treated as selected, drafted, or published.

Signal strength remains categorical in this phase. Numeric weighting belongs to
the later preference/recommendation policy and must not be embedded in storage.

Current artifact mappings are:

- `content_idea` -> `blog / generated / weak`;
- `topic` -> `blog / saved / medium`;
- `shopping_item` -> `shopping / saved / medium`.

The future SNS collection contract is:

- RSS/external discovery -> `sns / observed / weak`;
- explicit source selection -> `sns / selected / strong`;
- successful SNS copy creation -> `sns / drafted / strong`;
- successful platform publish -> `sns / published / strong`.

## Topic Field Preservation Boundary

Successful topic registration currently preserves `subject`, `category`,
`platform`, `keywords`, `instruction`, and `source` in the event/artifact payload.
The subject is also promoted to the artifact title and category/subject appear in
its compact summary.

These values remain preserved facts. The subsequent topic-semantics phase adds
normalized keyword/category/platform facet relations while keeping the original
event payload as provenance. Instruction interpretation remains deferred.

## Summary Contract

The owner activity summary returns:

- the resolved `owner_user_id`;
- recent supported signals in reverse chronological order;
- counts by domain, stage, and evidence strength;
- optional domain filtering without treating filtered evidence as unsupported;
- counts of unsupported evidence excluded from the summary.

Each signal retains its evidence id, evidence type, timestamp, subject, source,
and compact payload so later scoring remains explainable.

## Compatibility and Safety

- No existing graph node or relationship is rewritten.
- Retrieval uses existing `OwnerOWNS_EVENT` and `OwnerOWNS_ARTIFACT` relations.
- Existing actor/conversation methods remain unchanged.
- Disabled-memory fallbacks return empty owner results with the same shape.
- Queries must never silently broaden from an unknown owner to global memory.

## Verification

Use an isolated Kuzu database to verify:

- local-owner default resolution;
- explicit owner isolation;
- unknown-owner empty results;
- event and artifact type filtering;
- topic classification as `blog / saved / medium`;
- shopping classification as `shopping / saved / medium`;
- domain filtering with separate filtered/unsupported counts;
- stable results after database reopen.

Full unit and release suites remain part of pre-release validation.

## Implementation Verification

- The migrated production snapshot returned 149 owner-scoped topic events and 149 owner-scoped topic artifacts.
- All 149 topic artifacts were classified as `blog / saved / medium`.
- All seven shopping artifacts were classified as `shopping / saved / medium`.
- The combined summary reported 156 `saved / medium` signals with zero unsupported evidence.
- Blog and shopping filters returned 149 and 7 signals respectively and reported the other domain as filtered evidence.
- An unknown owner returned an empty result and did not fall back to global memory.
- A synthetic two-owner database kept local blog/shopping saves separate from an external owner's generated blog idea.
- Reopening the synthetic database preserved the same owner-scoped result.
