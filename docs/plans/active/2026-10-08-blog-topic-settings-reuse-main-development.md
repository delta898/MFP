# Blog Topic Settings Reuse

- Branch: `codex/blog-topic-settings-reuse-main`
- Base branch: `codex/static-site-builder-main`
- Start date: 2026-10-08
- Status: Settings-instance redesign, scheduled-time validation, shared queue-readiness enforcement, and queue diagnostic UI implemented; focused verification passed; user UI acceptance pending

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
- Saved-topic and queue editing use the same settings partials, but a separately instantiated, namespaced editor form in `ui/partials/views/blog-next/editor-modal.html`. Screen actions and live values belong to the editor; the quick-writing form remains mounted and independent.
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

Keep the three settings groups as reusable partials with stable field contracts. Each screen composes those partials inside its own form instance and owns its own values, serialization context, result feedback, and action controls. Shared partials provide the controls and interaction logic, not shared live state or screen actions. Separate readiness validation by transition: saving an idea permits incomplete publishing settings; entering or remaining in the queue requires settings valid for the selected target and post status; execution performs a final readiness check.

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
- Keep stable setting keys while namespacing DOM IDs and radio names for each form instance; preserve label and ARIA references.
- Share partial markup and setting behavior, while giving each screen an independent form instance and serialization context. Never move the quick-writing form into an editor dialog.
- Keep action buttons and action state outside the settings partials; each screen composes its own action footer.
- Preserve existing quick-writing, draft-mode, and edit behavior in this stage; do not yet change queue semantics.
- Add focused partial composition and DOM contract checks.

**Exit criteria:** All three groups are independent partials; quick-writing and edit flows render those partials inside separate forms; no IDs, radio groups, values, or actions leak between instances.

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

## Stage 4 — saved-topic and queue editing

### Scope and decisions

- Reuse the topic, content, and publishing partials for saved-topic and queue-item editing, but mount them in an editor-owned form; do not move the quick-writing form or share its live values.
- Make a saved topic's `대기열로 이동` action open that item's settings in the shared editor. Incomplete publishing configuration stays in the editor with the missing publishing fields identified; do not change the row status while incomplete.
- Promote a completed saved item through the validated topic-update action so all three settings groups are persisted together with the status transition. Do not use the legacy status-only queue-add route from this UI path.
- Isolate the shared publishing controls and target-settings map while editing an item, then restore the quick-writing state when leaving the editor. Item values are populated from that item's own saved row.
- Keep Site Hosting visibly unavailable in queue-item editing because the queue lifecycle adapter still does not support it; its support is deferred to a later stage.
- Saved ideas may remain incomplete. Queue promotion requires a non-empty subject, one explicit target, a supported post status, and a future date for scheduled publication.
- Browser smoke and hands-on UI acceptance remain deferred to the later integrated review at the user's request.

### Progress

- Initially reused the existing edit form and added an item-edit publishing-state context that snapshots and restores quick-writing controls, target map, active target, disclosure state, and session storage. This was superseded by the instance redesign below because sharing the form tied the editor to quick-writing actions and state.
- Added saved-item promotion entry through the edit modal and client readiness feedback for required queue settings. Ready promotion submits all fields through `/topics/update` with `action: enqueue` rather than the status-only `/queue/add` endpoint.
- User clarified the saved-idea editor should show all three settings groups and provide `취소`, `저장`, and `대기열로 이동`. `저장` persists the edited idea then closes; `대기열로 이동` validates the settings, leaves the modal open with missing-field feedback in its lower-left message area when incomplete, and otherwise promotes the item, closes the modal, and refreshes the list. The original `원고 만들기` action is removed. Queue-item editing remains unchanged.
- User reported `원고 만들기` still appeared. Root cause: the hidden attribute was applied only to the button inside a flex-styled wrapper, whose CSS display rule kept the wrapper visible; hide the whole action wrapper and explicitly honor its hidden state in CSS. Restore that wrapper when exiting edit mode.

## Queue readiness diagnostics — implementation increment

### User-confirmed behavior

- Diagnose each ready-queue item from its own stored values; do not infer a target or posting method for legacy rows.
- Missing values should be stated plainly (for example, “발행 대상이 없습니다.”), without automatically telling the user to edit.
- Site Hosting remains visible in shared settings, but the current queue runner does not support it. Site Hosting queue execution is deferred.
- Automatic queue execution skips an item that cannot be posted and continues to the next runnable item. Manual execution of a selected incomplete item stops with its diagnostic reason. Preserve the item for later correction.

### Implementation

- Added `src/continuous-publishing/queue-readiness.js` as the shared pure diagnostic rule. It checks required subject, one supported target, an explicitly stored supported posting method, a valid future schedule time when scheduled, and the existing reference URL/writing-override constraints.
- The Topics Sheet reader keeps the legacy `postStatus` projection for existing consumers but also records whether the value existed in the Sheet/options. Queue readiness uses that provenance to distinguish a stored value from the reader's synthesized `publish` fallback.
- The continuous runner applies the shared rule while selecting automatic work, before starting manual work, and again immediately before invoking the Blog lifecycle adapter. Invalid automatic items remain in place and are skipped; selected invalid items enter `needs_attention` without mutating the Sheet.
- The content-actions runtime reuses the same rule for ready-status batch execution before license/generation work and again before changing the row to `발행 중`. Its queued execution plan comes from the stored target and posting method, with no Naver/`publish` fallback.
- The list API does not expose diagnostic flags/reasons yet. Those are reserved for the following API/UI increment; no visual warning icon or popover was added in this increment.

### Verification

