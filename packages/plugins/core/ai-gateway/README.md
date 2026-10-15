# `@bloggenius/ai-gateway`

An in-process Core Plugin and standalone provider-neutral Gateway module. It
normalizes text and image generation across the provider routes listed by
`describeSupport()` and exports operation implementations through the shared
BlogGenius manifest contract.

## Security boundary

The Gateway never accepts an API key, provider endpoint, authorization header,
or BlogGenius configuration object. The Host injects a narrow transport with
fixed provider endpoints and resolves credentials internally. The Plugin sees
only `{ provider, modelId }`, request/response data, and its cancellation and
progress context. This protects credentials from normal operation inputs; the
in-process Plugin system is not a sandbox for untrusted code.

## Contract

`package.json#bloggeniusPlugin` declares `text.generate` and `image.generate`
with JSON Schema 2020-12 inputs and outputs. Applications can query the
separate, immutable `describeSupport()` inventory and intersect it with their
own model catalog before invocation:

```js
const { createPlugin, describeSupport } = require('@bloggenius/ai-gateway');

const support = describeSupport();
const plugin = createPlugin({ transport: hostAiTransport });
const textOperation = plugin.operations['text.generate'];
```

Model names, visibility, and product eligibility remain the Application's
catalog concern. `describeSupport()` is discovery metadata: its documented
model options are hints, not a runtime capability verdict. The Gateway does
not reject a model request merely because an option is absent from those lists;
it forwards provider-native options and returns the Provider's runtime error.
Where an adapter cannot map an option to its standard field (for example, an
arbitrary ratio to an OpenAI-compatible pixel size), it forwards the requested
ratio in best-effort form so the Provider can accept or reject it. Route
availability and Gateway-owned payload limits remain enforceable by the
Gateway. An image result is JSON-safe inline
base64 with a 10 MiB decoded limit per image; Hosts can later replace this
mapping with scoped asset handles without changing provider adapters.

KIE image generation is asynchronous. The Gateway submits once, polls with
bounded safe retries, downloads the completed result, reports coarse progress
through the Host callback, and stops local work on `AbortSignal`. Cancellation
does not claim that the remote job stopped or that credits were refunded.
Generation submissions are not retried automatically. Public errors use
stable `AI_GATEWAY_*` codes and omit provider response bodies, prompt text, and
credentials.

The package has no BlogGenius-private or third-party runtime imports. Its Host
transport interface is an explicit constructor dependency and can be replaced
by another compatible Host implementation.
