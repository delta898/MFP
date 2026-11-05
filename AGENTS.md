# Project Working Rules

## Source Directory Placement (Required)

Follow [`docs/architecture/platform-kernel-applications-plugins.md`](docs/architecture/platform-kernel-applications-plugins.md) as the single canonical source for layer ownership, product/Application grouping, Plugin completeness, and migration rules. Before creating or moving source files, trace their callers and classify each responsibility by layer; migrate callers and remove superseded code in the same verified slice. Keep this instruction brief and update the canonical architecture document when a boundary changes.

## Core Direction
- Prefer architecture and system structure over UI polish.
- Keep the system extensible. Avoid one-off shortcuts that block future provider, memory, or agent expansion.
- For agent/knowledge work, follow the `kind + transport + config` model.
- Prefer explicit capability-based control over raw config mutation.

## Application and Plugin Boundaries
- Product Applications must not call Plugin Host operations or depend on Plugin IDs/operation IDs. Route reusable cross-application features through a `src/services/<domain>/` contract, and translate service calls at `src/adapters/plugins/`; wire concrete adapters and services in `src/composition/`.
- Keep product policy/workflows in `src/applications/<product>/`. UI/API runtimes are channel/presentation boundaries and should call Application/service ports, not Plugins directly.
- Plugin Host and provider credentials/network transport remain Platform/Host concerns. Never pass provider API keys through Application or Plugin operation inputs when Host-owned transport can authenticate the request.

## Software Engineering Principles
Apply these principles to every change. The later sections define the project-specific workflow and exceptions.

1. **Understand the current path before changing it.** Find the owning module, its callers, data flow, existing shared patterns, tests, and relevant documentation. Preserve unrelated work already in the working tree.
2. **Give each rule and behavior one clear owner.** Keep business rules in the appropriate domain or capability boundary; keep UI components responsible for presentation and user interaction. Avoid implementing the same workflow independently at multiple entry points.
3. **Reuse repeated behavior through a shared contract.** When multiple screens or actions need the same behavior, define a reusable component or module and make callers provide only their context-specific inputs. Keep genuinely different behavior explicit. Do not create abstractions for hypothetical reuse alone.
4. **Keep one source of truth for shared conventions.** Repeated tokens, labels, icons, spacing, validation rules, and interaction patterns should come from shared definitions. Do not copy values into each screen and let them drift.
5. **Make boundaries and contracts explicit.** Define what a module accepts, returns, owns, and may change. Validate external or user-provided values at the boundary, and keep provider-specific details out of shared architecture.
6. **Name state ownership and lifetime.** Decide whether state belongs to a component, a screen, the current app session, or persistent storage. Keep independent workflows independent, and do not persist state unless the feature requires it.
7. **Preserve user work and valid results.** Do not silently overwrite meaningful input. Confirm destructive replacement, make cancellation leave the current state intact, and ensure request failures do not erase the last valid result.
8. **Make repeated interactions behave the same everywhere.** Route equivalent actions through the same workflow; reuse established loading, disabled, error, tooltip, spacing, and accessibility patterns. Keep the default path simple and reveal optional detail when needed.
9. **Verify the changed contract at the narrowest useful scope.** Choose focused checks that cover the changed behavior and key failure paths. Do not claim visual correctness from automated tests; leave final visual acceptance to the user when they own it. Follow the approval rule before broad suites.
10. **Keep the change reviewable and its record accurate.** Limit edits to the agreed scope, update engineering documentation when decisions or structure change, and report what changed, what was verified, and what remains. Do not commit, merge, push, or release without authorization.

## Collaboration and Approval
- The user owns product direction, UX acceptance, release approval, and final hands-on UI validation.
- The agent owns technical investigation, architecture, implementation, automated verification, and keeping engineering documents current.
- When the user asks for an opinion, diagnosis, or design discussion first, do not implement until the user explicitly approves proceeding.
- Treat short approvals such as `승인`, `고고`, or `gogo` as permission to proceed with the currently agreed scope only. They do not authorize unrelated cleanup, release, push, or deployment work.
- Do not commit, merge, delete branches, tag, push, or publish a release unless the user requests that action or included it explicitly in the current task.

