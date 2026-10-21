# Unified Desktop User Data Root

- Date: 2026-10-21
- Status: Accepted and implemented

## Decision

Packaged desktop builds store mutable user data in one stable, per-user root regardless of the executable or bundle location:

- Windows: `%LOCALAPPDATA%/BlogGenius/`
- macOS: `~/Library/Application Support/blog-genius/BlogGenius/`

Configuration, logs, workspace files, application data/cache, and other user-specific state belong below this root. Install and portable package directories contain application files and read-only defaults only.

## Migration behavior

At packaged startup, legacy `config/`, `data/`, and `workspace/` directories beside the application are moved into the selected user-data root. macOS legacy diagnostic logs are also moved from prior diagnostic locations. If a destination file already exists, that destination file is moved under `migration-archive/{timestamp}/{category}/...`, then the legacy source file takes its canonical destination path. Cross-volume moves use copy-then-delete after checking the copied file size. Migration reports moved, archived, and skipped item counts in startup diagnostics. Symlinks and unsupported filesystem entries are left for manual handling.

## Rationale

The supported Windows installer and macOS portable ZIP should behave consistently. A stable user-owned location avoids writing into an extracted bundle or install directory, keeps user state across app replacement, and makes logs and support diagnostics predictable.

Electron's internal `userData` path remains at its prior location so macOS safeStorage/Keychain identity is preserved. BlogGenius-managed data paths use the roots above.

## Development runtime override

`BLOGGENIUS_RUNTIME_ROOT`, when set to an absolute path, is the single root for
configuration, logs, workspace, data/cache, and license files. `run_dev.sh`
sets it by default to the directory containing `run_dev.sh` (the repository
root), independent of the caller's current working directory, while allowing a
caller-provided value to override that location. Production source launches
without an explicit override use the platform user-data root above, keeping
development files separate. Packaged launches also use the platform defaults.
Electron's internal `userData` path remains unchanged for Keychain identity.
