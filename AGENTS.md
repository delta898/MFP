# Project Working Rules

## Core Direction
- Prefer architecture and system structure over UI polish.
- Keep the system extensible. Avoid one-off shortcuts that block future provider, memory, or agent expansion.
- For agent/knowledge work, follow the `kind + transport + config` model.
- Prefer explicit capability-based control over raw config mutation.

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

## Release / Development Routine
- Do not bump versions during normal feature work.
- Decide the version only right before release.
- Use conventional commit messages:
  - `feat: ...`
  - `fix: ...`
  - `refactor: ...`
  - `docs: ...`
  - `chore: ...`
- Keep commits logically scoped. One logical change should map to one commit when practical.
- `CHANGELOG.md` is the source of truth for user-facing release notes.
- Future `build.sh` / `update.json` release metadata should be generated from `CHANGELOG.md`, not directly from raw commit messages.

## Documentation Rule
- `docs/` is a maintained engineering asset, not a scratchpad. Keep it in sync with code.
- Start large design work in `/Users/delta898/Project/NaverAutoBlog/docs/plans/active/`.
- Promote current, stable structure into `/Users/delta898/Project/NaverAutoBlog/docs/architecture/`.
- Record long-lived tradeoffs in `/Users/delta898/Project/NaverAutoBlog/docs/decisions/`.
- Keep `/Users/delta898/Project/NaverAutoBlog/docs/README.md` accurate when the docs structure changes.
- When major architecture decisions are made, update the relevant doc before or alongside code changes.
- A completed plan should be moved to `docs/plans/archive/` or replaced by canonical docs in `docs/architecture/` / `docs/features/`.

## Practical Rule
- Prefer stable, reviewable structure over cleverness.
- If a quick fix and a structural fix are both possible, choose the structural fix unless the user explicitly asks for a temporary patch.