- `node --test src/continuous-publishing/queue-readiness.test.js src/ui-api/services/continuous-publishing.service.test.js src/ui-runtime/content-actions-runtime.test.js` — 71 passed.
- `node --check` passed for the new diagnostic module and both modified execution modules; `git diff --check` passed.
- No browser smoke or manual UI review was performed; this increment has no user-visible UI changes.
- Saved items without an explicit status now open with the agreed temporary-save default. Saved-item promotion readiness requires an idea seed, one target, a supported status, and a future schedule date when scheduling; malformed reference URLs are identified before submission.
- Added focused contract assertions for settings isolation, promotion path, and scheduling validation.

### Verification and handoff

- Focused contract verification and syntax checks are recorded after the latest saved-idea button-flow update.
- `node --check` passed for the changed Blog Beta scripts; `git diff --check` passed.
- Browser smoke and hands-on visual acceptance are deferred to the user's later combined review.
- Stage 5 scheduled-time validation is implemented in the follow-up below. Broader API/execution contract review and UI acceptance remain part of the later combined validation.

### Settings instance redesign — current implementation

- The user clarified the intended boundary: the three settings areas are reusable modules; screen-specific action buttons, state, and flows are not part of those modules.
- `settings-instance.js` clones the three shared setting groups into the editor's own form, namespaces every cloned `id` and radio `name`, retains stable `data-blog-next-setting-key` bindings, and remaps label/ARIA references. It initializes from markup defaults rather than copying current quick-writing values.
- Shared readers and writers resolve to the active editor instance during edit, and return `null` for missing editor controls instead of falling through to quick-writing controls. The editor owns Cancel, Save, Enqueue, and its inline feedback. The original quick form and its “원고 만들기” action remain separate and are not hidden or reparented.
- Editor changes update only editor action availability and summaries. The existing publishing-state context continues to snapshot/restore the quick-writing target map/session state while an item is edited.
- The title-recommendation opener, discovery target, and provider setting interactions are delegated for the cloned instance so those controls remain functional without sharing source element IDs.
- Focused verification after this correction: the Blog Beta quick-flow, single-publish-target, and UI-structure contract tests pass (35 total); changed JavaScript passes `node --check`; `git diff --check` passes. Hands-on browser visual/interaction acceptance remains with the user; do not launch the app in this stage.

### Follow-up — required subject during queue promotion

- The user found that clearing the required `주제` field and promoting a saved idea still succeeded. Root cause: both UI and API treated keywords, instructions, or a reference URL as a sufficient idea seed, while the field is visibly marked required.
- Preserve permissive saving in the idea repository, but require a non-empty subject for queue-ready items. The editor now reports the missing subject inline and focuses it; quick queue confirmation reports the same rule; the capture validator rejects invalid promotions before any sheet update.
- Focused verification: quick-flow, topic-capture, and continuous-publishing service tests pass (75 total); relevant JavaScript syntax checks and `git diff --check` pass. User visual acceptance remains pending.

### Follow-up — queue edit actions

- In a ready queue item's editor, the shared enqueue button was dynamically relabeled `저장`, which made the footer show two Save actions.
- The shared editor's static footer contains only `취소` and `저장`. The screen-owned queue-management flow creates a separate `대기열로 이동` action only when editing a saved idea that can be promoted; no promotion button exists in the ready queue-item editor.
- The terminology change from `발행` to `포스팅` is explicitly deferred and not part of this adjustment.
- Focused verification: quick-flow contract tests, syntax check, and `git diff --check` pass. Visual acceptance remains pending.

### Follow-up — scheduled-time validation

- The capture/update API now rejects scheduled items whose requested time is missing, invalid, or at/before the current time when the item is queue-ready. Saved ideas may omit a schedule; if they carry an explicit schedule, it must still be in the future.
- A manually selected overdue queue item is left in the queue and surfaced as `needs_attention`; it is not sent to the publishing executor. Automatic selection skips overdue scheduled items and continues to the next runnable item. If all candidates are overdue, the run ends without changing those rows.
- The runner checks again before invoking the Blog lifecycle adapter. The content execution path checks after manuscript/image generation and again at the platform-post boundary, so a deadline that passes during generation does not result in a late post. The expired run reports `SCHEDULE_DATE_PAST`, preserves the ready row for correction, and does not attempt to automatically reschedule it.
- The UI already blocks selecting a past date; this change adds server and execution protection. No labels were changed, and the app was not launched for visual acceptance.
- Focused verification: topic-capture, continuous-publishing service, content-actions runtime, and publish-actions runtime tests pass (95 total); changed JavaScript passes `node --check`; `git diff --check` passes. Broader suites and user UI acceptance remain pending.

### Follow-up — live queue readiness indicators

- The ready-queue API now computes the shared readiness diagnostic for every visible queue item on read and returns only `{ ready, issues }` as `queue_readiness`. It does not persist a readiness snapshot; reasons therefore reflect current time and stored values.
- Invalid queue entries display a keyboard-operable alert marker. Activating it opens an inline, screen-reader announced reason popover; Escape closes it and returns focus to the marker. The corresponding execution action is disabled, with a second client-side guard against stale/programmatic invocation. The server execution path continues to run the same shared rule immediately before posting.
- Saved ideas remain unaffected by queue execution diagnostics. Site Hosting appears as an unsupported target reason while queue execution support is deferred.
- Focused verification: queue readiness and continuous-publishing service tests pass (55 total); the new queue-readiness UI contract passes; changed JavaScript passes syntax checks and `git diff --check` passes. Running the entire shell contract file exposed two unrelated existing failures in quick-flow/editor navigation assertions (`blog-next-cancel-edit` and `settings-next` navigation); the new readiness contract itself passes. Browser smoke and hands-on UI acceptance remain deferred to the user's later combined review.
