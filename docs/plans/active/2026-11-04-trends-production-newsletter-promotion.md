# Trends Newsletter Production Promotion

## Branch and status

- Branch: `codex/trends-production-newsletter-promotion`
- Base/parent branch: `dev` at `d87b1e90`
- Start date: 2026-11-04
- Status: Release implementation merged locally into `dev`; Development parity validation is in progress; Production rollout remains blocked on Development verification and migration-history reconciliation

## User need and goal

Development success alone does not prove the Production newsletter works:
Production has separate Cloudflare Workers/domains, Supabase project and
credentials, Edge Function deployment, and email policy. The user wants a
release process that validates the real Production wiring without risking an
unintended send to all subscribers.

Goal: define a repeatable Production promotion and acceptance path for the
Trends API, newsletter Workflow Worker, mailing Edge Function, Supabase schema,
and Production site. Production verification must be meaningful and safe, with
full subscriber delivery kept behind an explicit activation gate.

## Scope proposal

- Release-branch workflow for reviewed code, tied to an exact commit SHA.
- Production preflight for Supabase project identity/schema/RPC readiness,
  Worker names and bindings, custom domains, API origin, and required settings.
- Ordered deployment of reviewed migrations, the mailing Edge Function, API
  Worker, newsletter Workflow Worker, and site.
- Production read-only/API smoke checks and a bounded end-to-end canary path.
- A server-enforced delivery state that distinguishes disabled, canary, and
  live subscriber delivery.
- Documentation for release evidence, approval, rollback, and operator checks.

## Explicit non-goals

- Running a production collection solely as a test when that could start a
  subscriber campaign.
- Importing Development subscribers or copying Development credentials/data.
- Enabling live Production email by default or making code deployment alone
  activate it.
- Changing the newsletter product content or recipient category behavior.

## Current-state findings

- Development deploys migrations, the mailing Edge Function, API Worker,
  newsletter Workflow Worker, and Development site on a `dev` push.
- Production currently has the API and site promotion workflow, but no
  newsletter Workflow Worker deployment path. Production newsletter schemas,
  Edge Function, sender policy, and signal binding are not yet provisioned by
  that workflow.
- The newsletter Worker configuration and delivery adapters are explicitly
  Development-bound. Production cannot be enabled by simply renaming the
  Worker or copying Development secrets.
- The Edge Function permits non-Production sends only in `allowlist` mode and
  Production sends only in `live` mode. There is no isolated Production
  canary mode today.
- The existing Production checklist verifies migration/artifact evidence but
  does not run the complete Production newsletter data path.

## Proposed promotion design (for discussion)

1. **Development evidence:** tests and the current Development integration
   deployment pass, including allowlist delivery.
2. **Release candidate:** select a `release/*` SHA. Build and validate all
   code from that SHA; record the SHA and artifact/config fingerprints in the
   release evidence. Environment-specific values stay outside the artifact.
3. **Production preflight:** before mutation, prove the selected Production
   Supabase project, migration state, Function endpoint, Worker identities,
   workflow binding, hostnames, and required setting names match the declared
   Production profile. Fail closed on any Development target.
4. **Safe deployment:** apply reviewed, additive/compatible migrations first;
   deploy the Edge Function and both Workers with newsletter delivery
   disabled; verify both API hostnames, public site/API CORS, private signal
   authentication, Workflow start/readiness, and Supabase RPC access.
5. **Canary:** a separate private operation sends one real message to one
   configured administrator address using Production trend data and the
   Production sender. It must not query/iterate the subscriber list, mutate
   the normal campaign revision/recipient ledger, or accept an arbitrary
   recipient from the request. The server enforces this; a UI/workflow input
   alone is not a safety boundary.
6. **Live activation:** after canary evidence and a separate explicit
   Production approval, allow the normal collection signal to deliver to
   eligible Production subscribers automatically, matching Development.
   Emergency disable must stop subsequent sends without requiring a code
   deployment.
7. **Post-deploy evidence/rollback:** verify one normal collection signal only
   after live activation is approved. Preserve migration recovery guidance,
   Worker rollback version identifiers, and an immediate delivery-disable
   switch.

The stage-4 and stage-5 probes should use the same Production code and
connections as the live path. The canary is isolated from normal campaign
ledger operations so it cannot claim or mark a subscriber delivery. Require a
canary before first live activation and whenever newsletter code or
newsletter-specific Production configuration changes. Site-only or unrelated
changes use read-only smoke checks and do not resend a canary.

## Decisions made with the user

- User approved read-only Production smoke, followed by a canary to one fixed
  administrator address, followed by a separate approval to activate normal
  subscriber delivery.
- Once live is explicitly activated, Production collection automatically
  triggers newsletter delivery, matching Development.
- A canary is mandatory before the first live activation and when newsletter
  code or newsletter-specific Production configuration changes. Unrelated
  changes use read-only smoke only.
- The canary destination must be a single Production-only configured address;
  it must never be accepted from an event payload.