## User-Defined Shortcuts
- When the user says `cmd` or `[cmd]`, interpret it as: commit the current feature work, merge the feature branch into its parent branch, then delete the successfully merged feature branch.
- When the user says `rv` or `[rv]`, interpret it as a request to review the current changes against their target branch and report actionable findings by severity and file/line. Do not modify code unless the user asks.
- Resolve the parent using the branch policy: a sub-feature merges into its parent feature branch; a standalone feature branch merges into its base/integration branch (commonly `dev`).
- Apply the normal validation and safety rules before committing or merging. Keep unrelated working-tree changes out of the feature commit, request approval where required (including the full unit suite before merging into `dev`), and do not push unless the user explicitly asks.
- Append future user-defined shortcut commands to this section, keeping each definition concise and unambiguous.
- Preserve unrelated working-tree changes. Before editing, identify pre-existing changes and do not absorb them into the current logical change without agreement.
- If a choice materially changes user-visible behavior, data ownership, compatibility, cost, or external side effects, explain the tradeoff and get agreement before proceeding.

## Efficiency and Verification
- Minimize output tokens without sacrificing correctness. Keep progress updates and final handoffs concise and focused on decisions, results, failures, remaining risks, and required user actions.
- Do not reproduce long command or test output when a summary is sufficient. Report detailed output only when it is needed to diagnose a failure.
- Run focused tests autonomously when they are proportionate to the current change.
- For a simple version-only change, apply only the exact version approved by the user, run the relevant synchronization/consistency check and `git diff --check`, then stop. Do not add broad test runs or version-management redesign to that task.
- Treat improvements to version-management tooling or workflow as a separate feature. Make its scope and verification level explicit before starting it.
- Interpret a short approval as authorization for the currently agreed change only; do not expand it to adjacent improvements.
- Before running the full unit suite or another broad regression suite, tell the user why the full run is now warranted and request explicit approval. Do not run it until approved or explicitly requested by the user.
- A required merge or release gate is not waived by the approval requirement. If approval has not been given, stop before that gate and report that full validation remains pending.
- Avoid repeatedly running a broad suite when no relevant code has changed since the last successful run.

## Concise Collaboration
- Think as deeply as the task requires, but keep user-facing explanations concise.
- Lead with the outcome, decision, or blocker; include only the reasoning needed to understand it.
- Do not narrate routine tool calls, repeat known context, or list steps that do not affect the user's decision.
- Share progress only for meaningful results, decisions, delays, or blockers.
- Run the narrowest test that provides useful confidence. Do not repeat a successful test unless relevant code or conditions changed.
- Do not add tests or checks merely to increase test count. Cover changed behavior and important regression risks.
- Run broader suites only when required by validation rules, change risk, or the user's request. Obtain approval before broad suites when required.
- Keep handoffs to the outcome, focused verification, remaining user action, and commit state.
- Prefer compact summaries over narrative handoffs. Use short labels such as `완료`, `검증`, `남은 작업`, and `미포함` instead of describing routine steps in prose.
- Include only outcomes relevant to the request; omit routine details unless they affect user action, risk, or scope.

## Product and UI Direction
- Unless the user explicitly requests work in another Blog surface, apply Blog feature and UI changes only to `블로그 Beta` (`view-blog-next`). Treat the existing `블로그` surface as out of scope by default.
- Start from the user's need and use the user's language. Do not expose internal architecture, storage, provider, or prompt concepts unless they help the user make a decision.
- Prefer the smallest UI that communicates the available choice. Remove redundant labels, status text, controls, and explanations before adding visual polish.
- Keep default paths simple and reveal detailed controls only where customization is meaningful.
- Match established component styling, typography, spacing, loading states, and interaction patterns before introducing a new pattern.
- AI-powered actions must identify the model role being used, show a clear in-progress state, prevent accidental duplicate execution, and preserve the last valid result when a new request fails unless the workflow explicitly requires clearing it.
- Preview and sample features should resemble real output, but moderate AI variation should not be treated as failure when the result remains useful.

