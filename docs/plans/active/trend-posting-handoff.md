# Trend Posting Handoff

Updated: 2026-08-12

## New Conversation Start Here

Read this document first, then read
[trend-posting-plan.md](./trend-posting-plan.md). The plan still contains parts
of the earlier, larger UI proposal and must be updated to match the decisions in
this handoff before implementation continues.

Do not infer a separate Trend Posting writing engine. The current product
decision is:

> Trend Posting is a manual topic-entry frontend that uses Naver trend data as
> its source. Every selected trend keyword is first stored in the existing
> Google Spreadsheet `topics` repository, and all writing, preview, retry,
> scheduling, and publishing behavior then uses the existing BlogGenius
> pipeline.

Do not commit, push, merge, or delete branches unless the user explicitly asks.

## Branch State

The fixed hierarchy is:

```text
main -> dev -> feature/trend-posting-main -> feature sub branches
```

Current work branch:

```text
feature/trend-posting-composer
```

Parent/integration branch:

```text
feature/trend-posting-main
```

The completed child branch `feature/trend-posting-access` was fast-forwarded
into `feature/trend-posting-main` and then deleted locally. Its remote branch was
not changed. No current composer work has been pushed.

The working tree was clean when the composer branch was created. Composer work
is now present but uncommitted. It implements the simplified discovery UI,
direct waiting-topic save, and Quick Posting handoff described below.

## Completed Access And Query Foundation

The access/query work is already present in `feature/trend-posting-main`.

Implemented and validated:

- Supabase Edge Function `issue-trends-access-token`
- active-license and HWID validation using the existing license RPC
- 15-minute `trends:read` token, cached only in desktop app memory
- Oracle trends API verification of signature, issuer, audience, expiry, scope
- separation of user read tokens from the existing internal bearer token
- production HTTPS endpoint `https://trendapi.hangadac.com`
- local desktop endpoints:
  - `GET /api/v1/trend-posting/meta`
  - `GET /api/v1/trend-posting/keywords`
- multi-category/date validation, 31-day direct-range maximum
- duplicate keyword aggregation and stable UI response fields
- explicit handling of the remote 5,000-row ceiling
- focused tests for filters, aggregation, token cache, transport, service, routes

Production validation completed on 2026-08-12:

- public health endpoint returned HTTP 200 through Caddy
- unauthenticated trend metadata returned HTTP 401
- internal bearer-token metadata returned HTTP 200
- desktop metadata returned HTTP 200 with a real active license
- desktop keyword query returned 20 `맛집` rows for `2026-08-11`

Relevant commits now included in the integration branch:

```text
564a1e5 feat: secure trends read access
6cf2258 fix: preserve selected trends preview date
4ec985c fix: isolate licensed trends read limits
c835f07 docs: document trends production topology
65f317f feat: add licensed trend posting queries
1c29345 docs: record trend access production validation
```

Never commit access secrets. Oracle and Supabase must share the read-token
signing secret, while the internal API token remains a different value.

## Confirmed Product Model

### Existing BlogGenius Lifecycle Is The Source Of Truth

BlogGenius already uses the Google Spreadsheet `topics` sheet as the durable
work repository for both quick posting and batch posting. Trend Posting must use
the same lifecycle:

```text
Naver trends API
  -> filter and deduplicate keywords
  -> user chooses a keyword
  -> append a topics row
  -> existing generation / preview / publish / retry / schedule pipeline
```

The remote trend API is a discovery source, not a job store. Do not create a
second trend-specific job database, retry model, scheduler, or publishing path.

### Per-Keyword Actions

Each result row offers two simple actions and no separate composer dialog:

1. `빠른 포스팅에서 작성`
   - switch to the existing Quick Posting AI input screen
   - fill Subject and Keywords with the selected trend keyword
   - keep the user's existing Quick Posting settings
   - confirm before replacing non-empty per-topic Quick Posting input
   - preserve `source=naver_trend` and the result's latest trend date when the
     existing Quick Posting action later appends the topics row
2. `글감 저장`
   - append directly to `topics`
   - initial status `대기`
   - do not invoke the AI
   - remain on the Trend Posting screen and show a saved state

`발행 준비 완료` already means that the row is eligible for automatic
publishing. A simple `글감 저장` action must therefore not use that status.
There must be no direct generation or publishing shortcut that bypasses the
existing Quick Posting and `topics` lifecycle.

### Topic Mapping

The new frontend maps a selected result into the existing topics schema:

| topics value | source |
| --- | --- |
| subject | selected trend keyword |
| keywords | selected trend keyword |
| instruction | Quick Posting input when the user continues there |
| reference URL | Quick Posting input when the user continues there |
| status | direct save is `대기`; Quick Posting keeps its existing mode rule |
| writing options | current Quick Posting snapshot when executed there |
| source | a stable Naver-trend source identifier |
| trend date | result's latest trend date |

