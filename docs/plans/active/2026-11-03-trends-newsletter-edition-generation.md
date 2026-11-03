# Trends Newsletter Edition Generation

## Branch and status

- Branch: `feature/trends-newsletter-edition-generation`
- Start date: 2026-11-03
- Base/parent branch: `dev`
- Status: implementation and Development deployment complete; live Workflow verification pending
- Commit: `548c6370` (`feat: generate shared trends newsletter editions`), merged to and pushed on `dev`

## User need and goal

Create the shared, date-specific portion of the Naver Trends newsletter after
the collector's completion signal has been verified. Save one reusable common
edition per trend date so it can later be delivered with subscriber-specific
trend sections and published in a dedicated menu on `blog.gongzza.com`.

## Scope

This stage covers:

- Persisting a common newsletter edition in Development Supabase.
- Selecting one public blog article from an ordered RSS source list. Initial
  sources are `blog.gongzza.com` and Naver Blog `amadejjs`; feed failures fall
  through to the next source.
- Generating only a short shared greeting/introduction through Cloudflare AI
  Gateway; AI does not choose or create URLs.
- Including the fixed BlogGenius download destination and a visually useful
  banner/asset reference in the saved edition.
- Idempotently reusing the edition for repeated signals of the same date.
- Keeping the Development and Production resources, URLs, and credentials
  isolated. Production is not changed in this feature stage.

## Explicit non-goals

- Subscriber selection, personalized top-10 trend sections, email rendering,
  Brevo sending, unsubscribe token changes, or delivery retries.
- The public archive/menu on `blog.gongzza.com`; its publishing mechanism will
  be designed when that stage begins. This stage stores the canonical common
  edition in Supabase for later use.
- Production migration, secrets, AI keys, Worker deployment, or sending.
- Future keyword-to-BlogGenius/Telegram writing actions; those are research
  only and deferred.
- General reliability or product improvements beyond the needed edition path.

## Proposed boundaries and flow

The Cloudflare Newsletter Workflow remains the orchestrator. After it confirms
that the signaled Development date is complete, the Newsletter Application
logic builds or loads that date's common edition. RSS retrieval is an external
read adapter, AI Gateway is the server-side model transport, and
Supabase is the persistence adapter/RPC boundary. The public site never sees
provider secrets.

```text
collector completion signal
  -> readiness verification (existing)
  -> load existing edition for trend date, if present
  -> check configured public RSS sources in priority order
  -> select one item and retain only title/summary/link/date/image metadata
  -> generate short shared copy through AI Gateway
  -> validate and persist one Development edition
```

The edition snapshots the selected article title/link and download CTA so
future WordPress edits do not silently change an already-created issue. A
unique trend-date key and atomic insert-or-load contract prevent duplicate
editions. Failures do not mark an edition ready or overwrite a prior valid
edition.

## Decisions made with the user

- Implement on a new feature branch from `dev`; develop and verify in
  Development before any Production promotion.
- Start with common edition generation, proceeding in stages. Do not commit
  until the user requests it.
- The shared edition and eventual public dated archive belong in a dedicated
  menu on `blog.gongzza.com`, not in the SSG site. Archive implementation is
  explicitly deferred to its stage.
- Use RSS rather than the WordPress read API for newsletter links. Keep the
  ordered source list in environment configuration, initially BlogGenius at
  `blog.gongzza.com` followed by Naver Blog `amadejjs`. Skip unavailable feeds
  and choose one valid entry from the first usable source; do not mix several
  links into the common edition in this first pass.
- Include a bounded summary rather than full article content in the edition.
- Fixed BlogGenius download link should be presented with a banner/visual
  asset, not as a bare link.
- Use Cloudflare AI Gateway, with provider API keys kept server-side and
  Development/Production keysets separate. Provider fallback is a later
  configurable extension; the initial edition stage must not make multiple
  model calls unless configured and needed.
- AI writes only short common greeting/introduction. Deterministic application
  logic selects all links.
- Future subscriber mail will include top 10 keywords and movement details per
  selected category plus a link to full trend results; this is outside this
  stage.
