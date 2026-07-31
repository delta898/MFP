# Remote AI Model Catalog With Trusted Local Transports

## Status

Accepted

## Context

AI providers release, rename, deprecate, and retire models more frequently than the
desktop app should need to ship. Keeping the complete model list in app code makes
routine catalog maintenance depend on a full desktop upgrade.

Letting a remote document define arbitrary HTTP calls would remove that release
dependency but would also let catalog data redirect user API keys or introduce
untested request/response behavior.

## Decision

Keep transport adapters, provider endpoints, authentication headers, and response
parsing inside the app. Store only versioned model metadata, lifecycle state, and
allowlisted capability policy in a Supabase remote catalog.

The app ships a bundled fallback, merges a validated published remote snapshot,
caches the last valid snapshot locally, and continues operating when the remote
catalog is unavailable.

Remote models are accepted only when their `kind + provider + transport` route is
present in the local transport registry. New transports still require an app
release.

## Consequences

### Positive

- Most new models can be published without a desktop upgrade.
- Model deprecation and emergency hiding can be centrally managed.
- Offline and Supabase failure modes retain a usable model list.
- API keys remain constrained to code-owned provider endpoints.
- Request differences such as sampling and image-size support are explicit
  capabilities instead of scattered provider conditionals.

### Negative

- The bundled and remote catalogs require an intentional publishing workflow.
- A provider protocol change still requires an app release.
- Operators must validate and publish versioned catalog snapshots.
- Account-specific provider availability can still differ from the product
  catalog.

## Rejected Alternatives

- Store the full catalog only in app code: safe but requires excessive releases.
- Let remote JSON define arbitrary URLs/headers: flexible but unsafe for API keys.
- Treat provider model-discovery endpoints as the product catalog: availability is
  account-specific and provider results do not encode product support policy.
- Store the catalog as one `app_runtime_configs` string: lacks clean versioning,
  lifecycle, audit, and rollback semantics.
