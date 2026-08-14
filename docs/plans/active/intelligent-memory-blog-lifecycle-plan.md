# Intelligent Memory: Blog Lifecycle Integration

## Status

- Phase: implemented, awaiting runtime verification
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-blog-lifecycle`

## Goal

Connect the shared activity lifecycle contract to Blog write paths without
changing their publishing, quota, Sheet, notification, or UI behavior.

## Covered Paths

- generated quick posting, including automatic and row-driven execution;
- publishing a generated quick-preview;
- local manuscript folder publishing;
- pasted Markdown publishing.

The common multi-platform function also covers Blog row and automation callers
that already use that runtime.

## Recording Boundary

`selected` is recorded after request validation and when the validated content
enters the write operation. A generation or platform failure does not erase this
fact: the user or automation still selected that subject for writing.

Terminal evidence is recorded per successful platform:

- `post_status=draft` -> `drafted`
- `post_status=publish` -> `published`
- `post_status=schedule` -> no drafted/published event

Partial success creates evidence only for successful targets. Retried operations
reuse `operationId + domain + platform + stage` as `evidence_id`, so a previously
successful target is not counted twice.

## Provenance

Each fact preserves:

- subject;
- source path such as `quick-publish`, `quick-preview`, `local_markdown`, or
  `pasted_markdown`;
- operation/entity reference;
- platform and returned post URL when available;
- retry reuse metadata.

## Failure Policy

The runtime receives the common best-effort recorder. GraphDB failures are
logged and return `null`; they never change a successful publishing response.

## Verification

- direct multi-platform draft success records one selection and one drafted fact
  per successful platform;
- partial success excludes failed platforms;
- a retry with the same operation id deduplicates lifecycle facts;
- scheduled registration creates selection evidence but no false publication;
- existing runtime behavior remains unchanged when no recorder is injected.

Full unit and release suites remain part of pre-release validation.

## Implementation Verification

- A mock two-platform draft recorded `selected` and only the successful Naver `drafted` event.
- A mock two-platform publication recorded one `selected` and two platform-specific `published` events with distinct evidence ids.
- A scheduled mock operation recorded `selected` without creating false drafted/published evidence.
- Syntax and diff checks passed without running external platforms or the deferred full unit suite.
