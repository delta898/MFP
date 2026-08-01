# Manual SNS Publishing Plan

## Status

Phase 1 implementation and runtime verification are complete. Phase 2 Chat
Model optimization remains planned as an optional enhancement.

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

### Phase 3: Optional Enhancements

- Failed-channel-only retry.
- Draft autosave or a manual recent-drafts list.
- More AI optimization modes.
- Channel-specific post variants.
- Local media upload only after a managed public media-storage contract exists.

## Phase 1 API Contract

### `GET /api/v1/social/manual/config`

Returns only public composer configuration:

```json
{
  "configured": true,
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

### `POST /api/v1/social/manual/publish`

Request:

```json
{
  "channelIds": ["buffer-channel-id"],
  "text": "Post body",
  "imageUrl": "https://example.com/public-image.jpg"
}
```

Response contains normalized per-channel results. A mixed result is a successful
API response with `success: false` and both success and failure entries; transport
or validation failures use an API error response.

## Architecture

```text
UI manual SNS composer
  -> manual SNS UI API route
  -> Manual SNS Service
       -> configured Buffer channel allow-list
       -> SNS service policy validation
       -> BufferClient.shareNowMany()
```

The manual service owns user-input validation and channel authorization.
`BufferClient` remains a transport gateway and must not learn about UI state,
RSS rows, Google Sheets, or licensing.

## Safety and UX Decisions

- The publish button says how many channels will receive the post.
- The user confirms the channel names, text, and image presence immediately
  before the external side effect.
- The service validates again; browser validation is only guidance.
- Image URLs must use HTTPS. The UI explains that Buffer needs a public, direct
  image URL.
- Manual text is never silently shortened. The UI and API identify every channel
  whose limit is exceeded.
- The editor remains intact after partial or total failure.

## Verification

- Unit-test configuration exposure and the absence of automation/license gates.
- Unit-test configured-channel allow-list enforcement.
- Unit-test character limits, image-required services, unsupported services,
  HTTPS image validation, and the three-channel limit.
- Unit-test per-channel Buffer payloads and partial results.
- Verify desktop and narrow layouts, empty configuration, image preview removal,
  confirmation, success, and partial failure states.
