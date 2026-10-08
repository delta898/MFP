# Blog Topic Settings Reuse

- Branch: `codex/blog-topic-settings-reuse-main`
- Base branch: `codex/static-site-builder-main`
- Start date: 2026-10-08
- Status: Planning

## User need

The Blog Beta writing flow supports saving an idea to the saved topics list or adding a fully prepared item to the publishing queue. Publishing settings must be complete before an item can enter the queue and run automatically. Topic settings, reference/content composition, and publishing settings are used in multiple entry points and should share one implementation rather than drift through copied markup.

## Goal and scope

- Define reusable modules for topic settings, reference/content composition, and publishing settings.
- Keep the quick-writing flow's idea-save action limited to topic and writing information.
- Let the quick-writing publishing-queue action open a publishing-settings dialog, validate the required values, and enqueue only when ready.
- Make all three settings groups available when editing either saved topics or queue entries.
- Preserve a relaxed saved-topic state while requiring complete and valid publishing information for queue entry and execution.
- Establish staged implementation and focused verification before applying the pattern elsewhere.

## Explicit non-goals

- Do not change other Blog surfaces beyond Blog Beta (`view-blog-next`).
- Do not apply the reusable settings pattern to other application pages in this feature.
- Do not perform broad UI shell refactoring.
- Do not introduce a new publishing provider; reuse the existing Naver, WordPress, and Site Hosting options consistently across Blog Beta publishing surfaces.
- Do not commit, merge, push, release, or deploy without a later explicit request.

## Current-state findings

- Topic settings and reference/content settings are currently authored inline in `ui/partials/views/blog-next.html`.
- Publishing settings are a separate partial at `ui/partials/views/blog-next/publish-settings.html` and are placed in multiple draft-mode slots.
- Saved-topic and queue editing use the same Blog Beta topic form: `ui/scripts/features/blog-next/quick-queue.js` moves it into `ui/partials/views/blog-next/editor-modal.html`. The edit modal does not contain a copied form.
- Topic capture already persists publishing fields when supplied, but saved topics do not require a target. Queue capture requires one target and scheduled items require a valid schedule date.
- The queue editor currently populates the publishing fields from the stored entry. Existing entries with multiple targets are surfaced with a prompt to choose one.

## Stage 1 audit — current behavior and unresolved contract

### Data and UI path

1. `ui/partials/views/blog-next.html` owns the quick-writing form and currently contains topic and reference/content settings inline.
2. `ui/partials/views/blog-next/publish-settings.html` is included once and moved among quick-writing modes by `ui/scripts/features/blog-next/draft-execution.js` / `quick-flow-ui.js`.
3. Queue and saved-topic editing in `ui/scripts/features/blog-next/queue-management.js` fills that same form and `quick-queue.js` moves the form into `ui/partials/views/blog-next/editor-modal.html`. The edit popup is not a duplicated settings form.
4. `readBlogNextTopicPayload()` serializes all settings for both save and enqueue. `submitBlogNextTopic()` calls the same capture/update APIs with a different action.
5. `src/continuous-publishing/topic-capture.js` normalizes and writes target, per-target categories, post status, schedule date, writing strategy, image mode, and external-reference preference into the Topics row/options.

### Existing validation and gaps

| Transition | Current rule | Finding |
| --- | --- | --- |
| Save from quick writing | Requires at least one of subject, keyword, instruction, or reference URL; publishing target is optional | The UI's default settings can still be serialized, so “idea only” does not currently mean publishing fields are absent. |
| Add to queue from quick writing | Requires a target; rejects more than one; scheduled status requires a parseable date | Status normalizes to `publish` when omitted. There is no explicit confirmation that a user-selected default target/status counts as complete. |
| Edit saved/ready topic | Shared form exposes the settings; update API validates based on resulting ready status | Existing ready edits require a target; saved edits may remain incomplete. |
| Move saved topic to queue | `addSavedTopicToQueue()` currently only changes the row status | It bypasses the capture validator and can mark an incomplete/legacy item ready. This is a concrete enforcement gap. |
| Manual/automatic queue execution | Runner checks row status is ready; content action rejects multiple targets | Missing target may fall through to a legacy Naver default. Readiness is not checked once, centrally, against the complete queue contract at execution time. |

### Current field/target facts

