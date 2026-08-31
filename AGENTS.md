# Project Working Rules

## Core Direction
- Prefer architecture and system structure over UI polish.
- Keep the system extensible. Avoid one-off shortcuts that block future provider, memory, or agent expansion.
- For agent/knowledge work, follow the `kind + transport + config` model.
- Prefer explicit capability-based control over raw config mutation.

## Collaboration and Approval
- The user owns product direction, UX acceptance, release approval, and final hands-on UI validation.
- The agent owns technical investigation, architecture, implementation, automated verification, and keeping engineering documents current.
- When the user asks for an opinion, diagnosis, or design discussion first, do not implement until the user explicitly approves proceeding.
- Treat short approvals such as `승인`, `고고`, or `gogo` as permission to proceed with the currently agreed scope only. They do not authorize unrelated cleanup, release, push, or deployment work.
- Do not commit, merge, delete branches, tag, push, or publish a release unless the user requests that action or included it explicitly in the current task.
- Preserve unrelated working-tree changes. Before editing, identify pre-existing changes and do not absorb them into the current logical change without agreement.
- If a choice materially changes user-visible behavior, data ownership, compatibility, cost, or external side effects, explain the tradeoff and get agreement before proceeding.

## Product and UI Direction
- Start from the user's need and use the user's language. Do not expose internal architecture, storage, provider, or prompt concepts unless they help the user make a decision.
- Prefer the smallest UI that communicates the available choice. Remove redundant labels, status text, controls, and explanations before adding visual polish.
- Keep default paths simple and reveal detailed controls only where customization is meaningful.
- Match established component styling, typography, spacing, loading states, and interaction patterns before introducing a new pattern.
- AI-powered actions must identify the model role being used, show a clear in-progress state, prevent accidental duplicate execution, and preserve the last valid result when a new request fails unless the workflow explicitly requires clearing it.
- Preview and sample features should resemble real output, but moderate AI variation should not be treated as failure when the result remains useful.

## Agent Work
- Treat Telegram as a channel adapter, not as the place where business logic should grow.
- Keep `Agent Runtime -> Capability Registry -> Memory` as the primary control path.
- Before extending behavior, check whether the change belongs in:
  - `src/agent/`
  - `src/capabilities/`
  - `src/memory/`
  - `src/knowledge/`
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
- During implementation, run the narrowest focused tests that cover the changed module or contract. Do not repeatedly run the full unit suite after small UI, copy, style, or locally bounded edits.
- For UI work, run focused UI contract tests while iterating and the relevant browser smoke test when the reviewable UI slice is complete.
- Run the full unit suite before merging a completed sub-feature into its parent, before merging a completed parent feature into `dev`, during release preparation, or earlier only when a change crosses shared configuration, Sheet contracts, publishing engines, environment boundaries, or another broad-risk boundary.
- If the user has chosen to perform hands-on UI acceptance before parent merge, focused and browser verification may precede that review; defer the full unit suite until the merge candidate is otherwise ready unless risk requires it sooner.
- Run the narrowest relevant automated tests during implementation, then run the agreed broader regression suite before merging a completed feature parent or preparing a release.
- The agent should verify behavior that can be automated. The user performs final visual and exploratory UI testing when they have chosen to do so; provide a concise list of flows that need manual confirmation.
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
- Decide the version only right before release.
- During release preparation, update the app version source and its lockfile metadata together. Do not bump independently versioned tools, plugins, or services unless they are explicitly part of the same release.
- Use conventional commit messages:
  - `feat: ...`
  - `fix: ...`
  - `refactor: ...`
  - `docs: ...`
  - `chore: ...`
- Keep commits logically scoped. One logical change should map to one commit when practical.
- `CHANGELOG.md` is the source of truth for user-facing release notes.
- Write release notes from the user's perspective: describe new capabilities, changed workflows, and resolved problems rather than internal modules, schemas, or commit history.
- Before final release approval, verify version consistency, release notes, relevant automated tests, build inputs, and the final Git diff. Tagging, pushing, packaging, and publication remain separate explicit actions.
- Future `build.sh` / `update.json` release metadata should be generated from `CHANGELOG.md`, not directly from raw commit messages.

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