Use existing `appendGoogleSheetTopics` and existing quick-publish contracts.
Do not add a parallel Spreadsheet schema when the existing `source`,
`trendDate`, and options fields cover the requirement.

## Confirmed UX Decisions

### Query Controls

The only trend-selection inputs are:

- period
- trend categories

Period choices:

- `최신 데이터 (M월 D일)`: the maximum date returned by API metadata
- `최근 7일`: seven days ending at the latest available data date
- `직접 지정`: maximum 31 days

Do not offer `오늘`. Naver normally adds the previous day's data around 07:30,
and collection can be delayed. UI labels must use the actual latest available
date rather than silently assuming yesterday.

Trend category selection:

- multiple selection
- maximum five categories
- show the current count, for example `2/5`
- disable additional choices at the limit and explain the limit immediately

Five categories keep the worst expected 31-day query comfortably below the
current 5,000-row remote ceiling (normally about 3,100 raw rows at 20 rows per
category/day).

### Results Table

The table displays unique keywords only. Duplicates across dates/categories are
aggregated by the existing query layer.

Initial columns:

- keyword
- trend categories
- latest trend date
- rise/change indicator
- `글쓰기` action

Do not display occurrence count or pretend that the change indicator is an
absolute search volume.

### Quick Posting Handoff

Trend Posting does not render or edit writing settings. It passes a small
one-time topic context to Quick Posting containing Subject, Keywords,
`source=naver_trend`, and the result's latest trend date. Quick Posting remains
the only UI that owns writing settings and snapshots them when its existing
action appends the topics row.

Do not implement this as untracked DOM copying: provenance must not be lost or
leak into a later unrelated Quick Posting topic.

### Future Batch Extension

Batch writing is not required in the first release, but the table must remain
extensible:

- future checkbox column at the left
- header select-all control
- toolbar immediately above the table
- future actions `선택 글감 저장` and `선택 글쓰기`
- shared settings apply to all selected rows
- a batch dialog may accept one common optional instruction

Do not expose inactive batch controls in the first version merely as a
placeholder.

## Current Composer Work

Implemented in the uncommitted working tree:

1. `trend-posting-plan.md` now describes the simplified discovery-only model.
2. Trend categories are limited to five in both the UI and query contract.
3. The Trend Posting tab provides latest, recent-seven-day, and direct-range
   queries plus the aggregated results table.
4. `빠른 포스팅에서 작성` switches to the existing AI Quick Posting mode,
   fills Subject and Keywords, confirms before replacing existing topic input,
   and preserves `source=naver_trend` and `trendDate` through the topics append.
5. `글감 저장` uses a focused local endpoint to append a `대기` topics row
   without invoking AI and requires an active license.
6. Focused query, route, service, and Quick Posting provenance tests pass.
7. The full unit suite passes except when the sandbox blocks the existing local
   HTTP listener test; that test passes when rerun with local listener access.
8. The first UI refinement reuses the existing Automatic Topic collection
   section, form grid, category buttons, and action row. The normal and custom
   date layouts no longer overlap, and the category limit remains visible.
9. `글감 저장` now keeps per-row pending, success, and failure feedback visible.
   Failure rows expose the actionable local API message and offer `다시 시도`.
10. Direct Trend Posting saves rely on the UI session sheet preflight instead
    of rechecking every required sheet on each click. This single-row path also
    skips the legacy one-second post-append delay; other batch and automation
    callers retain their existing delay by default.
11. Keyword, category, latest-date, and change headers now reuse the existing
    accessible sortable-header interaction. The initial order is latest trend
    date descending, and repeated header activation toggles direction locally.
12. The Trend Posting result table no longer creates a second vertical scroll
    area on desktop. The app page scroll carries the query section away, then
    keeps the table header sticky while compact result rows pass underneath.
    Narrow layouts retain horizontal overflow so action columns are not clipped.

Remaining work:

1. Add the queued discovery filters: keyword search, change kinds, minimum rise,
   and Top N. Do not combine this with the table usability increments.
2. Add the separately queued topics-aware recent-save exclusion filter.
3. Report when each increment has a basic implementation ready. The user owns
   UI validation; do not spend development turns driving or visually testing
   the running UI unless the user asks.
4. During incremental development, use only lightweight static checks where
   needed. Batch unit and regression test execution after the development scope
   stabilizes in the pre-release/release validation phase.
5. Ask before commit. After approval, merge this child into
   `feature/trend-posting-main`, then delete the child branch.

## Suggested First Message In A New Conversation

```text
Trend Posting 작업을 이어갑시다.
먼저 docs/plans/active/trend-posting-handoff.md와
docs/plans/active/trend-posting-plan.md를 읽고, 현재 브랜치와 working tree를
확인해 주세요. handoff의 최신 결정이 기존 plan과 충돌하면 handoff를
우선하고, 바로 코딩하지 말고 다음 작업 범위를 먼저 요약해 주세요.
```
