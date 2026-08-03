# Manual SNS Publishing Plan

## Status

Phase 1 implementation and runtime verification are complete. Phase 2 Chat
Model optimization is implemented and has passed unit and responsive UI
verification. Phase 3 adds optional local-image delivery through the user's
configured WordPress media library without introducing a persistent cleanup
queue.

## Goal

Add an independent `콘텐츠 > SNS` composer that publishes a user-written post
immediately to one or more configured Buffer channels. This is a manual content
feature for every user, not an extension of RSS-based SNS automation.

## Product Boundary

Manual SNS publishing and automatic SNS distribution share the Buffer
integration, but not their activation or workflow state.

- Manual publishing does not require `SNS_PUBLISH_ENABLED`.
- Manual publishing does not check the SNS automation capability.
- Manual publishing does not discover RSS entries or read/write the SNS Google
  Sheet.
- Manual publishing requires a saved Buffer API key and at least one saved
  Buffer channel.
- Only immediate Buffer publishing is supported. Buffer queue and scheduled
  publishing are out of scope.
- Any subset of the configured channels may be selected, up to the existing
  Buffer batch limit of three.

## Phases

### Phase 1: Manual Composer and Immediate Publishing

- Add `SNS` beneath `콘텐츠` in the primary navigation.
- Load the saved Buffer channel list without exposing the Buffer API key.
- Let the user select multiple available channels. Nothing is selected by
  default to reduce accidental cross-posting.
- Provide one editable post body.
- Accept one optional public HTTPS image URL, with preview and remove controls.
- Validate each selected channel before publishing:
  - channel must be one of the saved channels;
  - disconnected or locked channels cannot be used;
  - unsupported and video-only services cannot be used;
  - body must fit each channel's character limit without silent truncation;
  - an image-required service such as Instagram requires an image URL.
- Show a final confirmation and publish through Buffer `shareNow`.
- Return a per-channel success or failure result so partial failure is visible.

### Phase 2: Chat Model Optimization

- Add an explicit `AI 최적화` action backed by the resolved Chat Model role.
- Preserve the current editor value immediately before replacing it.
- Keep a single editor and provide a reliable one-step
  `AI 최적화 전으로 되돌리기` action. Keyboard undo may supplement this but is
  not the only recovery mechanism.
- Prompt goals:
  - preserve intent, tone, and facts;
  - correct spelling and spacing;
  - improve readability, opening hook, and social discoverability;
  - avoid invented claims, clickbait, and excessive promotion;
  - fit the shortest selected channel limit;
  - add up to five directly relevant, non-duplicated hashtags;
  - return only the final post text.
- AI execution is user-triggered and may incur model cost.
- Use exactly one model attempt. Optimization failure leaves the editor and the
  manual publish path unchanged; there is no automatic model fallback.

### Phase 3: WordPress-backed Local Image

- Keep a public HTTPS URL as the default image input.
- Enable a one-file local image input only when WordPress URL, user ID, and
  application password are all configured.
- Upload the selected image to the WordPress media library before calling
  Buffer. If upload fails, stop without attempting any SNS post and tell the
  user to use a URL or remove the image.
- Send the returned public WordPress media URL to Buffer.
- For each accepted Buffer post ID, poll the Buffer post query until every post
  reaches `sent` or `error`.
- Delete the temporary WordPress media after all Buffer posts reach either
  terminal state. Buffer success and Buffer failure use the same cleanup path.
- If status polling times out, the app exits, or WordPress deletion itself
  fails, accept that an orphaned media item may remain. Do not add a database,
  local job journal, startup recovery, or scheduled garbage collector.
- Support one local image up to 10 MB in png, jpg/jpeg, webp, or gif format.

### Later Optional Enhancements

- Failed-channel-only retry.
- Draft autosave or a manual recent-drafts list.
- More AI optimization modes.
- Channel-specific post variants.

## API Contract

### `GET /api/v1/social/manual/config`

Returns only public composer configuration:

```json
{
  "configured": true,
  "local_media_available": true,
  "ai": {
    "available": true,
    "model_name": "Gemini 3.6 Flash"
  },
  "channels": [
    {
      "id": "buffer-channel-id",
      "name": "Account Name",
      "service": "threads",
      "avatar": "https://...",
      "is_disconnected": false,
      "is_locked": false,
      "supported": true,
      "limit": 500,
      "image_required": false
    }
  ]
}
```

The API key is never returned to the browser.

### `POST /api/v1/social/manual/optimize`

Request:

