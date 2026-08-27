# Development Environment Stage 2 — Runtime Profile

> Parent: `feature/development-environment-main`
> Branch: `feature/development-environment-02-runtime-profile`
> Production access or mutation: prohibited

## Scope

- resolve `local / development / production` from an explicit selector;
- fail closed when environment or public connection values are missing or invalid;
- route every desktop Supabase client through one connection boundary;
- expose secret-free startup and config-status diagnostics;
- remove the tracked build connection file and generate it only during release build;
- validate release builds as production artifacts before packaging;
- preserve temporary internal aliases only at the resolver boundary.

## Out of scope

- branch/project-ref deployment authorization;
- Supabase link, migration, reset, seed, function deploy, or secret upload;
- production schema inspection;
- creation of local or hosted development projects;
- UI controls for selecting an environment.

## Behavior

- The desktop shell can start without a selected environment.
- Supabase-backed features remain unavailable until a complete profile is selected.
- An old build config with only `LICENSE_CHK_URL/KEY` and no environment marker is ignored.
- A selected local profile cannot point to a remote host.
- A selected hosted profile cannot point to localhost or plain HTTP.
- Build-profile values are used only when their environment matches the selected environment.
- Safe diagnostics contain the endpoint host but no full URL or key.

## Verification

- resolver selection, precedence, validation, and safe diagnostic tests;
- generated build config and production mismatch tests;
- structural checks for every desktop Supabase client owner;
- focused client compatibility tests;
- full unit regression before handoff.

## User action

No Supabase project, Docker stack, remote secret, or production permission is required for Stage 2. Local Docker preparation begins before Stage 4B; hosted development project preparation begins before Stage 5.

## Handoff gate

The user reviews automated results and expected degraded behavior while no local profile exists. Commit, parent merge, branch deletion, and Stage 3 start require explicit requests.
