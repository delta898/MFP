# Blog reference network safety

- Branch: `fix/blog-reference-network-safety`; base: `main` at `a1c46fb9`; started: 2026-11-10.
- Status: implementation in progress; independent review and QA pending.
- Scope: protect Blog reference HTTP(S) fetches from non-public destinations, rebinding and oversized responses, preserving cancellation and empty-result failure behavior. No publishing or unrelated fetchers.
- Design: validate every URL and every DNS answer; pin approved DNS results at connection, bypass proxies, handle redirects manually, cap decompressed response bytes. Cover failure paths and existing caller behavior with focused tests.
- Tradeoff: non-public/special-use IPs and proxy-dependent requests are deliberately rejected rather than risking access to internal resources.
- Verification and outstanding risks: to be recorded after checks.

## Progress and verification
- Implemented per-hop URL and DNS validation, connection-time address pinning, proxy bypass, bounded redirects, and a 1 MiB decompressed body cap. Existing optional-reference empty-result and cancellation behavior retained.
- Focused run: `BLOGGENIUS_ENV=development NODE_PATH=<existing node_modules> node --test src/adapters/web/blog-reference-content-fetcher.test.js src/applications/blog/posting/blog-reference-context.test.js src/applications/blog/posting/application.test.js` — 17 passed. Real Axios with local fixture verified gzip expansion rejection; fixture transport rewrites connection to loopback after checking the production lookup callback, so this is not proof of real public DNS/TLS connectivity.
- First application test run omitted the repository runner's `BLOGGENIUS_ENV` default and failed at environment initialization; rerun with that default passed. `git diff --check` passed.
- Full unit suite not run: repository rules require explicit approval for broad suites. Browser smoke uses a broad mocked UI fixture, not this network-fetch boundary; not run in this backend-only slice. Independent review and QA remain pending, including suitability of IP classification, platform behavior, and UI smoke if desired. No real publishing.
- Work is uncommitted; original worktree changes remain untouched. Proxy-only deployments and special-use addresses may no longer work by design.
- Independent review found DNS lookup was not bounded by cancellation or timeout. DNS lookup now races the existing cancellation mechanism and the configured scraping timeout on every hop; timeout retains the optional empty-result behavior. The timer is cleared on all outcomes. The underlying OS DNS lookup itself is not canceled, but its eventual result cannot start an HTTP request.
- Added in-progress DNS cancellation and timeout regressions. Before the fix, the focused run remained pending and was interrupted; after the fix, the three focused files above passed 19 tests with `BLOGGENIUS_ENV=development` and the existing `NODE_PATH`; `git diff --check` passed. Independent re-review and QA of the final change remain pending.
- Independent QA before this follow-up reported the mocked UI browser smoke passed; it does not exercise this DNS boundary. Full suite, actual public DNS/TLS, Windows, proxy-only environments, and real publishing remain unverified.