```json
{
  "channelIds": ["buffer-channel-id"],
  "text": "Original post body"
}
```

The service authorizes the selected IDs against the saved Buffer channel list,
then uses the shortest selected channel limit for the Chat Model prompt. The
response contains only public result metadata:

```json
{
  "success": true,
  "optimized_text": "Optimized post body #관련태그",
  "model_name": "Gemini 3.6 Flash",
  "max_length": 300,
  "within_limit": true
}
```

This endpoint neither publishes to Buffer nor mutates the saved draft.

### `POST /api/v1/social/manual/publish`

Request:

```json
{
  "channelIds": ["buffer-channel-id"],
  "text": "Post body",
  "imageUrl": "https://example.com/public-image.jpg"
}
```

For a local image, `imageUrl` is omitted and `localImage` is sent instead:

```json
{
  "channelIds": ["buffer-channel-id"],
  "text": "Post body",
  "localImage": {
    "fileName": "photo.png",
    "mimeType": "image/png",
    "base64Data": "data:image/png;base64,..."
  }
}
```

Local media is accepted only while WordPress is fully configured. The response
may include `media_cleanup` for user-visible cleanup diagnostics, but never
returns WordPress credentials.

Response contains normalized per-channel results. A mixed result is a successful
API response with `success: false` and both success and failure entries; transport
or validation failures use an API error response.

## Architecture

```text
UI manual SNS composer
  -> manual SNS UI API route
  -> Manual SNS Service
       -> configured Buffer channel allow-list
       -> optimize: SNS AI Service -> resolved Chat Model role
       -> publish: SNS service policy validation
            -> optional WordPressClient.uploadMedia()
            -> BufferClient.shareNowMany()
            -> BufferClient.getPostsByIds() polling
            -> WordPressClient.deleteMedia()
```

The manual service owns user-input validation and channel authorization.
`BufferClient` remains a transport gateway and must not learn about UI state,
RSS rows, Google Sheets, or licensing. `SNS AI Service` owns prompt construction
and Chat Model execution but has no Buffer publishing authority.

## Safety and UX Decisions

- The publish button says how many channels will receive the post.
- The user confirms the channel names, text, and image presence immediately
  before the external side effect.
- The service validates again; browser validation is only guidance.
- Image URLs must use HTTPS. The UI explains that Buffer needs a public, direct
  image URL.
- Local image upload failure never silently degrades into text-only publishing.
- Temporary media cleanup is best effort. A status timeout intentionally leaves
  the media in WordPress because Buffer delivery is not known to be terminal.
- Buffer post creation keeps the normal 15-second transport timeout for
  text-only requests but allows 60 seconds when Buffer must fetch remote media.
  After a create-request timeout, the service queries recent posts without
  Buffer's unreliable server-side start-date filter and matches every selected
  channel by exact text. Recovery lookup runs up to three times without ever
  resending the create mutation. Complete recovery resumes status polling and
  cleanup; an unresolved timeout retains the WordPress media instead of risking
  a broken or duplicate post.
- Manual text is never silently shortened. The UI and API identify every channel
  whose limit is exceeded.
- The browser stores the manual composer's selected Buffer channel IDs in Local
  Storage. On reload it restores only IDs that still exist and are available in
  the current Buffer channel catalog; an explicitly empty selection is retained.
- Buffer introduction and signup links remain available as subdued text links
  in both the SNS composer header and the Buffer connection section. They do not
  occupy a banner or interrupt the publishing workflow.
- AI optimization replaces the single editor only after a successful response.
  The UI stores the immediately preceding value and exposes an explicit one-step
  restore action; browser keyboard undo is supplementary rather than required.
- The optimization prompt treats the draft as editing material, not executable
  instructions, and prohibits invented facts, links, numbers, and clickbait.
- AI availability and model name may be exposed to the browser; API keys and
  connection config remain server-side.
- The editor remains intact after partial or total failure.

## Verification

- Unit-test configuration exposure and the absence of automation/license gates.
- Unit-test configured-channel allow-list enforcement.
- Unit-test character limits, image-required services, unsupported services,
  HTTPS image validation, and the three-channel limit.
- Unit-test per-channel Buffer payloads and partial results.
- Unit-test Chat Model availability, prompt constraints, response parsing, one
  attempt execution, shortest-channel limit delegation, and secret exclusion.
- Verify desktop and narrow layouts, empty configuration, image preview removal,
  confirmation, success, and partial failure states.
- Verify a real user-triggered optimization, explicit restore, and subsequent
  manual publishing before archiving this plan.
