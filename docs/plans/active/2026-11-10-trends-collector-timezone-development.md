# Trends collector timezone correction

- Branch: `fix/trends-collector-timezone`; base: `main` at branch creation; start: 2026-11-10.
- Status: implementation in progress; independent review and QA required; no merge.
- Goal: preserve the existing user-uncommitted non-interactive start log while correcting its timezone format on macOS and Linux. No collector, publishing, or unrelated behavior changes.
- Dependency: the start-log block is user work absent from HEAD, copied into this worktree solely to test and repair it. Its addition in the branch diff is not new work from this fix and must not be independently merged over the original uncommitted changes.
- Design: format `%z` using portable date and insert the colon in the numeric offset using sed. Check help and argument forwarding with a stub npm; no production collection.
- Red/green: the new test failed on macOS with literal `:z` before the fix, then passed with positive and negative timezone offsets; help, argument forwarding and npm exit status covered.
- Verification: macOS Node command test 2/2; existing collector suite 24/24 using original worktree's dependencies and local environment; bash syntax and git diff --check passed. Linux container (GNU date/sed, network disabled, mounted worktree read-only) verified positive and negative offsets, stubbed collector argument/exit forwarding and help. First Linux harness attempts failed due to test grep escaping/options; corrected harness passed without product changes.
- Limits: no actual collection or external publishing; interactive TTY branch and full regression not run. This CLI-only change does not affect UI smoke. Independent review and QA pending.
