# WordPress Mixed Related Posts Development

- Branch: `codex/feat/wordpress-mixed-related-posts`
- Start date: 2026-09-27
- Base/parent branch: `release/v0.5.3`
- Status: Complete; merged into `release/v0.5.3`

## User Need and Goal

When publishing a post to WordPress, the related-links section currently contains only Naver Blog posts in the Blog Beta manuscript flow. The user wants up to three related articles selected across available Naver Blog and WordPress feeds.

## Scope

- Collect candidates from every available blog feed (Naver and/or WordPress), regardless of which platform will receive the manuscript.
- Rank the combined candidate pool for relevance to the manuscript.
- Prefer source diversity when candidates have comparable relevance, without sacrificing clearly better relevance solely to force a mix.
- If there are too few relevant candidates, fill remaining slots with shuffled/random candidates from both sources.
- Deduplicate URLs and include at most three links.
- Apply the same selection policy to Naver and WordPress publication, so changing the target does not change the preview's related-links section.
- Add focused tests and update relevant engineering documentation.

## Non-goals

- Guarantee SEO ranking improvement; source mixing is a user preference, not an SEO promise.
- Change legacy posting paths outside the three Blog Beta manuscript modes.
- Publish content, contact production services, or modify remote data during tests.

## Design and Decisions

All three Blog Beta manuscript input modes (AI generation, folder, and pasted manuscript) share the manuscript finalization gateway. That gateway gathers candidates from each available Naver/WordPress feed, combines them, and never filters by the current publishing target. If only one platform feed is available, naturally only that feed contributes candidates. The shared selector ranks the combined pool, applies soft source diversity, and fills remaining slots from a shuffled combined fallback.

The user approved these rules on 2026-09-27: no source priority; rank all available candidates together for relevance; prefer a mix as an important but non-mandatory constraint; random mixed fallback if no/insufficient relevant candidates; choose at most three. Relevance takes precedence over forced diversity. Target changes update publication metadata but do not trigger related-post recollection, keeping preview links stable.

## Progress and Verification

- 2026-09-27: Created from `release/v0.5.3` to preserve the release candidate baseline.
- 2026-09-27: Added Naver and WordPress RSS candidate collection, combined ranking, soft diversity, and random fallback.
- 2026-09-27: Made collection target-independent across all three Blog Beta manuscript input modes and kept existing related links stable when publication targets change.
- 2026-09-27: Focused tests passed (52/52) across related-post selection, manuscript drafts, and the Blog Beta content-service suites. `git diff --check` passed.
- User reported hands-on testing looked good. Full TC and broader publishing validation were not performed.
- No live publishing or production data was touched.

## Final Handoff

Changes were committed and fast-forward merged into `release/v0.5.3`. Further release validation remains part of release preparation.
