# Newsletter Push Deployment and Canary Parity

- Branch: `codex/newsletter-push-canary-parity`
- Base/parent: `dev`
- Start date: 2026-11-05
- Status: implementation complete; ready for Development push verification

## User need and goal

Make Development and Production newsletter operations predictable from their normal integration pushes. A `dev` push should deploy the Development stack; a `release/*` push should build and deploy Production. Both then send one fixed-recipient canary email and enable subscriber delivery only after that canary succeeds. The existing newsletter Workflow sends the Telegram run summary; deployment automation must not send a second Telegram message.

## Scope

- Keep the same ordered deploy, canary, and post-canary policy transition in both environments.
- Keep environment policy configuration explicit: both environments remain `disabled` until a successful fixed-admin canary, then switch to `live`.
- Extend the fixed-recipient canary path to Development while keeping its recipient configured per GitHub Environment and validating the target environment.
- Trigger Production release deployment automatically from `release/*` pushes; the push is the user's deployment approval. Keep manual site-domain cutover/rollback and an emergency newsletter disable action.
- Keep newsletter email at the fixed administrator recipient for the canary. Normal subscriber delivery can begin only after Production canary success and occurs on later collection signals, not as a direct effect of the release push.
- Restrict Production GitHub Environment access to release branches (and `v*` tags needed by app release builds) without an additional reviewer gate, because the user has defined release push as approval.

## Non-goals

- Sending a Telegram notification directly from GitHub Actions.
- Sending subscriber campaigns as part of the push itself; delivery begins only on later collection signals after live activation.
- Sending newsletter campaigns at push time.
- Automatically transferring a hostname from the known legacy Production Worker; that remains a separate cutover operation.
- Changing newsletter content, subscriber data, or database schema.

## Design and boundaries

- GitHub workflow coordinates deployments and fixed-recipient canary requests.
- Trends API Worker authenticates the internal canary route with the dedicated canary token and starts the existing newsletter Workflow.
- Newsletter Workflow validates the deployed release SHA/deployment identity, reads trend/RSS data, sends the canary through the mailing Edge Function, and sends the existing Telegram summary.
- The mailing Edge Function sends only to the configured fixed canary recipient for the canary action. It does not enumerate or write subscriber delivery rows.
- Both environments start with delivery disabled during deployment, send and verify the fixed-recipient canary, then change to `live`. Failure leaves delivery disabled.

## Decisions made with the user

- `dev` and Production use the same push-driven deployment, canary, and live-activation sequence.
- Production `release/*` push is authorization to deploy and enable live delivery; no separate workflow-dispatch deployment or reviewer approval is required.
- Canary is not a second Telegram integration. The existing newsletter Workflow summary is the operator notification.
- The canary email goes only to the administrator address configured in the matching GitHub Environment.

## Implementation stages

1. Generalize API, Newsletter Worker, and mailing Edge Function canary behavior to both environments with environment-bound fixed recipients.
2. Add Development canary credentials/configuration to secret sync and Development push deployment.
3. Make Production release pushes build/deploy automatically; canary after successful deployment, then activate live; retain site cutover/rollback and emergency disable controls.
4. Update canonical deployment and secret-sync documentation.
5. Run focused canary, workflow-contract, and secret-sync tests; request approval before any full suite required for integration into `dev`.

## Verification and follow-up

- Focused Node suites passed: canary client, secret sync, deployment/workflow contracts, and Trends API Worker (43 tests total); Newsletter Worker suite (42 tests).
- Supabase mailing Edge Function `deno check` and handler tests passed (20 tests).
- Workflow YAML parsing and `git diff --check` passed.
- A Development push must be exercised by the user before promotion. It will send one fixed-admin canary, receive the existing Worker Telegram summary, and switch Development delivery to live only after canary success.
- Production is configured for the same flow on `release/*` pushes. No Production deployment has been run as part of this change.
- No commit, merge, push, or Production deployment is included in the implementation work unless separately requested.