- Blog topic capture and lifecycle adapters currently support `naver` and `wordpress`; a single target is required for queue capture. Multiple targets are rejected.
- The quick-writing publishing partial already contains a Site Hosting choice, currently disabled until a site is available. Site Hosting can save drafts or publish immediately, but does not support scheduled posts in its direct manuscript flow; the continuous topic lifecycle must honor these per-target capabilities rather than hide the target from the shared list.
- `publish`, `draft`, and `schedule` are accepted post statuses. A schedule date is required only for `schedule`; current topic validation checks parseability, not whether the date is in the future.
- Categories are optional and stored separately for Naver and WordPress. Headless execution, image mode, writing strategy, and external reference have safe defaults; whether any should block queueing is a product decision, not an existing technical requirement.
- Existing sheet rows may omit publishing options. The current sheet reader normalizes missing post status to `publish`; platforms can remain absent, allowing downstream Naver fallback behavior. Therefore absence and an explicit Naver/publish choice are not always distinguishable in legacy rows.

### Decisions confirmed with user after Stage 1

1. **Independent settings state:** Quick-writing publication settings and topic-planner/queue-item settings must remain independent. Reuse the controls and behavior as a module, but bind them to the current flow/item's own values; never carry one flow's selection into another implicitly.
2. **Shared target choices:** Keep the same publishing-target choices in quick writing, saved topics, and the queue. Store every item's selections independently; changing one item must not change another item or quick-writing settings. Site Hosting remains in the common list, with unsupported actions governed by its capabilities.
3. **Target confirmation:** A target must be user-confirmed. Do not silently select a target for a new queue item or infer one from a missing legacy value. An already stored, explicit target can be preserved when editing that same item.
4. **Post status:** Default new publishing settings to `draft` (temporary save). Keep other options selectable.
5. **Schedule date:** Reject a past date when a user creates or edits a scheduled item. At execution time, the due date being in the past is expected. If a scheduled item cannot run at its requested time, skip it rather than automatically publishing it late. Visibility and recovery controls for skipped items can be considered later.
6. **Preserve settings:** When editing or promoting an existing saved idea, preserve settings already attached to that same item unless the user changes them. This does not permit settings to bleed in from another flow/item.
7. **Incomplete existing queue items:** Keep them in the queue and preserve their data. Show a separate attention/incomplete state and block execution until corrected; the exact visual treatment can be designed later.
8. **Optional fields:** Category, writing strategy, image mode, external-reference choice, and headless preference may use defaults and do not block queue entry. Preserve user-set values on that same item.

### Remaining decisions before Stage 3 implementation

1. **New queue-item settings dialog defaults:** The dialog must not inherit another flow's values. Proposed default: no target selected, `draft`, optional fields at product defaults; preserve only edits made in that same dialog session when it is canceled and reopened.
2. **Site Hosting queue contract:** Site Hosting stays visible as a shared target. Define behavior for supported draft/immediate actions and unsupported scheduling before the queue/execution stages, based on its existing capability boundary.

**Stage 1 result:** The present implementation confirms both the reuse opportunity and a bypass: the edit popups already reuse the form, but topic/content markup is inline, and the saved-to-queue transition currently skips readiness validation. Stage 1 is ready for user review; no behavior or product code has been changed.

## Proposed design

Extract the three settings groups into reusable partials with stable field contracts, and include them from the quick-writing form that is moved between its inline host and the shared edit modal. Keep the form state and serialization in one place. Separate readiness validation by transition: saving an idea permits incomplete publishing settings; entering or remaining in the queue requires settings valid for the selected target and post status; execution performs a final readiness check.

The quick-writing queue action should collect publishing settings in a focused dialog while retaining the topic and composition settings already entered. Saved-topic and queue edit dialogs should expose all three groups through the shared form, with titles and actions reflecting the entry's current state.

## Development stages

Stages are ordered to make each transition reviewable. Keep the feature limited to Blog Beta until the user accepts the flow in the app.

### Stage 1 — Contract and transition audit

**Purpose:** Decide exactly what makes an item saveable, queue-ready, and executable before changing UI or persistence.