## Agent Work
- Use the smallest capable tool, model, reasoning effort, or agent arrangement that can complete the task reliably.
- Do not delegate work merely to parallelize it. Delegate only concrete, independently reviewable work when multi-agent execution is explicitly requested or permitted by the active runtime policy.
- Keep tightly coupled or small tasks local when delegation overhead would exceed its benefit.
- Use more capable or expensive execution only when complexity, uncertainty, risk, or required quality justifies it.
- Treat Telegram as a channel adapter, not as the place where business logic should grow.
- Keep `Agent Runtime -> Capability Registry -> Memory` as the primary control path.
- Before extending behavior, check whether the change belongs in:
  - `src/host/agent/` for Host orchestration and channel-neutral request planning
  - `src/adapters/messaging/<channel>/` for channel-specific parsing and translation
  - `src/capabilities/`
  - `src/services/memory/` and `src/adapters/storage/memory/`
  - `src/services/knowledge/` and `src/adapters/knowledge/`
- Do not create or restore a `src/agent/` feature-root. Place each responsibility under its architecture layer; the Agent Runtime is Host orchestration, not a separate top-level layer.
- Preserve event-first memory design. Record facts first, derive preferences/suggestions second.

## Knowledge Provider Rules
- Do not hardcode provider names into the architecture.
- Separate:
  - `kind` (`trends`, `weather`, `news`, ...)
  - `transport` (`builtin_api`, `mcp_tool`, `internal_query`)
  - provider instance config
- UI is not the first priority for provider work. Structure and contracts come first.

## Validation Rules
- Validate domain values before preview/confirmation whenever possible.
- Prefer correction proposal + user confirmation over silently accepting invalid literals.
- Prefer learned alias/domain knowledge over large hardcoded dictionaries, but keep strict validation for risky values.

## Branch and Integration Policy
- Create feature branches only when the user asks to begin branched development.
- For a multi-stage feature, use one parent feature branch as the integration branch and a short-lived sub-feature branch for each independently reviewable stage.
- Branch each sub-feature from the current parent feature branch. After verification and user approval, merge it back into the parent and delete the merged sub-feature branch when requested.
- Treat the user's request to `parent merge` as including deletion of the successfully merged feature branch unless the user explicitly says to keep it.
- Keep the parent feature branch until the complete feature has passed its agreed validation. Merge it into `dev` only on the user's explicit instruction, then delete merged feature branches as requested.
- Create `release/vX.Y.Z` from the intended integration branch only when release preparation begins. Release branches contain stabilization, release notes, version metadata, and release-only fixes rather than unrelated feature expansion.
- Prefer fast-forward merges when branch history permits. Never rewrite shared history to force a merge.
- Before every merge or branch deletion, confirm the current branch, target branch, merge status, and working-tree state. Never discard uncommitted user work to make Git operations convenient.

## Code Review
- Before every merge, review the complete change set against its target branch, regardless of whether the target is a parent feature branch, `-main`, `dev`, `main`, or a release branch.
- A merge containing code, configuration, tests, or build/release logic requires review. A documentation-only merge may skip review; a mixed documentation and implementation change still requires it.
- A commit request by itself does not trigger code review. Review is required before the subsequent merge.
- Report actionable findings with severity and file/line references. Resolve findings or explicitly record the accepted risk before merging.
- Code review is separate from automated testing: neither one replaces the other.
- Skip review for an urgent change only when the user explicitly requests the exception.

## Feature Branch Development Records
- Every feature branch, including a parent feature branch and each independently reviewable sub-feature branch, must have its own development record under `/Users/delta898/Project/NaverAutoBlog/docs/plans/active/`.
- Create the record when the branch begins, before material implementation. Its filename must start with the branch start date in `YYYY-MM-DD-` format, followed by the normalized branch purpose (for example, `2026-08-29-runtime-credential-security-03-naver-blog-gateway-development.md`), so records sort chronologically and remain easy to associate with their branches. Write the exact branch name, start date, and base/parent branch inside the document.
- Include at least:
  - branch name, base/parent branch, and current status
  - user need, goal, scope, and explicit non-goals
  - proposed design, affected boundaries, and implementation stages
  - decisions made with the user, alternatives considered, and important tradeoffs
  - meaningful implementation progress, failures, corrections, and changes from the original plan
  - final result, automated verification, manual checks still required, and remaining risks or follow-up work
