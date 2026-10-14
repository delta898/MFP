# `@bloggenius/content-generator`

A provider-neutral text generation Plugin package for the BlogGenius Plugin descriptor contract. It validates a prompt, delegates generation to a host-injected function, and validates the returned text. It does not select a model, store credentials, or make network requests itself.

## Requirements

- Node.js 20 or newer
- A host-supplied `generateText({ prompt, signal })` function
- The BlogGenius Plugin Host contract for input/output validation and operation dispatch

## Usage

```js
const { createContentGeneratorPlugin } = require('@bloggenius/content-generator');

const plugin = createContentGeneratorPlugin({
  async generateText({ prompt, signal }) {
    // The host owns provider/model selection and credentials.
    return await textProvider.generate({ prompt, signal });
  }
});

// Register `plugin` with a compatible Plugin Host, then invoke:
// pluginHost.execute('content-generator', 'text.generate', { prompt: '...' });
```

## Operation contract

### `text.generate`

Input:

```js
{ prompt: string }
```

Output:

```js
{ text: string }
```

The prompt and generated text must be non-empty strings. The host's `AbortSignal` is forwarded to the injected provider function when present. Provider failures pass through to the host; the package does not retry, log prompts, or retain generated content.

## Scope

This package intentionally contains no provider SDK or BlogGenius-private imports. Provider configuration, model selection, credentials, cost policy, prompt composition, retry policy, asynchronous jobs, and product workflows belong to the host or an Application. The package is a first-party pilot; a stable external SDK or compatibility guarantee has not yet been declared.
