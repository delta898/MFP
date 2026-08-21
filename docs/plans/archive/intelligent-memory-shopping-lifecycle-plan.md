# Intelligent Memory: Shopping Lifecycle Integration

## Status

- Phase: implemented, awaiting runtime verification
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-shopping-lifecycle`

## Goal

Connect Shopping write paths to the shared owner-scoped activity contract while
preserving existing Sheet, scraping, publishing, quota, and automation behavior.

## Covered Paths

All executable Shopping paths converge on `executeShoppingRowAction`:

- single row publishing;
- batch publishing;
- automatic publishing;
- quick Shopping append-and-publish.

Quick append-only remains a `saved` artifact from its successful Sheet append
and does not create a false selection fact.

## Recording Boundary

After the target Sheet row and its required URL/instruction are validated, the
runtime records one `shopping/selected` event. Platform terminal evidence is
recorded only for confirmed success:

- `post_status=draft` -> `shopping/drafted`
- `post_status=publish` -> `shopping/published`
- `post_status=schedule` -> no drafted/published event

Partial multi-platform outcomes create terminal evidence only for successful
platforms. A retry reuses the operation/platform/stage evidence id.

## Provenance

Evidence retains product name (or URL fallback), Shopping row reference, source
path, platform, returned post URL, post status, and whether the platform result
was reused from the publish quota ledger.

Sources distinguish `shopping-row`, `shopping-batch`, `shopping-auto`, and
`shopping-quick` without making those UI/runtime names part of the graph schema.

## Failure Policy

The common best-effort recorder is dependency-injected. Memory failures are
logged but cannot turn a successful Shopping publication into a failed business
operation.

## Verification

- draft partial success records selection plus only the successful platform draft;
- publication success records one terminal event per successful platform;
- scheduled registration records selection without false publication;
- batch, auto, and quick paths forward their distinct source values;
- append-only continues to rely on the existing saved artifact.

Full unit and release suites remain part of pre-release validation.

## Implementation Verification

- A mock two-platform draft recorded `selected` and only the successful Naver `drafted` event.
- A mock two-platform publication recorded one `selected` and two platform-specific `published` events with distinct evidence ids.
- A scheduled mock operation recorded `selected` without false drafted/published evidence.
- Result URLs are retained for both Naver and WordPress when the platform returns them.
- Syntax and diff checks passed without contacting an external shop or blog platform.
