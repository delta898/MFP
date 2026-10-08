# Blog posting terminology

## Context

Blog Beta used `발행` for both the action of processing a post and the outcome of making content public. This made temporary saving and scheduled publishing sound as if they were already publicly published, and made the queue/action labels inconsistent with their actual behavior.

## Decision

- Use **포스팅** for executing a post according to its selected target and mode, including temporary save, immediate publication, and scheduled publication.
- Use **발행** for the outcome where content becomes public and visible.
- Use `포스팅` for the overall workflow and queue (for example, `포스팅 설정`, `포스팅 대기열`). Name concrete modes by their outcome: `임시 저장`, `즉시 발행`, and `예약 발행`.
- Keep existing API values, persisted status strings, DOM IDs, and established code identifiers such as `publish` unchanged. Map those internal contracts to clearer presentation copy at the UI boundary.

## Consequences

- Concrete mode labels and their action buttons use `즉시 발행` and `예약 발행`; generic progress across the overall workflow may say `포스팅 중`. Successful public publishing says `발행 완료`.
- Existing stored queue items and clients remain compatible.
- New identifiers should follow the domain meaning where practical, while legacy names are not renamed solely for consistency.