- Update the record as decisions and implementation change; do not wait until the end and reconstruct the process from memory.
- A multi-stage parent record should summarize the whole feature and link its sub-feature records. A sub-feature record should remain independently understandable and must not rely only on the parent record for its result or verification.
- Before merging a feature branch, bring its development record up to date. After a successful merge, keep the finalized record with the merged code and move it to `docs/plans/archive/` when the feature or stage is complete, unless its stable content has been promoted into canonical architecture, feature, or decision documents.
- Development records must not contain credentials, private data, raw secret values, or exploitable operational details. Avoid duplicating canonical documentation or `CHANGELOG.md`; link to them and capture the branch-specific reasoning and outcome instead.

## Verification and Handoff
- Match verification effort to risk: documentation or version-only edits need focused consistency checks; domain or prompt changes need unit/contract tests; UI behavior changes need the relevant browser/UI regression tests in addition to focused tests.
- During implementation, run the narrowest focused tests that cover the changed module or contract.
- For UI work, run focused UI contract tests while iterating and the relevant browser smoke test when the reviewable UI slice is complete.
- Browser smoke is a review-slice gate, not an every-edit loop: run it once after a user-visible flow is complete enough for hands-on review (for example a new panel, navigation path, form/action state, or async feedback flow), then rerun only when a later change can affect that exercised browser interaction, fixture/API boundary, or composed asset loading.
- During layout, copy, token, or isolated component iteration, prefer the narrowest static/contract test plus manual visual review. Do not rerun browser smoke merely for a small CSS or text adjustment when its covered interaction contract is unchanged.
- Before merging a completed sub-feature into its parent feature branch, run the relevant focused unit and contract tests; if it changes UI behavior, also run the relevant browser/UI regression test. The full unit suite is not a default sub-feature-to-parent gate.
- The full unit suite is required before merging a completed parent feature branch into `dev`, or a standalone feature branch directly into `dev`. Run it earlier when a change crosses shared configuration, Sheet contracts, publishing engines, environment boundaries, or another broad-risk boundary. During release preparation or `dev`-to-`main` integration, reuse a successful full-suite result for the same implementation when no relevant code has changed; rerun if implementation changes or another risk warrants it. Request and receive explicit user approval before starting a full suite.
- In sandboxed environments, if a test fails specifically because binding a local loopback HTTP listener returns `EPERM`, skip only the affected listener-dependent test cases for that run and rerun the rest of the full unit suite. Do not skip the whole test file or unrelated failures. Record the skipped test names and `EPERM` limitation in the verification result; run those cases separately when an environment with loopback-listener permission is available.
- If the user has chosen to perform hands-on UI acceptance before parent merge, focused and browser verification may precede that review; defer the full unit suite until the merge candidate is otherwise ready unless risk requires it sooner.
- Run the narrowest relevant automated tests during implementation, then run the agreed broader regression suite before merging a completed feature parent or preparing a release.
- The agent should verify behavior that can be automated. The user performs final visual and exploratory UI testing when they have chosen to do so; provide a concise list of flows that need manual confirmation.
- When the user states that they will perform the UI testing, stop at automated UI regression checks and hand off the manual test flows. Do not launch or operate the app for visual or exploratory acceptance unless the user explicitly asks for that assistance later.
- Do not use a successful automated test as evidence that visual layout is correct. Likewise, a user-approved UI does not replace automated regression checks for underlying behavior.
- Tests that call paid AI models, publish content, mutate remote data, or contact production services require explicit scope or approval. Prefer fixtures, mocks, read-only checks, or non-billable connection tests by default.
- A failed external dependency should not erase the last valid local state. Verify failure, retry, and fallback behavior when changing AI, provider, publishing, or network flows.
- Before handoff, report what changed, what was verified, what remains for manual testing, and whether changes are committed or still only in the working tree.