- Trace the topic row from `buildTopicSheetRow` through Sheet read/write, queue APIs, edit population, automatic scheduling, and runner execution.
- Inventory provider-specific target requirements and status-dependent fields (immediate publish, draft, scheduled publish), including site-hosting behavior if it is supported by this flow.
- Inspect older saved and queued rows with missing, legacy, or multiple targets; identify which values are defaults versus explicit user choices.
- Define transition contracts for `save idea`, `add to queue`, `edit saved idea`, `move saved idea to queue`, `edit queued item`, and `execute queued item`.
- Record the final required-field matrix and compatibility behavior here before implementation.

**Exit criteria:** One agreed readiness matrix; no unresolved ambiguity about when to reject, request correction, or apply a safe default. No product code changes in this stage.

### Stage 2 — Extract reusable settings UI

**Purpose:** Make the three settings groups callable from the writing form and its dialogs without duplicated markup.

- Extract topic settings, reference/content composition, and publishing settings into separate partials with documented DOM/data contracts.
- Keep stable input identifiers or introduce a small, deliberate field-binding mechanism; avoid duplicate IDs when elements move between hosts.
- Keep one authoritative set of live controls and one serialization path. The quick-writing form and edit dialog should relocate/use the same nodes rather than render parallel copies.
- Preserve existing quick-writing, draft-mode, and edit behavior in this stage; do not yet change queue semantics.
- Add focused partial composition and DOM contract checks.

**Exit criteria:** All three groups are independent partials; existing quick-writing and edit flows still use the shared controls; no duplicate settings form exists.

**Stage 2 result:** Extracted topic settings and reference/content composition into `topic-settings.html` and `content-settings.html`. Publishing settings were already an independent `publish-settings.html` partial, so they remain the single source for target/status controls. The parent form includes each partial once; field IDs, form ownership, CSS selectors, serialization, and runtime behavior remain unchanged. Queue/edit continues to relocate the same form nodes, so this stage creates reusable markup without creating a second stateful form.

### Stage 3 — Save idea versus queue entry

**Purpose:** Make the primary quick-writing actions reflect the two distinct user intents.

- Keep `글감 보관` as an idea-only save that does not require publishing settings. Persist writing/topic fields and retain any optional settings the user has already supplied only if Stage 1 confirms this is unambiguous and useful.
- Change `발행 대기열에 추가` to open a focused publishing-settings dialog, populated from the same publishing-settings module.
- On confirmation, validate the selected target and post status, then submit once. Keep the dialog open with actionable field errors on invalid input; prevent duplicate submission.
- On cancel, retain the topic and composition edits in the quick-writing form and discard no prior saved item.
- Ensure keyboard dismissal, focus return, and responsive layout follow established modal patterns.

**Exit criteria:** Idea save works without publishing setup; queue entry cannot occur until the dialog's readiness contract passes; cancel/reopen preserves the intended form state.

### Stage 4 — Saved idea and queue editing

**Purpose:** Let users finish or revise all three settings groups in the existing shared editor.

- Show topic, reference/content, and publishing settings in the edit dialog using the extracted partials.
- For saved ideas, allow incomplete publishing settings and provide an explicit action to move the item into the queue.
- For queue entries, allow publishing settings to be edited and saved only when the item remains queue-ready; invalid changes must not silently degrade it into an executable entry.
- When moving a saved idea to the queue, validate first; if incomplete, open/focus the editor and identify missing settings without changing its saved status.
- Preserve row identity, order, and current item status on failed saves or validation errors.

**Exit criteria:** Both edit surfaces expose the same settings controls; saved-to-queue promotion is correction-friendly and does not partially update on failure.

### Stage 5 — Persistence and execution readiness enforcement

**Purpose:** Make the server the authority for queue readiness, including automatic execution.

- Apply the readiness contract in capture/update APIs and re-check immediately before both manual and scheduled execution.
- Keep saved-topic capture permissive, but prevent invalid items from entering or remaining executable in the ready queue.
- Return field-specific, user-actionable errors to the UI; do not silently substitute publishing targets or dates for legacy rows.
- Define handling for already queued legacy rows that fail the new readiness check (for example, retain but mark for attention versus block in place) from Stage 1 findings; preserve data and make recovery possible.
- Add focused unit/service/API contract tests for validation, failed update preservation, queue promotion, and execution rejection/fallback.

**Exit criteria:** Every path to manual or scheduled execution is guarded by the same readiness rules; failed validation leaves the last valid row intact and recoverable.

