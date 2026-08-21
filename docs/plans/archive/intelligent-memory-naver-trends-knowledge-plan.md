# Intelligent Memory: Naver Trends Knowledge Bridge

## Status

- Phase: implemented
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-naver-trends-knowledge`

## Goal

Expose the application's existing Naver Trend Posting data as normalized
knowledge without prematurely treating exposure as owner preference.

## Provider Contract

- `kind`: `trends`
- `transport`: `builtin_api`
- vendor: `naver_trend_posting`
- default provider id: `naver-trends`
- initial route: `content_ideas`

The provider reuses the licensed Trend Posting token/cache and remote client. It
does not introduce another backend endpoint or ship the backend's internal
shared token to the desktop app.

The default snapshot uses the latest server-reported data date, at most five
configured or available categories, and at most twenty normalized keywords.
Callers may provide category/date constraints through the provider query.

## Normalized Evidence

Each item preserves:

- keyword and categories;
- trend date;
- change type, amount, raw label, and display order;
- provider/vendor/source identity;
- `evidence_stage=observed` and `evidence_strength=weak`.

These labels describe the external item, not owner activity. Fetching a snapshot
does not append a lifecycle event or update the owner profile. A later explicit
save, selection, draft, publish, or feedback action remains the evidence that can
teach the system about the owner.

## Configuration and Compatibility

The built-in definition is supplied when an installation has no provider with
id `naver-trends`. An explicit definition with that id overrides the default and
can disable it. The provider is appended to the `content_ideas` route without
removing configured providers such as SerpApi.

Planner and registry use the same resolved routing so validation metadata cannot
drift from execution routing.

## Deferred

- owner-profile/trend relevance scoring;
- candidate diversity and duplicate policy;
- recommendation feedback learning;
- recommendation UI.

Those belong to steps 7–10 and must consume this provider contract rather than
calling Trend Posting APIs directly.
