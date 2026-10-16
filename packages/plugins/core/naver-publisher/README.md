# Naver Publisher Core Plugin

An in-process Core Plugin that publishes prepared content through the Naver Blog editor. It imports no BlogGenius-private modules. The Host injects an authenticated browser-session factory and sanitized editor settings; Naver session state is not part of the operation input or output.

## Public operation

`posts.publish` accepts a title, normalized content blocks, image assets as base64, an optional category, and a requested status (`draft`, `publish`, or `schedule`). Image blocks reference an asset by key and may include a `caption`; the publisher enters that text in the Naver image description directly beneath the image. The result reports the effective status, an optional post URL, and recoverable warnings. Input and output are validated by the Plugin Host against `package.json#bloggeniusPlugin`.

Body `newline` blocks preserve authored line boundaries in order. The first newline after a Markdown title is represented by the title's Enter transition into the body; additional leading newline blocks remain explicit body spacing. A heading applies its format and collapses the selection without adding Enter. The publishing adapter materializes the source line break after a heading when the Markdown parser omitted it, and the Plugin processes that newline block to enter the following paragraph.

The Plugin reports Host-mediated progress with generic phases and stable stage identifiers. The Host supplies the operation `AbortSignal`. Cancellation closes the browser session; it cannot undo a draft save or publication Naver already accepted.

The Plugin logs publishing phase progress and recoverable editor warnings. It does not log individual keyboard events or manuscript text.

## Host dependencies

```js
const plugin = createPlugin({
  createAuthenticatedNaverSession: async ({ headless, signal }) => ({
    page, // Playwright-compatible Page created with the Host-owned login session
    persistAuthState: async () => {},
    close: async ({ keepOpen }) => {}
  }),
  getSettings: () => ({ writeUrl, headless, waitUploadMs, typingDelayMs }),
  logger
});
```

The Host resolves and persists the Naver login session. It must not expose the authentication file path or session contents to operation callers or logs. Browser lifecycle and account configuration remain Host-owned dependencies.

This package does not claim a stable external SDK or provide an untrusted-code sandbox. Bundled Core Plugins execute in-process.
