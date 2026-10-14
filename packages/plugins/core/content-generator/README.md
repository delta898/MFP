# `@bloggenius/content-generator`

A provider-neutral text generation Plugin package for the BlogGenius Plugin manifest contract. The Host validates the declared operation schemas, then the Plugin checks domain semantics and delegates generation to a host-injected function. It does not select a model, store credentials, or make network requests itself.

## Requirements

- Node.js 20 or newer
- A host-supplied `generateText({ prompt, signal })` function
- The BlogGenius Plugin Host manifest contract for JSON Schema 2020-12 validation and operation dispatch

## Usage

```js
const { createPlugin } = require('@bloggenius/content-generator');

const plugin = createPlugin({
  async generateText({ prompt, signal }) {
    // The host owns provider/model selection and credentials.
    return await textProvider.generate({ prompt, signal });
  }
});

// The BlogGenius composition root binds this operation implementation to the
// manifest in package.json before registering it with Plugin Host.
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

The prompt and generated text must be non-empty strings. The host's `AbortSignal` is forwarded to the injected provider function when present. Provider failures pass through to the host; the package does not retry, log prompts, or retain generated content. The public input/output shapes and requested `ai.transport` capability are declared in `package.json#bloggeniusPlugin`.

## Scope

This package intentionally contains no provider SDK or BlogGenius-private imports. Provider configuration, model selection, credentials, cost policy, prompt composition, retry policy, asynchronous jobs, and product workflows belong to the host or an Application. The package is a first-party pilot; a stable external SDK or compatibility guarantee has not yet been declared.
