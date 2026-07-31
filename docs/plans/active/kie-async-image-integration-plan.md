# KIE.ai Async Image Integration Plan

## Goal

Add KIE.ai as an image provider through a reusable asynchronous task boundary.
The initial implementation validated one model:

- display name: `Nano Banana 2`
- model ID: `nano-banana-2`
- transport: `kie_market_image_jobs`

The first profile-registry extension adds:

- display name: `Seedream 5 Pro`
- model ID: `seedream/5-pro-text-to-image`
- transport: `kie_market_image_jobs`

The second profile-registry extension adds:

- display name: `GPT Image 2`
- model ID: `gpt-image-2-text-to-image`
- transport: `kie_market_image_jobs`

The third profile-registry extension adds:

- display name: `Nano Banana Pro`
- model ID: `nano-banana-pro`
- display name: `Seedream 4.5`
- model ID: `seedream/4.5-text-to-image`
- transport: `kie_market_image_jobs`

The implementation must preserve the existing `callWritingImage()` contract:
callers await one Promise and receive a local image path.

## KIE Contract

Phase 1 uses the KIE Market job API:

- submit: `POST https://api.kie.ai/api/v1/jobs/createTask`
- query: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...`
- authentication: `Authorization: Bearer <KIE API key>`
- result: temporary URL in the successful task's `resultJson`

Nano Banana 2 uses:

```json
{
  "model": "nano-banana-2",
  "input": {
    "prompt": "...",
    "image_input": [],
    "aspect_ratio": "4:3",
    "resolution": "1K",
    "output_format": "png"
  }
}
```

Seedream 5 Pro uses:

```json
{
  "model": "seedream/5-pro-text-to-image",
  "input": {
    "prompt": "...",
    "aspect_ratio": "4:3",
    "quality": "basic",
    "output_format": "png",
    "nsfw_checker": true
  }
}
```

BlogGenius maps 1K to `basic` and 2K to `high`.

GPT Image 2 uses:

```json
{
  "model": "gpt-image-2-text-to-image",
  "input": {
    "prompt": "...",
    "aspect_ratio": "4:3",
    "resolution": "1K"
  }
}
```

BlogGenius currently exposes 1K and 2K for this profile. KIE also documents 4K,
but it remains outside the current BlogGenius image-size contract.

Nano Banana Pro uses the same documented input shape as Nano Banana 2 but keeps
its distinct Market model ID:

```json
{
  "model": "nano-banana-pro",
  "input": {
    "prompt": "...",
    "image_input": [],
    "aspect_ratio": "4:3",
    "resolution": "1K",
    "output_format": "png"
  }
}
```

Seedream 4.5 uses:

```json
{
  "model": "seedream/4.5-text-to-image",
  "input": {
    "prompt": "...",
    "aspect_ratio": "4:3",
    "quality": "basic",
    "nsfw_checker": false
  }
}
```

BlogGenius maps 1K to `basic` and 2K to `high` for Seedream 4.5.

Contract sources:

- <https://docs.kie.ai/market/google/pro-image-to-image>
- <https://docs.kie.ai/market/seedream/4-5-text-to-image>

Only text-to-image is enabled. Reference images, callbacks, editing, and multiple
outputs are outside phase 1.

## Runtime Boundary

The runtime is split into three layers:

1. A provider-independent async job runner owns polling intervals, terminal-state
   handling, transient query retries, and the 15-minute total deadline.
2. The KIE Market image adapter owns fixed endpoints, authentication, request and
   response shapes, task-state normalization, and result download.
3. Each local request profile owns its model-specific input fields.

The local request-profile registry now owns GPT Image 2, Nano Banana 2, Nano
Banana Pro, Seedream 5 Pro, and Seedream 4.5 builders. The catalog may select
only a model ID shipped in this registry.

The remote Model Catalog may select `kind=image + provider=kie +
transport=kie_market_image_jobs`. It cannot change the KIE host, endpoints,
headers, state parser, polling policy, or request profile.

## Retry and Billing Safety

Paid task submission is not treated like a synchronous request retry:

- `createTask` is submitted once with a 30-second HTTP timeout.
- A submission timeout or server error is ambiguous and is not automatically
  resubmitted.
- After a task ID is received, only that task ID is queried.
- Poll-query network errors, HTTP 429, and HTTP 5xx may be retried without creating
  another generation.
- Authentication, not-found, and validation failures are terminal.
- Result download may be retried three times because it does not create a new task.
- A failed or timed-out task is never regenerated automatically.

This prevents the existing `retries=3` image argument from creating two or more
billable KIE tasks for one image.

## Polling and Timeout

The foreground task deadline is 15 minutes and is not multiplied by three.

Polling intervals:

- elapsed below 30 seconds: 2 seconds
- elapsed below 60 seconds: 3 seconds
- elapsed below 3 minutes: 5 seconds
- remaining time: 10 seconds

Each query has a 15-second HTTP timeout. A maximum of five consecutive transient
query errors is allowed. The result download has a 120-second timeout and up to
three safe retries.

Reaching the deadline means BlogGenius stopped waiting; it does not mean KIE
cancelled the task.

The polling loop does not use the generic seven-second heartbeat logger. It logs
task submission once, a pending summary at most once every 60 seconds, meaningful
25% progress milestones, and the terminal result. This avoids flooding the recent
activity feed when KIE repeatedly returns `generating` with 0% progress.

## Local Job Journal

Once a task ID is received, BlogGenius writes an atomic local journal at:

`data/async-ai-jobs.json`

The journal stores only operational recovery data:

- task ID
- provider, transport, and model ID
- normalized state
- created/updated timestamps
- failure summary when present

It never stores API keys, prompts, authorization headers, or image bytes. Timeout
records keep the task ID so a future recovery UI or command can query the task
without submitting another paid generation.

## Catalog and UI

KIE.ai becomes selectable under both text and image provider lists. The image list
contains GPT Image 2, Nano Banana 2, and Seedream 5 Pro. The existing
provider-level free connection check continues to call the KIE credit endpoint and
must not claim model-generation verification.

Future KIE image models are added only after their local request profiles and real
API compatibility are verified.

## Validation

Before a real paid request:

1. Unit-test the async runner's interval, timeout, retry, success, and failure paths.
2. Unit-test KIE submit/query parsing and safe download retries.
3. Unit-test Nano Banana 2 request fields and fixed endpoints.
4. Verify the trusted remote-catalog route and provider/model order.
5. Run the relevant regression suite.

The first real API test requires explicit approval and records the credit balance
before and after one 1K image generation.

## Real API Validation

Validated on 2026-07-31 with an explicitly approved paid request:

- model: `nano-banana-2`
- request: text-to-image, `4:3`, `1K`, PNG
- submission count: one
- terminal state: `downloaded`
- elapsed time: 52.05 seconds
- output size: 2,271,492 bytes
- KIE credit balance: 79.9 before, 71.9 after
- charged amount: 8 credits
- journal: task ID and `downloaded` state persisted without prompt or API key

The generated PNG was opened successfully and visually inspected. This validates
the production `callWritingImage()` dispatch, one-time submission, adaptive
polling, KIE result parsing, safe result download, local file write, and job
journal path together.

Seedream 5 Pro was also validated on 2026-07-31 with an explicitly approved paid
request:

- model: `seedream/5-pro-text-to-image`
- request: text-to-image, `4:3`, `1K` (`quality=basic`), PNG
- submission count: one
- terminal state: `downloaded`
- elapsed time: 147.26 seconds
- output size: 2,418,166 bytes
- KIE credit balance: 71.9 before, 64.9 after
- charged amount: 7 credits
- journal: task ID and `downloaded` state persisted without prompt or API key

The generated PNG was opened successfully and visually inspected. KIE reported
`generating` with 0% progress throughout most of this request, so consumers must
treat the normalized state—not the optional percentage—as authoritative.

GPT Image 2 was validated on 2026-07-31 with an explicitly approved paid request:

- model: `gpt-image-2-text-to-image`
- request: text-to-image, `4:3`, `1K`, PNG
- submission count: one
- terminal state: `downloaded`
- elapsed time: 89.69 seconds
- output size: 2,122,389 bytes
- KIE credit balance: 64.9 before, 58.9 after
- charged amount: 6 credits
- journal: task ID and `downloaded` state persisted without prompt or API key

The generated PNG was opened successfully and visually inspected. The requested
Korean sign text `오늘도 좋은 하루` was rendered exactly, and the bookstore cafe,
foreground coffee, open book, plants, warm wood, and late-afternoon light all
matched the prompt.
