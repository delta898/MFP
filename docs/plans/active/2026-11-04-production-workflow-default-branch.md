# Production Workflow Default-Branch Availability

## Branch
- Branch: `codex/production-workflow-default-branch`
- Base/parent: `main` (`origin/main` at branch creation)
- Start date: 2026-11-04
- Status: Implementation complete; awaiting main integration

## User need and goal
GitHub requires a `workflow_dispatch` workflow definition to exist on the repository default branch before it can be manually dispatched against another ref. Production deployment and newsletter control must still run from `release/*` refs, so make their dispatch definitions available on `main` without bringing the unreleased product implementation onto `main`.

## Scope and non-goals
- Scope: add the existing Production deploy and newsletter control workflow definitions to the default branch; document why they live there and how a release ref is selected.
- Non-goals: deploy Production, create/push a release branch, run canary or live activation, or merge the unreleased Trends/newsletter implementation into `main`.

## Design and tradeoffs
Copy the reviewed workflow definitions from `dev` onto a branch based on `main`. The workflow files are manual-only and validate `release/*`; their jobs check out the selected release SHA, so placing the dispatch definitions on `main` does not change the deployment source. Avoid adding a push trigger because it would deploy on release branch push without the operator's manual start.

## Decisions
- The Production artifact source remains the selected `release/*` ref.
- `main` receives only workflow entry points and this operational record, not application code.

## Implementation and verification
- Added the Production release deploy and newsletter control workflow definitions to this `main`-based branch without copying application implementation files.
- Documented that GitHub needs the dispatch definitions on the default branch while the selected `release/*` SHA remains the deployment source.
- Both workflow files parse as YAML, expose only manual dispatch (no push trigger), guard `release/*`, and check out the selected `github.sha`.
- `git diff --check` passes.

## Result and follow-up
- After main integration and push, verify that GitHub Actions lists both workflows. Select `release/v0.7.2` only after creating it from `dev`; do not run either workflow as part of this change.
- No Production services, email recipients, secrets, or release refs were modified.
