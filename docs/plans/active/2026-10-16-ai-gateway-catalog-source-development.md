# AI Gateway Catalog Source Development

## Branch and status

- Branch: `codex/feat/ai-gateway-catalog-source`
- Base branch: `codex/fbr/plugin-architecture-foundation`
- Start date: 2026-10-16
- Status: Implementation complete; focused verification passed; manual Settings UI acceptance pending.

## User need and goal

The application catalog in Supabase, the bundled BlogGenius catalog, transport registry model allowlists, and AI Gateway model inventories duplicate model availability. Adding a model can require application or Plugin deployment even when the existing provider transport already supports it.

Make the Supabase AI Model Catalog the only source of model availability and metadata. The AI Gateway owns fetching, validating, caching, and serving that catalog. Settings and generation Applications obtain model choices and availability through the Gateway contract.

## Scope

- Remove selectable model inventories and model-ID allowlists from application and Gateway code where transport behavior does not require them.
- Add a Gateway-owned catalog query/refresh contract backed by the existing Supabase catalog RPC and existing local cache behavior.
- Route Settings model-list reads and runtime model resolution through the AI Gateway catalog contract.
- Keep provider protocol adapters, credentials, execution limits, and provider-specific request/response behavior in their current boundaries.
- Preserve direct/custom endpoint models as Host-configured profiles, since they are user configuration rather than catalog entries.
- Update architecture documentation and focused tests for catalog refresh, stale-cache fallback, dynamic model selection, and Settings integration.

## Explicit non-goals

- Adding a new provider or transport protocol.
- Changing Supabase catalog publishing, RPC schema, or release workflow unless the existing response lacks fields required by the agreed contract.
- Removing the local cache or requiring a live Supabase request for every Settings render or generation call.
- Changing provider capability decisions: provider responses remain authoritative for request option support.
- Committing, merging, pushing, or releasing without the corresponding explicit request.

## Proposed design boundaries

- Supabase remains the sole authority for catalogued model/provider availability and metadata.
- The Gateway catalog contract returns a normalized snapshot and status; one Gateway-owned service applies TTL refresh, in-flight request coalescing, and last-known-good fallback.
- The Host applies fetched/cache snapshots through its catalog validator and synchronous startup registry; the Gateway reads the normalized snapshot for `models.list`. This preserves startup and offline access while keeping model availability sourced only from Supabase.
- Gateway execution route metadata describes supported `kind + provider + transport` protocols, not catalogued model IDs. A catalog entry selects an existing protocol; it does not create a new adapter.
- Applications and Settings consume the Gateway-filtered catalog rather than intersecting separate application and Gateway model lists.
- Existing provider transport and Host configuration remain responsible for authentication and network execution. Catalog data cannot supply credentials or arbitrary endpoints.

## Decisions made with the user

- The user approved this feature on a separate feature branch (`go`).
- Supabase AI Model Catalog is the single source of model availability.
- BlogGenius Settings obtains available models through AI Gateway.
- Adding a model supported by an existing transport should require no app or Plugin deployment.
- New provider protocols still require implementation code; catalog changes alone cannot add a transport.
- The earlier design discussion recommended Gateway-owned caching and stale-if-error behavior to preserve the last valid catalog during a Supabase outage.

## Investigation findings

- `src/adapters/storage/ai-model-catalog/supabase-port.js` exposes Host I/O ports for the `get_ai_model_catalog` RPC and local snapshot persistence; refresh TTL/coalescing live in the Gateway service.
- `packages/plugins/core/ai-gateway/catalog-registry.js` validates Supabase records and protocol compatibility for the synchronous runtime registry. Bundled provider/model choices and model-ID allowlists have been removed. (Ownership relocation recorded 2026-10-18.)
- `packages/plugins/core/ai-gateway/support.js` describes protocol routes without model inventories.
- Shared AI Generation and Blog Writing resolve availability from the Gateway-filtered catalog. Protocol support remains Gateway-owned; the app no longer intersects model IDs.
- Settings reads the catalog through `models.list`; the Host mirror remains available for synchronous config resolution and stale-cache startup behavior.

## Implementation progress

- 2026-10-16: Created this feature branch from `codex/fbr/plugin-architecture-foundation` after confirming the parent checkout was clean. Mapped the bundled catalog, remote catalog service, Gateway support inventory, Settings API, and shared AI Generation resolution path.
- 2026-10-16: Removed model-ID allowlists from Gateway routes and the Host transport registry. Added the Gateway `models.list` operation and adapter; Settings uses it for model choices and refresh status. KIE image requests use the shared task shape for newly catalogued IDs without specialized mappings.
- 2026-10-16: Removed bundled provider/model inventories and application-side model-ID intersections. Moved refresh TTL, concurrent request coalescing, cache coordination, and stale-if-error behavior into the Gateway catalog service. The Host retains Supabase RPC and cache file I/O as injected ports and applies validated snapshots to its startup mirror.
- 2026-10-16: Added focused coverage for dynamic catalog availability, Gateway refresh/cache fallback, Settings catalog reads, and generation/resolver behavior. The first test invocation omitted `BLOGGENIUS_ENV` and failed during environment initialization; rerunning with `BLOGGENIUS_ENV=development` passed all 56 focused tests, and `git diff --check` passed.

## Verification and handoff

- Focused verification passed for Gateway/catalog, Settings AI role/catalog, Blog Writing resolver, AI generation, and model configuration (56 tests with `BLOGGENIUS_ENV=development`).
- Final diff review passed; manual Settings UI acceptance remains with the user: confirm provider/model options come from Supabase and the cached snapshot remains usable during Supabase unavailability.
- Manual Settings UI acceptance remains with the user: confirm provider/model options come from Supabase and the cached snapshot remains usable during Supabase unavailability.

## Remaining risks

- Catalog records must continue to be constrained to code-supported provider transports; removing model ID allowlists must not permit arbitrary provider names, transports, URLs, or credentials.
- Startup and offline behavior must preserve the last known valid catalog without silently treating an unavailable remote catalog as an empty catalog.
- Direct model profiles remain Host-configured and intentionally outside the Supabase catalog; generation exposes only configured direct model identities through the separate profile path.