- Newsletter unsubscribe links should reuse the subscription's stable token
  across messages, with expiry handled by an understandable expired-link page.
  This feature stage does not change unsubscribe behavior.
- Keyword-to-writing actions from local BlogGenius or Telegram are deferred to
  technical research, not implementation.

## Implementation stages

1. Create the shared-edition data contract and Development migration/RPC with
   date-level idempotency and safe status transitions.
2. Add bounded RSS retrieval with configured source priority and deterministic
   fallback; snapshot the selected item's metadata and fixed download CTA.
3. Add server-side AI Gateway generation for the short shared copy, output
   validation, and explicit Development-only configuration.
4. Connect edition generation after readiness; ensure repeated signals reuse
   the same persisted edition and failures preserve the last valid state.
5. Add/update focused tests and architecture/deployment documentation. The
   Development migration is applied; Cloudflare Worker deployment remains
   pending until the Dev branch promotion and deployment workflow run.

## Progress

- Feature branch and development record created before implementation.
- Added shared-edition selection/copy validation, bounded multi-source RSS
  adapter, an authenticated Cloudflare AI Gateway BYOK adapter, and a
  Development-only Supabase RPC adapter.
- Connected Workflow generation after readiness; it loads/reuses one ready
  edition or saves a new one. Failures are held for later retry and do not send
  email.
- Added migration `202611030002_trends_newsletter_shared_editions.sql`, private
  service-role-only RPCs, and a date-unique canonical edition table.
- Registered the new migration in `supabase/inventory.json` so release
  artifacts include it; updated the artifact count contract test. Updated the
  hosted-environment workflow test to reflect its required Supabase project
  link for IPv4 CI connectivity.
- Added focused tests for RSS parsing/fallback, copy/link validation, AI
  request/response, Supabase RPC boundaries, and readiness. All 20 focused
  tests pass.
- Updated the Worker guide and architecture doc with the agreed WordPress
  archive direction.
- Development migration `202611030002` was applied and remotely confirmed with
  the user. Cloudflare Worker deployment has not yet run for this stage.

## Verification and remaining risks

- Focused `npm test` in the newsletter Worker passes (20 tests), including the
  authenticated provider-specific Gateway BYOK request contract.
- Full unit suite passes: 2,478 passed, 1 skipped, 0 failed. Five existing
  loopback-server tests required running outside the restricted sandbox.
- Release-artifact and environment-validation workflow focused tests pass.
- Wrangler deploy dry-run passes with the Development Supabase/Workflow binding
  and no Production targets. The config now specifies the Development Gateway
  ID, `development` BYOK alias, OpenAI provider, `gpt-6-luna` model, Dev site
  links, and ordered WordPress/Naver RSS feeds.
- Development deployment run `41567562592` succeeded: newsletter Workflow
  Worker and Development Trends API Worker both deployed. Development Supabase
  drift validation run `41567562559` also succeeded, including migration and
  Function state comparison and public smoke checks.
- `git diff --check` passes.
- Do not call billable AI services in automated tests; mock the Gateway. A real
  Development model connection check requires an explicit user-run/approved
  step and Dev credentials.
- The user confirmed both RSS feeds work and changed the Naver feed URL to
  `https://rss.blog.naver.com/amadejjs`. Automated tests still use fixtures; the
  Worker has not yet fetched either feed in a deployed Development run.
- Confirm existing Development Workflow limits and ensure edition creation
  does not trigger subscriber emails.
- Development migration status was checked remotely: `202611030001` and
  `202611030002` are both applied to project `bvtlwjbmjnfphxlrkzhm`.
- After migration, all 20 focused Worker tests pass, Wrangler deploy dry-run
  passes for Development bindings, and `git diff --check` passes.
- No AI Gateway call, live RSS fetch, or live edition persistence has been
  verified yet; a new Development collector signal is required for this
  end-to-end check.
- Review corrections: allow the sequential 12-second RSS timeout for each of
  the configured maximum eight feeds within the Workflow step timeout; use
  OpenAI GPT-6 Luna's Chat Completions parameter names and zero reasoning
  effort so the configured model accepts the request.
