# Hello World Core Plugin

This is a real, bundled Core Plugin that serves as a small reference for the
BlogGenius Plugin contract. It can be used to try Plugin discovery, operation
listing, selection, Host registration, and invocation without an AI provider or
external account.

## Manifest

`package.json#bloggeniusPlugin` declares the Plugin ID, Host API range, operation
description, JSON input/output schemas, and requested capabilities. Package
name and version stay in the package metadata. The manifest is data; it does not
execute the Plugin.

## Operation

`hello.say` accepts `{ "name": "Ada" }` and returns
`{ "message": "Hello, Ada!" }`. It needs no Host capabilities.

From BlogGenius code, the operation can be tried through the shared runtime:

```js
const { createCorePluginRuntime } = require('./src/composition/core-plugin-runtime');

const runtime = createCorePluginRuntime();
const { executeOperation } = runtime.ensurePlugins(['hello-world']);
const result = await executeOperation('hello-world', 'hello.say', { name: 'Ada' });
// { message: 'Hello, Ada!' }
```

The manifest schemas are the Host's authoritative validation contract. The Host
validates input and output with JSON Schema 2020-12; the implementation module
contains only the operation executor. Unknown schema keywords, unsupported
Host API ranges, and remote schema references are rejected before the Plugin
entrypoint loads.