## Development Journal Suggestions
- Treat meaningful BlogGenius development work as a potential source of public learning material for the user's blog.
- Suggest reusable `주제` seeds rather than polished titles or full articles unless the user explicitly asks for them.
- Center suggestions on the user's learning journey: questions they raised, unfamiliar knowledge they acquired, alternatives discussed, decisions reached together, failed attempts, tradeoffs, and verified outcomes.
- Accumulate related lessons and suggest them together at a natural milestone instead of interrupting the work or commenting on every small change.
- Good suggestion points include completion of a substantial feature or stage, a release, an important architecture decision, or resolution of a difficult and broadly useful failure.
- Do not suggest routine copy edits, trivial fixes, repetitive Git operations, or material that has already been proposed without a meaningful new angle.
- Keep each suggestion compact: a topic statement and a short seed summary that BlogGenius can expand later. Prefer a few high-value topics over a long list.
- Exclude secrets, credentials, private user data, exploitable operational details, and unpublished information that is not appropriate for a public blog.
- Do not create or persist a full development journal automatically. Surface suggestions in the handoff when useful and let the user decide whether to develop or store them.

## Release / Development Routine
- Do not bump versions during normal feature work.
- Never choose or bump a version number autonomously. When a version change is needed, explain why and ask the user to choose the exact version first; apply only the version the user approves. This applies to app, schema, contract, and package versions.
- Decide the version only right before release, with the user's explicit choice.
- For the Amade Site Hosting Contract, keep Template, Family, and Content Model `spec_version` plus Template `compatibility.contract.version` identical. If a contract change requires a version bump, ask the user for the exact shared version before editing these fields; update and verify all four together. Family is catalog grouping only; Content Model owns data and publishing semantics, while Template owns its initial `site-data` seed. The template package's own `version` and a Content Model's `model_version` are independent and must not be inferred from the contract version.
- During release preparation, update the app version source and its lockfile metadata together. Do not bump independently versioned tools, plugins, or services unless they are explicitly part of the same release.
- Use conventional commit messages:
  - `feat: ...`
  - `fix: ...`
  - `refactor: ...`
  - `docs: ...`
  - `chore: ...`
- Keep commits logically scoped. One logical change should map to one commit when practical.
- `CHANGELOG.md` is the source of truth for user-facing release notes.
- Maintain the existing root `CHANGELOG.md`; do not create a second changelog with different casing or in another location. Create or update its version section during release preparation, after the included product scope is known.
- Write every release-note item from the user's perspective and lead with the capability or value the user receives: describe what they can now do, what became easier or clearer, and which user-visible problem was resolved.
- Include an item only when a user can observe the change or benefit from it in the released app. Do not list internal architecture, module or schema changes, refactors, migrations, test infrastructure, build/CI work, credential ownership, or Development/Production environment separation as standalone release notes.
- If internal work materially changes user-visible reliability, performance, privacy, or safety, describe only that observable outcome in user language and omit the implementation mechanism.
- Do not turn implementation stages, development records, or raw commit history into release-note bullets. Consolidate related work into a smaller number of meaningful user outcomes and omit maintenance work that has no direct release value for users.
- Before final release approval, verify version consistency, release notes, relevant automated tests, build inputs, and the final Git diff. Tagging, pushing, packaging, and publication remain separate explicit actions.
- Future `update.json` release metadata should be generated from `CHANGELOG.md`, not directly from raw commit messages.

## Documentation Rule
- `docs/` is a maintained engineering asset, not a scratchpad. Keep it in sync with code.
- Start large design work in `/Users/delta898/Project/NaverAutoBlog/docs/plans/active/`.
- Promote current, stable structure into `/Users/delta898/Project/NaverAutoBlog/docs/architecture/`.
- Record long-lived tradeoffs in `/Users/delta898/Project/NaverAutoBlog/docs/decisions/`.
- Keep `/Users/delta898/Project/NaverAutoBlog/docs/README.md` accurate when the docs structure changes.
- When major architecture decisions are made, update the relevant doc before or alongside code changes.
- A completed plan should be moved to `docs/plans/archive/` or replaced by canonical docs in `docs/architecture/` / `docs/features/`.
- Keep `docs/backlog.md` limited to current, actionable work. Remove completed or obsolete items instead of letting it become a second changelog.
- For an unreleased feature, do not add compatibility migrations by habit. If the user confirms that no persisted compatibility is required, simplify the current model; otherwise assess migration and rollback explicitly.

## Practical Rule
- Prefer stable, reviewable structure over cleverness.
- If a quick fix and a structural fix are both possible, choose the structural fix unless the user explicitly asks for a temporary patch.