## Before the first Production rollout

- Set `NEWSLETTER_CANARY_EMAIL` in `.secrets/.secret.prod.env`, sync Production
  GitHub Environment values, and verify the configured sender/Brevo account.
- Review the Production Supabase migration dry-run and existing mailing data
  in the read-only preview job before approving the separate deployment job's
  schema changes.
- Dispatch the release deployment, verify read-only smoke and disabled mode,
  send/review the administrator canary, then activate live in a separate
  approved control run.

## Affected boundaries to confirm before implementation

- `.github/workflows/`: release-only Production deploy/verify/activate stages.
- `apps/trends/trends-api/workers/`: Production newsletter signal binding and
  strict environment-specific target checks.
- `apps/trends/trends-newsletter/worker/`: explicit Production Worker config
  and canary orchestration without Development constants.
- `supabase/functions/trends-mailing-list/`: server-enforced disabled/canary/
  live delivery policy and isolated canary operation.
- `supabase/migrations/`: Production-compatible schema rollout, only if
  required after inspection.
- `scripts/secrets/`: typed Production-only configuration sync for nonsecret
  controls and secrets, without printing values.
- `docs/architecture/trends-backend-deployment.md`: promote stable deployment
  and rollback behavior after user design approval.

Before adding or moving source files, trace callers and classify ownership
using `docs/architecture/platform-kernel-applications-plugins.md`.

## Verification proposal

- Unit/contract checks for environment binding, fail-closed delivery modes,
  canary recipient isolation, and no normal campaign-ledger mutation.
- Workflow/static configuration checks proving release-only dispatch and
  Production-only credentials/targets.
- Production dry-run/preflight that is read-only and cannot send email or
  mutate Supabase.
- After release approval, bounded Production smoke and one administrator
  canary; live subscriber delivery remains a separate approval/action.

## Progress log

- 2026-11-04: Created this feature branch from local `dev` (`d87b1e90`), which
  contains the previously approved Production Trends web/API deployment
  preparation. Reviewed current environment, Worker, Edge Function, and
  release workflow boundaries. No Production service was changed.
- 2026-11-04: User approved a private fixed-recipient Production canary after
  read-only smoke, followed by separate approval for live subscriber delivery.
  Once live is active, Production collection should trigger delivery
  automatically. Require a canary on first activation and newsletter
  code/config changes; unrelated changes use read-only smoke only.
- 2026-11-04: Began implementation of shared environment-targeted newsletter
  adapters, server-side disabled/canary/live policy, an isolated canary
  workflow/API route, release-only deployment wiring, and a protected manual
  control workflow. No Production secrets, database, Worker, Edge Function, or
  email provider were contacted.
- 2026-11-04: User clarified that the configured delivery mode selects email
  behavior while the environment validates compatible modes and selects
  targets. Worker now checks delivery mode in both environments before any
  newsletter ledger writes. The subscriber-delivery gate now checks only for
  the `allowlist` or `live` modes; the Edge Function owns environment/mode
  compatibility validation.
- 2026-11-04: Reviewed environment-specific source/config naming. Newsletter
  business source remains shared; Wrangler target profiles and deployment
  workflows intentionally have environment-specific names/configuration.
  Removed unused Development-only adapter aliases, aligned the Worker package
  name with its shared source, and replaced the Development-only Worker guide
  with shared environment/mode documentation. Repository-wide inspection also
  found duplicated date-range shell orchestration; both named entry points now
  delegate to one environment-parameterized range runner while retaining their
  existing per-environment confirmation and failure behavior.
- 2026-11-04: Split Production migration preview into its own read-only
  Environment-gated job. The deployment job now waits for that preview and
  requires its own Production approval, allowing the operator to review pending
  schema changes before any Production mutation.
- 2026-11-04: Focused verification passed: newsletter Worker tests (41), API
  Worker tests (13), Edge Function checks/tests (20), GitHub secret utility
  tests (14), YAML and shell syntax checks, and Wrangler Production dry-runs
  for both Workers. No Production service, database, email, or secret sync was
  exercised. Full unit suite was not run.
- 2026-11-04: Implementation is complete in the working tree. Production
  rollout remains unexecuted pending the user's review of the release diff,
  migration dry-run, and configured fixed canary address.
- 2026-11-05: User-directed release/v0.7.2 changes were committed and pushed,
  then fast-forwarded into local `dev` after the approved full-suite run. The
  Development follow-up now uses its own Session Pooler URL for migration
  preview/apply/history inspection, and site deploy/cutover/rollback are split
  into Development operations gated to `dev` before Environment credentials
  are exposed. The secret sync also reconciles the existing Development
  Environment to a single `dev` branch policy. These follow-up changes remain
  uncommitted and unpushed; Production is not being retried. The attempted
  Production migration failed because the first local migration tried to
  create an already-existing `licenses` table, so Production migration history
  and schema reconciliation still require a safe, Development-first process.
