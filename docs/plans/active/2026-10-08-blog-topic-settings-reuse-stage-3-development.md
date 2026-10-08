# Blog Topic Settings Reuse — Stage 3

- Branch: `codex/blog-topic-settings-reuse-stage-3`
- Base/parent branch: `codex/blog-topic-settings-reuse-main`
- Start date: 2026-10-08
- Status: Implemented; committed; merged into parent with browser regression and user UI review deferred
- Parent plan: [Blog Topic Settings Reuse](2026-10-08-blog-topic-settings-reuse-main-development.md)

## User need and goal

Separate saving an idea from entering the publishing queue. Saving a new idea must work without publishing settings. Queue entry must collect and validate a target and publishing mode before submitting.

## Scope

- Open a focused dialog from the quick-writing queue action.
- Reuse the existing single publishing-settings partial and controls; do not duplicate IDs or settings markup.
- Start a new queue-dialog session with no target and `draft` status.
- Keep queue-dialog settings separate from direct quick-publishing settings and from saved defaults.
- Preserve topic/content form values on cancel and preserve same-dialog publication edits when canceling and reopening.
- Require one supported target and a future schedule date before submission.
- Allow idea-only save with no publishing target and prevent direct-flow target/status values from being attached to a newly saved idea.
- Keep Site Hosting visible in the common target list, but disabled in this queue dialog until continuous-publishing lifecycle support exists.

## Decisions and tradeoffs

- Confirmed by the user: quick-writing and queue-item settings are independent; settings belong to each idea/queue item; new targets require explicit selection; default status is temporary save; past schedule times are rejected; existing item settings are preserved; incomplete existing queue entries remain for later attention handling; category and composition choices remain optional and are preserved per item.
- Site Hosting is present in the common publishing controls, but the continuous queue adapter currently accepts only Naver and WordPress. The user confirmed queue support should be aligned and implemented later when the queue lifecycle is extended; keep it visible but disabled here and explain why rather than silently dropping a selection.
- The dialog relocates the existing publishing partial and its result row, preserving one set of controls. It snapshots and restores direct quick-publishing controls and target-scoped session state when closed.

## Implementation progress

- Added the queue-settings modal partial and included it with the existing Blog Beta editor modals.
- Changed the quick-writing queue action to a button so it can open the settings dialog rather than immediately submit.
- Added isolated modal state, neutral defaults, future-date/target validation, duplicate-submit protection, cancel/reopen session retention, and restoration of direct publishing fields and session storage.
- New idea saves explicitly omit target/category/schedule values. Queue selections are removed from quick-flow persisted defaults.
- Site Hosting remains listed but disabled with an explanation because the queue adapter has no Site Hosting lifecycle support. The user confirmed this is an intentional current-stage boundary; revisit the control when queue storage and execution support Site Hosting.
- Focused tests and syntax checks pass; the parent development record is updated.

## Verification and handoff

- Automated checks: `node --test scripts/blog-next-quick-flow-contract.test.js` (22 passed); `node --test scripts/single-publish-target-contract.test.js scripts/ui-structure-contract.test.js` (11 passed); changed scripts pass `node --check`; `git diff --check` passes.
- Manual UI review: user performs this; do not launch the app or browser. The user deferred browser smoke verification for this commit.
- Browser follow-up: update the existing browser smoke flow, which still expects the old inline queue action, to exercise the new settings dialog; then run the focused browser regression during the user's later integrated review.
- Commit/merge: committed on the stage branch and merged into the parent at the user's explicit direction before browser regression; the user deferred that verification to a later review pass.
- Remaining risk: Site Hosting queue execution is not supported by the current continuous-publishing adapter and remains disabled in this dialog.
