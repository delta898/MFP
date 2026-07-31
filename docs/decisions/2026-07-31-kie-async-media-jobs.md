# Decision: Async Provider Jobs Use a Polling Runtime Boundary

## Status

Accepted for the KIE.ai image integration foundation.

## Context

Existing BlogGenius text and image transports return their generation result in one
HTTP request. KIE Market image APIs instead return a task ID and require a later
query for completion. Applying the existing three-attempt generation retry to that
contract can create duplicate paid jobs when the first submission succeeded but its
response was lost.

The same task lifecycle will also be needed for future video and audio providers.

## Decision

Introduce a provider-independent async job runner and provider-specific adapters.
The runner owns polling and deadlines; the adapter owns trusted endpoints,
authentication, state normalization, and result extraction.

Paid task submission is single-attempt. Once a task ID exists, retries apply only
to task queries and result downloads. The foreground polling deadline is 15
minutes and does not trigger automatic resubmission.

Persist a minimal atomic local task journal after task creation. The journal keeps
task identity and normalized state but excludes prompts and secrets.

## Consequences

- Existing synchronous transports and callers remain unchanged.
- `callWritingImage()` continues to resolve to a local file path.
- A timeout can be distinguished from provider failure.
- Duplicate-billing risk from automatic resubmission is reduced.
- Future recovery UI and non-image async transports can reuse the task lifecycle.
- Callback/webhook operation and automatic background recovery remain future work.