### Stage 6 — Integrated UI regression and handoff

**Purpose:** Verify the complete user flow and prepare it for user visual acceptance.

- Run the focused service and UI contract tests for the changed modules.
- Run the relevant browser smoke flow once the full interaction is in place; repeat only if a later change affects that flow.
- Review the complete branch diff against `codex/static-site-builder-main`; resolve findings and update this record with actual decisions and results.
- Do not launch the desktop app for visual acceptance; provide concise manual flows for the user to validate.
- Do not run the full unit suite, merge, push, or release without the approvals/actions required by project rules.

**Exit criteria:** Focused automated checks pass (or remaining failures are clearly classified), diff is reviewable, development record is current, and user receives the manual acceptance checklist.

## Manual acceptance flows

1. Save an idea with only a topic; verify it appears in the saved ideas list without a publishing target.
2. Add a quick-written idea to the queue; verify the settings dialog requires the agreed fields, and cancel returns to the preserved draft.
3. Complete settings and enqueue; verify the queue item displays the right target and status.
4. Edit a saved idea, change all three settings groups, and save it without promoting it.
5. Promote an incomplete saved idea; verify missing settings are identified and the item remains saved until corrected.
6. Edit a ready queue item; verify valid changes persist and invalid changes leave its prior valid settings intact.
7. Attempt manual and scheduled execution with a legacy/incomplete queue item; verify execution is blocked with a recovery path.

## Decisions and tradeoffs

- The user asked for a dedicated feature branch and staged work, with no product code changes in the branch-creation turn.
- Reuse the existing single form and extract partials rather than copy markup into each modal. This minimizes state synchronization and ensures edits use the same field behavior.
- Keep saved ideas permissive while making the publishing queue an executable-only collection. This preserves quick capture without weakening automated publishing readiness.
- The exact fields required per target and publishing status, plus legacy-row recovery behavior, must be confirmed during Stage 1 against existing provider contracts.

## Progress

- Created this feature branch from `codex/static-site-builder-main`.
- No product code or UI behavior has been changed.
- Expanded this record into six reviewable development stages with exit criteria and user-run acceptance flows.
- Completed Stage 1 source audit and documented current validation, legacy-data ambiguity, and one queue-transition bypass.
- User confirmed independent per-flow/per-item publishing state, shared target choices, explicit target confirmation, `draft` as the new default, preserve-on-edit behavior, queue retention with attention state for incomplete records, and optionality/defaults for nonessential fields.
- User decided that missed scheduled items should be skipped, with visibility/recovery UX considered later; the shared target list must include Site Hosting, and each saved/queued item owns independent settings.
- Completed Stage 2 by extracting topic and content settings partials and adding a composition/unique-ID contract test. Focused UI contracts and `git diff --check` pass.
- Stage 3 implementation is on `codex/blog-topic-settings-reuse-stage-3`, branched from this parent. The quick queue dialog uses the existing publishing partial, starts with no target and `draft`, keeps queue-session edits separate, and restores direct quick-publishing state on cancel or completion. New idea saves submit no publishing target. Site Hosting remains visible but disabled in this dialog because the current continuous-publishing adapter does not support it; the user confirmed support should be added later alongside queue lifecycle support, so this is an intentional deferral rather than a target-list inconsistency.

## Verification and follow-up

- Branch creation and parent identity checked at start.
- Stage 1 was a source and contract audit; Stage 2 verification: `node --test scripts/blog-next-quick-flow-contract.test.js scripts/single-publish-target-contract.test.js scripts/ui-structure-contract.test.js` (32 passed) and `git diff --check`.
- Stage 3 focused verification: `node --test scripts/blog-next-quick-flow-contract.test.js` (22 passed); `node --test scripts/single-publish-target-contract.test.js scripts/ui-structure-contract.test.js` (11 passed); `node --test src/continuous-publishing/topic-capture.test.js` (10 passed); changed scripts pass `node --check`; `git diff --check` passes.
- The user deferred browser smoke verification for Stage 3 and then explicitly directed merging it into this parent before that verification. During the later integrated review, update the existing browser smoke flow (which expects the prior inline queue behavior) to cover the new settings modal and run the focused browser regression. The user handles hands-on UI review; Stage 4-6 remain.
