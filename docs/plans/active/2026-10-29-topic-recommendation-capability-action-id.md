# Topic recommendation capability action ID fix

- Branch: `fix/topic-recommendation-capability-action-id`
- Base/parent branch: `dev`
- Start date: 2026-10-29
- Status: implemented; focused verification passed

## User need and goal

The Blog Beta “글감 추천” request fails with validation errors saying `actions[0].action_id` is missing and the action refers to an unregistered capability. The UI adapter constructs an Agent action using legacy descriptive fields but omits the required capability identifier.

## Scope and non-goals

- Add the registered `content.idea.suggest` capability ID to the UI-generated action and assert the action contract in the service test.
- Keep this fix limited to the topic recommendation request path.
- Do not change capability registration, Agent action validation, UI behavior, or unrelated working-tree files.

## Design and boundaries

The UI adapter owns translation from the topic recommendation request to the shared Agent Runtime envelope. It will provide `action_id: 'content.idea.suggest'`; the Agent action schema will continue deriving canonical type/domain/name from the registered capability.

## Progress and verification

- Confirmed the capability is registered in `src/composition/capability-runtime.js` and the validator requires `action_id` in `src/host/agent/contracts/action-schema.js`.
- Confirmed the UI service currently sends `domain`, `name`, and `type` but omits `action_id`; current tests mock the runtime and do not assert the identifier.
- Added `action_id: 'content.idea.suggest'` to the UI-generated Agent action and added an assertion so the service contract cannot silently regress.
- `NODE_PATH=/Users/delta898/Project/NaverAutoBlog/node_modules node --test src/adapters/ui/blog/topic-recommendations/service.test.js src/host/agent/contracts/action-schema.test.js` passed (8 tests).
- `git diff --check` passed.

## Decisions and remaining risks

- The existing branch has unrelated uncommitted files, including an untracked `collect_range.sh` path that conflicts with `dev`. The fix is isolated in a separate worktree based on `dev` to preserve that work.
- No commit, merge, push, or release is included in the current request.
