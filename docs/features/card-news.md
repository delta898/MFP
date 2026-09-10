# Card News

## Purpose

Card News turns a public article or user-provided manuscript into an ordered set of social images. The manual workflow stays useful without SNS publishing: users can inspect a source, create card composition and image prompts, generate or replace images, and export the completed set locally.

## Manual Workflow

1. Choose content from an enabled RSS source, a public URL, or pasted text.
2. Confirm the retrieved content before AI composition or image work begins.
3. Choose inline creation settings and create the card composition only, or create composition plus images.
4. Review prompts, copy them for another image tool, generate or regenerate individual images, or replace a card with a local image.
5. Download individual images or an ordered ZIP bundle, or import a compatible ZIP bundle back into the workflow.
6. Optionally publish completed images manually through configured Buffer channels.

## Sources and Management

- Connected Naver and WordPress blogs are available as RSS sources.
- Users may add up to three additional public HTTPS RSS feeds and enable or disable each source.
- The Google Spreadsheet `cardnews` tab is a management ledger: it records source identity, workflow/publishing status, generation identity, channel summaries, and external post links.
- Generated images, prompts, and detailed manifests stay in the local Card News workspace; the Sheet does not store asset data or absolute paths.
- Each newly generated set belongs to one local project under `workspace/card-news/projects/{project_id}/project.json`. The project owns the confirmed source snapshot, while generation manifests reference it by `project_id` so steps 1–3 reopen with the same content without copying the full source into every generation.
- `새 카드뉴스` and `만든 카드뉴스` are independent workspaces. The first couples its RSS/URL/manuscript input to the confirmed preview; the second couples its selected project to the stored source snapshot and saved generation without selecting or changing the current feed list.
- The feed list and managed-project list share one list presentation contract: equal viewport and row heights, shared typography tokens, the same toolbar, fixed title/status/date columns, one secondary-information line, and whole-row hover, focus, and selection. Source controls and management filters occupy optional toolbar slots rather than changing the list component. Original and published-post links belong to the selected item's preview/detail context rather than the list row.
- Both workspaces reuse the same card settings, result, image action, and publishing module. Their workflow state is stored separately when switching tabs rather than duplicating the module or sharing one mutable selection.
- Confirming a different source in `새 카드뉴스` starts a new project context and clears that workspace's visible downstream generation and publishing panels. Already saved local results are not deleted.
- While the desktop app is running, enabled feeds are collected conservatively and only unseen RSS items are appended. Existing management state is never overwritten by a later feed read.
- Source and managed lists share one derived user-facing state: `작업 중`, `발행 대기`, `발행 완료`, or `확인 필요`. The state is derived from workflow, publishing, and error facts rather than recalculated per screen.
- Status presentation follows meaning rather than legacy palette: work in progress is neutral, ready-to-publish uses the shared action accent, published uses success, and attention uses warning. Screens consume shared status tokens and do not own fixed colors.
- Card News source, preview, generation, result, publishing, management, and ZIP-import surfaces consume the shared semantic and component tokens. Feature markup and behavior do not branch on a concrete style; fixed geometry is limited to workflow constraints such as media aspect ratios, list viewport/row height, and responsive breakpoints.
- Selecting a source always refreshes that source's preview first, regardless of its management state. A newly saved generation is reopened inside `만든 카드뉴스`, where its stored project snapshot appears in the same right-hand preview position used by `새 카드뉴스`, followed by the shared generation result below. Results created before the project reference contract still open, but the preview surface remains blank.

## Publishing

- Local download remains independent of publishing.
- Manual Buffer publishing uses the configured Google Drive connection to temporarily provide public image URLs; WordPress is not required.
- Images are uploaded in card order and passed to Buffer in that same order.
- The app validates channel-specific image limits before upload. For example, Bluesky supports up to four and Threads up to ten images.
- Temporary Drive files are removed after terminal Buffer results. They are retained when delivery is ambiguous, so a potentially delivered post does not lose its media.

## Boundaries and Deferred Work

- Card News has no automatic creation or scheduled publication in the current feature scope.
- Authenticated, blocked, or anti-bot source pages are not supported.
- The configured image model renders visible card text in the initial implementation. Exact Korean text quality and visual continuity can vary by model; card-level regeneration and local replacement are available recovery paths.
- URL shortening is provider-neutral and falls back to the original URL when unavailable. Deterministic text rendering and further accessibility/visual polish remain future enhancements.
