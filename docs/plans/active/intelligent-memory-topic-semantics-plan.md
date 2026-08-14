# Intelligent Memory: Topic Semantics Foundation

## Status

- Phase: implemented, awaiting review/commit
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-topic-semantics`

## Goal

Materialize deterministic topic fields as graph relations so later insight and
recommendation queries do not need to parse artifact JSON. Existing payloads
remain the source facts and provenance.

This phase does not use AI to interpret instructions, calculate preferences, or
add recommendation UI.

The implementation follows the reusable foundation boundary documented in
`docs/architecture/memory-graph.md`: source facts remain authoritative, topic
facets are deterministic semantic materialization, and future recommendation or
personalization results are rebuildable projections. No service-specific score
or conclusion is persisted by this phase.

## Current Data Inventory

The isolated migrated snapshot contains 149 topic artifacts:

- 149 platform values, currently all `naver`;
- 148 comma-separated keyword values;
- 5 non-empty composite category values such as `N:여행, W:`;
- 3 non-empty instruction values.

Subject is already promoted to `ArtifactNode.title`. Keywords, categories, and
platforms only exist in compact payload JSON before this phase.

## Graph Contract

Add one generic semantic node rather than separate keyword/category/platform
tables:

```text
TopicFacetNode
  id
  kind                 keyword | category | platform
  scope                content | generic | naver | wordpress
  normalized_value
  display_value
  created_at
```

Relationship:

```text
(ArtifactNode)-[:ArtifactHAS_TOPIC_FACET]->(TopicFacetNode)
```

Owner insight follows the provenance path:

```text
OwnerNode -> ArtifactNode(topic) -> TopicFacetNode
```

No direct Owner-to-facet relationship is stored because it would duplicate
derived state and weaken explainability.

`DomainKnowledgeNode` is not reused: it represents learned aliases/canonical
knowledge, while a topic facet represents a fact explicitly supplied in a topic.

## Normalization Contract

- Apply Unicode NFKC normalization.
- Trim and collapse whitespace.
- Lowercase only the normalized lookup value; retain a compact display value.
- Split keyword and platform lists on comma, semicolon, or newline.
- Deduplicate repeated facets within one artifact.
- Parse `N:<value>, W:<value>` category fields into `naver` and `wordpress`
  scopes; non-composite categories use `generic` scope.
- Empty values do not create nodes or relationships.
- Facet ids are deterministic hashes of `kind + scope + normalized_value`.

Subject remains the artifact title. Instruction remains in the original payload;
extracting audience, tone, intent, format, or constraints requires a later
derived-insight phase with explicit confidence and provenance.

## Migration Contract

Migration `003_topic_semantics` is additive and idempotent:

1. create `TopicFacetNode` and `ArtifactHAS_TOPIC_FACET` if missing;
2. read every existing `topic` artifact payload;
3. deterministically upsert facets and relationships;
4. record completion only after all topic artifacts are processed;
5. safely repeat all `MERGE` operations after interruption.

No existing node, relationship, or payload is removed or rewritten. New topic
writes materialize the same facets immediately after their artifact is created.

## Retrieval Contract

Owner-scoped facet retrieval returns:

- facet kind, scope, normalized value, and display value;
- number of owned topic artifacts providing the facet;
- most recent supporting artifact timestamp;
- optional exact kind/scope filters;
- deterministic ordering by evidence count, recency, and value.

Unknown owners return an empty list and must not fall back to global data.

## Verification

Use isolated Kuzu databases to verify:

- normalization and composite-category parsing;
- existing topic backfill without payload mutation;
- idempotent migration and stable relationship counts after reopen;
- immediate facets for a new topic write;
- two-owner facet isolation;
- unknown-owner empty results;
- exact kind/scope filtering.

Full unit and release suites remain part of pre-release validation.

## Implementation Verification

- Pure normalization preserved the first display value while deduplicating equivalent normalized keyword values.
- An interrupted first migration run was safely resumed because completion had not been recorded.
- The migrated production snapshot processed 149 topic artifacts into 151 distinct facets and 302 artifact-facet relationships.
- The 302 backfilled relationships consist of 149 platform, 148 keyword, and 5 category relationships.
- Owner retrieval returned Naver category evidence for `여행` (3) and `디지털` (2), and an unknown owner returned no facets.
- A new external-owner topic immediately created six deduplicated facets across keyword, category, and platform kinds.
- The external owner's facets did not appear in the local owner's results.
- Reopening the synthetic database preserved the same 308 total relationships without duplication.
