# Intelligent Memory: Owner Identity Foundation

## Status

- Phase: implemented, awaiting review/commit
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-owner-identity`

## Goal

Give every local memory event and artifact a durable owner without losing the
identity of the actor that performed the work. Existing deployed Kuzu data must
be adopted seamlessly; the application must not reset or discard the database.

This phase does not implement preference extraction or topic recommendation.

## Identity Model

Three concepts remain independent:

- `owner_user_id`: whose local memory the data belongs to
- `actor_id`: which person, channel identity, or automation performed the work
- `source`: through which product path the data entered the system

The first owner id is installation-local and has the form `local:<uuid>`. It is
generated once and stored under `data/identity/owner.json`. Raw license keys,
email addresses, and HWIDs are not valid owner ids.

Future account support should map this local owner to an account identity rather
than rewrite historic event ownership.

## Graph Additions

- `OwnerNode`
- `MemoryMigrationNode`
- `OwnerHAS_ACTOR`
- `OwnerOWNS_EVENT`
- `OwnerOWNS_ARTIFACT`

`AgentUserNode` continues to represent an actor/channel identity. Existing
`actor_id` values and relationships remain intact.

## Migration Contract

Migration `002_owner_identity` is additive and idempotent:

1. create or load the durable local owner identity;
2. create the owner and migration schema if missing;
3. attach the local owner to existing actors, events, and artifacts;
4. record the completed migration only after every relationship is materialized;
5. safely repeat `MERGE` operations if a prior run stopped before completion.

The UI server startup proactively initializes the memory store, so this
migration runs even when Telegram is disabled and no GraphDB write occurs in
that session. Initialization failure is reported but does not block the UI.

No existing node or relationship is removed. A corrupt identity file must fail
closed and surface a memory warning; silently generating a different id would
orphan the previous owner's history.

## New Write Contract

- `appendEvent()` resolves an explicit `owner_user_id` when supplied.
- Local calls that omit it use the durable local owner.
- Every new event is related to its owner.
- Every materialized artifact is related to the same owner.
- Actor and source semantics remain unchanged.

## Verification

Use an isolated temporary Kuzu database to verify:

- first-run owner creation;
- stable identity across resolver instances;
- new event and artifact ownership;
- legacy event/artifact backfill;
- migration re-entry without duplicate relationships;
- owner event/artifact and orphan counts.

Full unit and release suites remain part of pre-release validation.

## Implementation Verification

- A synthetic legacy database with one event and one artifact was migrated without data loss.
- A new topic event and its materialized artifact inherited the same owner.
- Reopening the migrated database preserved the owner id and did not duplicate ownership.
- Deleting only the temporary identity file restored the same id from the single local `OwnerNode` instead of creating a new owner.
- A snapshot of the current local database adopted all 156 events and 156 artifacts with zero ownership orphans.
