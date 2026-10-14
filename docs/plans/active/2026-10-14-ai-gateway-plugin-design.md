# Shared Plugin Contract and AI Gateway Design

- Branch: `codex/feat/ai-gateway-plugin-design`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`2b6d651a`)
- Status: common Core manifest/Host contract and Hello World reference complete; AI Gateway implementation remains future work

## User need and goal

Design the common Plugin manifest/runtime contract and the Host discovery → validation → registration → operation discovery flow first. Core and future Community Plugins should implement the same Plugin contract; their distribution source, trust policy, and management may differ. Then design a self-contained AI Gateway module on that agreed foundation.

The goal is a coherent, implementation-ready platform contract and AI Gateway boundary. The common Plugin contract is now implemented across bundled Core packages and exercised through the Core Hello World Plugin.

## Scope

- Inspect current Core Plugin manifest/registry/runtime contracts and document the missing discovery lifecycle.
- Define a shared static manifest, runtime implementation descriptor, API compatibility, operation I/O contracts, discovery, validation, registration, and operation discovery.
- Define which Core steps can be pre-approved/short-circuited by trusted built-in provenance while retaining the same contract.
- Define the common Core candidate→validation→load→registration path. Do not design or implement Community installation, scanning, approval UX, or package management in this slice.
- Inspect provider/model catalog, credential/configuration ownership, AI call paths, Content Generator pilot, and generation Applications.
- Define the Gateway's responsibility, supported operation discovery, configuration boundary, input/output and error contracts, and provider/model capability reporting atop the shared contract.
- Define how the external or product Model Catalog relates to the Gateway's own supported providers/models, and how an Application resolves availability and compatibility.
- Add a real bundled Core Hello World Plugin using a declarative package manifest and the current Host-compatible runtime shape as a focused contract reference.
- Compare in-process Plugin execution with a remote API only as an installation/runtime deployment choice; default assumption is in-process Plugin in BlogGenius.
- Record the recommended decisions, tradeoffs, and a vertical verification slice in this plan.

## Explicit non-goals

- Implementing the AI Gateway, provider adapters, settings UI, or model catalog changes in the common Plugin manifest/Host slice.
- Implementing filesystem scanning, Community install/update/removal, trust UI, or process isolation.
- One Plugin per provider.
- Assuming the Gateway is a REST service or that provider secrets are passed from the UI.
- Moving product-specific BlogGenius prompts, quota, user preferences, or manuscript workflow into the independently reusable module without an explicit contract decision.
- Reworking existing Content Generator or Image Generator behavior as part of discovery.
- Version changes, merge into dev, push, or release.

## Initial design constraints and decisions

- Treat the AI Gateway as an independent, reusable module/product that BlogGenius bundles as a Core Plugin.
- Expose unified multi-provider AI access; avoid provider-per-Plugin fragmentation.
- Text and image generation may be capabilities of the same Gateway product. Internal separation is an implementation choice, provided the public contract remains clear.
- The Model Catalog and Gateway have distinct responsibilities and discoverable inventories. The Application must be able to select supported/compatible models and handle catalog/Gateway mismatches deliberately.
- Keep provider-specific transport details behind the Gateway boundary.
- The shared Core manifest/Host implementation began after the user explicitly requested a real bundled Core Hello World Plugin to experiment with. AI Gateway implementation remains out of scope.
- User approved adding an optional Host-mediated `reportProgress(event)` function to the Plugin execution context on 2026-10-14; operation payload schemas remain callback-free.
- User approved omitting `connectionRef` from the v1 public contract on 2026-10-14. The Application selects `{ provider, modelId }`; BlogGenius Host resolves the provider's configured credential without exposing a connection-selection concept. Add one only if a concrete multiple-connection selection need arises.
- User approved model-specific image count and byte-size limits in the support manifest, with a default image count of one, on 2026-10-14.
- User approved stable `AI_GATEWAY_*` error codes, a retryability indicator, and suppressing raw provider error bodies from public errors on 2026-10-14.
- User approved no automatic retries for generation submissions; Gateway may perform bounded retries only for safe status reads and result downloads. Application owns any new generation attempt, on 2026-10-14.
- User approved excluding user-defined OpenAI-compatible endpoints from Gateway v1; consider a BlogGenius-specific extension separately if needed, on 2026-10-14.
- User approved provider-enforced JSON response mode only on routes advertising support; Application owns business-schema validation, and JSON Schema-constrained output is outside v1, on 2026-10-14.
- User approved an optional normalized `providerRequestId` diagnostic field when the provider supplies one; prompts, keys, and raw provider error bodies remain excluded, on 2026-10-14.
- User approved prioritizing the shared manifest/descriptor and Host discovery→validation→registration→operation-discovery contract before finalizing the AI Gateway contract, on 2026-10-14.
- User approved treating Core and future Community Plugins as users of the same Plugin specification while allowing different source, trust, distribution, and management policies, on 2026-10-14. Community-specific installation/discovery policy is deferred.
- User approved implementing Hello World as a real bundled Core Plugin (rather than an examples-only package) so it can be used to experiment with the Plugin system and potentially become an Easter egg later, on 2026-10-14.

## Investigation progress

- Branch created from the active parent feature branch after the WordPress writing/publishing vertical slice was merged.
- Initial baseline: Core packages exported a factory, metadata, and parser-bearing operations. The current implementation replaces that runtime contract with manifest-backed schemas and executor-only operations for all bundled Core packages.
- AI behavior is not yet behind a reusable Gateway. Provider transports and request construction are split across src/ai/transport-registry.js, src/ai/model-runtime-policy.js, src/utils.js, and src/ai/kie-market-image.js; image execution also has a separate src/image-service.js path.
- Settings select TEXT_MODEL / IMAGE_MODEL and hold provider API keys. Runtime model definitions resolve from the product model catalog plus local transport registry. This BlogGenius configuration model must not become an implicit dependency of a reusable Gateway.
- The remote Model Catalog owns product model metadata (names, lifecycle, capabilities and selectable entries). It deliberately cannot define arbitrary URLs, headers, parsers, or executable behavior. The runtime allowlists kind + provider + transport and, for some routes, model IDs.
- Content Generator is a thin text call wrapper with a host-injected function. It has no provider/model catalog, credentials, transport, or image operation, and should not constrain the new Gateway contract.
- The Core registry now reads and validates package metadata without importing implementation code, then loads only the selected Plugin package.

## Initial Plugin contract baseline and gap analysis

### What exists

- `src/platform/plugin-contract.js` accepts a runtime object with `id`, `name`, `version`, and a non-empty map of operations. Each operation supplies executable synchronous `input.parse` and `output.parse` functions plus an async-capable `execute` function.
- `src/platform/plugin-host.js` validates that runtime shape, rejects duplicate IDs, registers instances, dispatches operations, validates input/output with the parser functions, tracks active calls for disable/drain, and lists operations for registered enabled Plugins. Execution context currently carries only `AbortSignal`.
- `src/composition/core-plugin-registry.js` is an explicit code-owned array of Core factories. It imports each package's JavaScript module to obtain both its factory and `PLUGIN_METADATA`; it is not a filesystem scanner or code-free manifest reader. `src/composition/plugin-runtime-composition.js` selects IDs from that array, constructs them with injected dependencies, and registers the returned objects with the Kernel Host.
- Core metadata exposes operation IDs and descriptions, while runtime parsers and implementations are executable code; no package manifest currently declares machine-readable schemas, Host API compatibility, or required Host capabilities.
- Therefore Core discovery is static and trusted; there is no filesystem/package scan. Runtime `listOperations()` is post-registration operation discovery, not candidate discovery.

### Still deferred after the Core contract slice

- Community trust/approval, permissions, isolation, install/update/removal, rollback, and lifecycle persistence.
- Filesystem scanning and package path/entrypoint containment for Community packages.
- A published, SemVer-governed third-party Plugin SDK/release policy.
- Host-enforced capability grants and untrusted Community execution isolation.

The current Host is explicitly not a security sandbox. Core code is trusted. A future Community source may share the manifest and runtime API, but must not be considered safe merely because it passes the same contract validation; its loading/isolation and permission policy is a separate trust boundary.

## Recommended shared Plugin contract

### Standard methodology and design choice

There is no single cross-runtime Plugin standard that BlogGenius can adopt unchanged. Mature systems use a similar pattern: a declarative manifest for identity, compatibility, and contributions; a separate runtime entrypoint/API for executable behavior; and a Host registry/lifecycle for activation and availability. VS Code uses `package.json` for extension identity, entrypoint, Host API compatibility, and static contribution declarations, then activates code to register behavior. OSGi formalizes bundle metadata and a runtime service registry, with deeper Java classloading/module lifecycle than BlogGenius needs. These are precedents for the shape, not frameworks to import.

Use standardized building blocks where they fit: SemVer ranges for Plugin Host API compatibility, and JSON Schema 2020-12 for declarative JSON operation input/output contracts. Pin the schema dialect and validator behavior in the BlogGenius SDK so producers and Host agree; allow local schema references only, with no remote resolution during discovery. JSON Schema describes JSON data, so media bytes use a separate Host resource-handle contract rather than pretending `Uint8Array` is a JSON instance.

References: [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest), [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy), [JSON Schema specifications](https://json-schema.org/specification), [Semantic Versioning 2.0.0](https://semver.org/).

Use one contract with two representations so discovery need not execute Plugin code:

1. A **static manifest** is declarative data read during discovery. It identifies the package, compatible Host API, entrypoint, operations and their data schemas, and requested Host capabilities.
2. A **runtime implementation** exports a factory for the Host to call after source policy permits loading. It implements the operation IDs from the manifest and receives only explicitly granted capability APIs.
3. The **Host validates correspondence** between manifest and implementation before registration. Manifest is the one source of truth for operation IDs, descriptions, I/O schemas, and capability requests; runtime code supplies executors only.

Manifest: a `bloggeniusPlugin` block inside each Plugin's `package.json`. This avoids duplicating package name/version and keeps the BlogGenius contract beside the Node package entrypoint while leaving ordinary package metadata conventional. The Core implementation validates the manifest version, Host API SemVer range, operation declarations, and JSON Schema 2020-12 schemas before loading a selected package entrypoint.

```json
{
  "name": "@example/bloggenius-writer",
  "version": "1.2.0",
  "main": "dist/index.js",
  "bloggeniusPlugin": {
    "manifestVersion": 1,
    "id": "example-writer",
    "hostApi": "^1.0.0",
    "operations": {
      "text.generate": {
        "description": "Generate text from messages.",
        "inputSchema": { "type": "object", "required": ["model", "messages"] },
        "outputSchema": { "type": "object", "required": ["text"] },
        "capabilities": ["ai.transport"]
      }
    }
  }
}
```

`manifestVersion` versions the BlogGenius-specific manifest shape. `hostApi` is a SemVer range for the separately versioned Plugin Host API, not the app version. The public SDK pins JSON Schema 2020-12 and the subset/validator behavior it supports. Capabilities are operation-scoped so each operation receives only its approved Host APIs. Manifest schemas are plain data: no executable values, arbitrary URLs, credentials, scripts, or remote `$ref`s.

`main` points to the package entrypoint exporting `createPlugin()`. The Host calls the factory only after source policy allows activation. It returns an implementation map keyed by manifest operation IDs:

```js
export async function createPlugin() {
  return {
    operations: {
      'text.generate': {
        async execute(input, context) { /* capability-mediated work */ }
      }
    }
  };
}
```

The implementation does not redeclare ID, version, descriptions, schemas, or requested capabilities. Host binds it to the validated manifest and verifies the exact operation ID set. JSON Schema replaces executable `input.parse`/`output.parse` functions as the public validation/discovery contract; Plugin-specific semantic checks and intentional normalization remain inside `execute`. JSON Schema defaults are annotations, not automatic mutations: the Host does not coerce, trim, or insert defaults invisibly. All bundled Core packages now follow this contract; parser functions are not accepted by the Host.

The `hostApi` range declares Plugin Host API compatibility and is distinct from package SemVer and app version. Compatibility is checked before loading the package entrypoint.

Execution context is shared across all Plugins and includes `signal`, optional Host-mediated `reportProgress(event)` (approved in this task), and the capabilities granted to that operation. User payload schemas do not carry callbacks. Capability names in the manifest are requests; the Host decides and injects grants per operation.

Core source policy can mark bundled Plugins trusted and grant declared capabilities automatically. Community approval, permission UX, and enforcement remain future work.

### Shared discovery and registration flow

```text
Core catalog source (current) / future Community source adapter
  → discover candidate package metadata and manifest without importing code
  → validate manifest version, IDs, operation schemas, package identity, and Host API compatibility
  → apply source trust/capability policy
  → load selected/approved entrypoint and create runtime implementation
  → verify implementation operation IDs exactly match manifest
  → register executable operations with Plugin Host
  → expose manifest operations + runtime availability/lifecycle to Applications
  → Application invokes by pluginId + operationId
```

- Discovery produces static candidates and diagnostics; it does not mean loaded, registered, enabled, or trusted.
- Core uses the same manifest and validation/registration pipeline but its source adapter reads the app-bundled catalog and pre-approves first-party packages. This is the short path, not a different Plugin contract.
- Runtime registration remains an explicit Host action. A manifest can be listed before construction, but an operation is executable only after successful registration and while enabled.
- The Core source adapter can keep a code-owned list of package roots/IDs, read each package.json without importing the entrypoint, and defer module loading until the Application selects that Plugin. Host uses manifest-declared operation IDs, descriptions, schemas, and capabilities as the discovery source; registered runtime state contributes availability/lifecycle. This removes a separate manually maintained display/capability list.
- Expose two distinct views: discovered manifest operations (declared contracts, including not-loaded status) and Host-registered executable operations (runtime availability/enabled state). `listOperations()` must not imply that every discovered Plugin has been constructed or can currently execute.
- Core composition may instantiate only the Plugins required by an Application; discovery of bundled manifests does not require constructing every Plugin.
- A future Community scanner must not import code. It will need package-root and entrypoint containment checks, and discovery must not install dependencies or run package scripts. Community code loading/isolation is a later security design.
- A package's reported capability is descriptive. Enforced permission requires Host-controlled capability injection and, for untrusted code, a real process boundary; in-process JavaScript can otherwise use ambient Node APIs.
- Plugin operations exchange JSON-compatible values plus opaque Host `AssetRef`s for media. An `AssetRef` is `{ id: string }`; the Host resolves MIME type/size from its own record, never trusts caller-supplied metadata, and scopes access to the calling runtime. `assets.read(ref)` returns bytes and canonical metadata; `assets.write({ bytes, mimeType })` returns a ref. The independent AI Gateway library may use `Uint8Array` internally; its BlogGenius Plugin adapter maps bytes to/from Host assets.

### Core versus Community policy

| Concern | Shared contract | Core source policy now | Community source later |
|---|---|---|---|
| Manifest, operation schemas, Plugin API compatibility | Same | Same | Same |
| Discovery source | Source adapter | Static bundled registry | Installed-directory/catalog adapter, to be designed |
| Trust | Host policy | First-party trusted | Explicit origin/approval policy required |
| Capabilities | Declared per operation; granted by Host | Pre-granted by composition policy | User/admin grant plus enforceable isolation required |
| Loading and registration | Same runtime validation | Automatic in trusted startup/composition | Only after trust/policy succeeds |
| Install/update/remove | Not part of Plugin descriptor | App release owns bundled version | Future package manager lifecycle |

This draft adopts the user's direction that Core and Community share the Plugin specification. It does not assume they share distribution, trust, or isolation policy. Community-specific installation/discovery is explicitly deferred.

## AI Gateway design on the shared contract

The Gateway must be expressed as a package manifest with static operations and schemas. Its route support manifest remains a Gateway-specific domain API because provider/model capabilities are richer than Plugin operation discovery. The Application combines both: Plugin Host operation availability answers “can this operation execute?”; Gateway support answers “which provider/model/semantic options can it execute?”; Model Catalog answers “which models does BlogGenius allow/select?”

## Recommended Gateway boundary

BlogGenius Settings and credential storage
  → Application resolves selected Model Catalog entry against Gateway support
  → AI Gateway Plugin prepares a provider request through its internal adapter
  → Host-owned AI transport capability applies credentials and performs I/O
  → text.generate / image.generate returns normalized results

- AI Gateway owns provider protocol adapters, request/response conversion, provider-specific error normalization, cancellation propagation, and generation operations. It does not read BlogGenius globals, choose BlogGenius settings, write product data, or own prompts/quota/workflows.
- The Host owns secret storage and the credential-aware network boundary. The Gateway never receives raw API keys: the Host-injected AI transport applies provider authentication and does not return the key. The v1 operation uses `{ provider, modelId }`; the Host selects the configured credential for that provider. A connection-selection API can be added only if a concrete need arises.
- In-process Plugins are trusted code, not a security sandbox. This keeps keys out of operation inputs and limits transport authority but cannot protect against malicious code in the same process. The Host transport binds endpoints to approved provider configuration and rejects arbitrary URLs/auth headers.
- The Model Catalog owns selectable model metadata and lifecycle. It is not executable code and cannot supply arbitrary URLs, headers, or protocol behavior.
- Application owns model choice and compatibility resolution by intersecting Catalog entries with Gateway-supported routes/capabilities.

### Recommended v1 contract

The package factory returns a Plugin descriptor plus a direct support-query interface retained by the composition root:

```js
const gateway = createAiGateway({ transport });
pluginHost.register(gateway.plugin);
const support = gateway.describeSupport();
```

`describeSupport()` returns a versioned, immutable snapshot of executable routes and semantic capabilities. It is a package API, not a new Plugin operation or descriptor field: the current Plugin Host does not preserve extra descriptor fields. The Application intersects this snapshot with the product Model Catalog. Route identity is `{ provider, modelId, operation }`; display names, lifecycle and product eligibility remain Catalog-owned.

The Host-injected `transport` is a narrow request capability, not a credential resolver:

```ts
interface AiTransport {
  request(input: {
    provider: string;
    request: {
      method: 'POST' | 'GET';
      path: string;          // relative to a Host-approved provider endpoint
      query?: Record<string, string | number | boolean>;
      body?: unknown;
      responseType?: 'json' | 'bytes';
    };
    signal?: AbortSignal;
  }): Promise<{ status: number; headers?: Record<string, string>; body: unknown | Uint8Array }>;
}
```

The Host resolves the configured credential for `provider`, applies auth outside the Plugin, binds the endpoint to Host-approved provider configuration, and never returns the key. It rejects absolute URLs and caller-supplied authorization headers. The provider adapter translates model-specific behavior to this request shape and normalizes the response. This v1 shape assumes one Host-selected credential per provider; multi-connection selection would require a later explicit contract.

Plugin operations use a consistent model selector and separate text/image input contracts. As Plugin Host operations, binary inputs and outputs use `AssetRef`; the independent Gateway library API can use `Uint8Array` internally:

```ts
text.generate({
  model: { provider: string, modelId: string },
  input: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> },
  options?: { temperature?: number; maxOutputTokens?: number; responseFormat?: 'text' | 'json' }
}) -> {
  content: string;
  model: { provider: string; modelId: string };
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason?: string;
}

image.generate({
  model: { provider: string, modelId: string },
  input: { prompt: string; referenceImages?: AssetRef[] },
  options?: { aspectRatio?: string; size?: string; count?: number }
}) -> {
  images: AssetRef[];
  model: { provider: string; modelId: string };
}
```

The Plugin Host manages the lifetime of returned assets and validates every asset reference against the caller's scope. V1 is one-shot text and image generation. Provider-side asynchronous jobs (including KIE image jobs) are awaited inside `image.generate`; job IDs and provider task states are not part of the public result.

The current Plugin Host passes only `AbortSignal`. The user approved extending execution context with an optional Host-mediated `reportProgress(event)` capability, without putting callbacks in validated operation input. Proposed normalized events are `{ operationId, phase: 'submitted' | 'waiting' | 'generating' | 'downloading', progress?: number }`; do not include prompts, keys, raw provider payloads, or raw remote task IDs. Progress is advisory and need not be persisted by the Gateway.

Cancellation is standardized as an error with `code: 'AI_GATEWAY_CANCELED'` and `remoteOutcome: 'not_submitted' | 'unknown' | 'may_continue' | 'canceled'`. The Gateway always stops local waiting/download work on abort. It reports `canceled` only when the provider confirms remote cancellation; otherwise KIE-style jobs report `may_continue` or `unknown`. V1 does not promise remote cancellation or credit refunds.

All public failures use a stable `AI_GATEWAY_*` code and a boolean `retryable`; provider-specific bodies and secrets are not copied into the public error. Common categories include invalid input, unsupported route/capability, missing credential, authentication failure, rate limit, timeout, cancellation, and provider failure. Safe diagnostic fields may include a normalized HTTP status, retry delay, and optional `providerRequestId`; prompts, keys, and raw provider error bodies are excluded.

Generation submission calls are never automatically retried by the Gateway because an ambiguous timeout may mean the provider accepted and billed the request. The Gateway may use bounded retries for safe status reads and result downloads. `retryable` communicates classification; it does not itself trigger a retry. The Application owns any explicit new generation attempt.

Image `count` defaults to 1. The support manifest advertises per-route count range and image byte limits (input and output); Applications offer only values inside those limits, and Gateway validates again before sending or returning data. This avoids claiming a uniform limit across providers while keeping allocations bounded.

`responseFormat: 'json'` is accepted only for routes advertising provider-enforced JSON mode. Gateway returns the generated text; Application validates its business-specific shape. JSON Schema-constrained generation is outside v1.

This is the recommended v1 boundary, not a published/stable SDK contract. During implementation, define the exact capability vocabulary, concrete image byte ceilings, error-code enum, and progress-event validation in the shared SDK/schema, then pin them with contract tests. These are bounded implementation details; they do not change the ownership or flow described above.

### Key tradeoffs and rationale

1. Credential boundary: the Host owns credentials and applies authentication in its provider-bound transport. The in-process Gateway sees request/response data but never receives a raw API key; this is not a sandbox against malicious in-process code.
2. Support manifest vs model catalog: putting model IDs only in the catalog makes Gateway compatibility opaque; putting display/lifecycle metadata in Gateway duplicates product policy. Recommendation: Gateway declares executable route support and semantic capabilities; catalog declares product availability/display/lifecycle; Application intersects them.
3. Gateway packaging: provider adapters can be internal modules in one published Gateway package rather than separate provider Plugins. Recommendation: one product/package, multiple internal transport adapters behind stable generation operations.
4. Text and image: one Gateway package can expose both independent operations, preserving different schemas/provider support. Recommendation: same Gateway package, separate operation contracts.
5. Response abstraction: normalize a small useful core and preserve safe namespaced optional metadata, rather than exposing raw provider responses or flattening away all differences.

## Implemented shared Core Plugin contract

- Manifest: `package.json#bloggeniusPlugin`, with `manifestVersion`, `id`, `operations`, per-operation capabilities, and `hostApi` SemVer range. `package.json` owns package name/version and `main`; no duplicated fields.
- Schema: Ajv 2020 validates JSON Schema 2020-12; no network-resolved `$ref`s. Host schema validation is authoritative. No coercion/default insertion occurs implicitly; operation implementations own domain normalization.
- Binary: Plugin operation payloads are JSON values. WordPress media bytes cross the current contract as base64 and are decoded inside that adapter. A shared scoped `AssetRef` capability is not implemented; the future Gateway Host adapter must settle its media mapping before implementation.
- Discovery API: the Core source is a bundled package-root catalog; it reads and validates package manifests without importing code, then loads only selected package implementations.
- Operation inventory: distinguish declared operations from executable registered/enabled operations. Applications can inspect manifest declarations and runtime state without confusing discovery with activation.
- Capabilities: declared per operation and injected by Host per operation. No unrestricted dependency bag and no general `network.http` capability; provider-specific or domain capabilities constrain access.
- Compatibility: package version and Host API version are separate SemVer contracts; Host API uses major compatibility ranges and additive minor releases.
- Reference slice: `packages/plugins/core/hello-world` is a bundled Core Plugin with one `hello.say` operation. It uses the same validated package manifest, lazy loading, Host schema checks, registration, and invocation path as the other Core Plugins. It has no provider or external-service dependency.

## Verification and result

- Added `packages/plugins/core/hello-world` as a bundled Core Plugin with a `package.json#bloggeniusPlugin` manifest and one `hello.say` operation; it is not an examples-only package.
- Migrated all bundled Core packages to manifest-declared input/output schemas and executor-only operation implementations. Removed `input.parse` and `output.parse` from the public runtime contract.
- The Core registry validates static manifests without importing implementation modules, checks Host API SemVer compatibility and schema validity, and loads only selected package code. It rejects runtime operation IDs that do not exactly match the manifest.
- Plugin Host validates operation input and output with JSON Schema 2020-12; validation does not transform values or apply implicit defaults. Remote references are rejected.
- Updated the WordPress Application-to-Plugin media boundary to base64 JSON and documented conversion in the WordPress adapter.
- Updated existing registry, Host, Application, and package tests for the manifest contract, and added Hello World discovery/registration/invocation contract tests. Focused verification passed: 34 tests across the Plugin Host, Core registry/runtime, WordPress Applications, Hello World, Content Generator, and WordPress Publisher; `git diff --check` also passed. The full unit suite was not run.
- Core and future Community Plugins are designed to share a declarative manifest and runtime operation contract; source discovery/trust/management policies remain separate.
- Proposed Core flow reads static package manifests from the bundled catalog, validates them before loading, instantiates only selected Core Plugins, compares actual operation implementations against declared operations, registers validated operations, and exposes operation contracts plus runtime availability.
- Candidate manifest uses package metadata plus a `bloggeniusPlugin` extension; operation schemas are static JSON Schema data and implementations provide executors keyed by operation ID.
- `reportProgress` is agreed as an optional Plugin execution-context capability; the event vocabulary and validation behavior remain to be specified.
- `connectionRef` is excluded from v1; Host chooses the configured credential for a provider.
- Image generation defaults to one output; route-specific count and byte limits are discoverable and validated.
- Public errors use stable `AI_GATEWAY_*` codes and retryability, without raw provider error bodies.
- Generation submissions are not automatically retried; safe status reads/downloads may be retried within bounded policy.
- User-defined OpenAI-compatible endpoints are excluded from Gateway v1; any BlogGenius-only extension is a separate decision.
- JSON response mode is supported only on advertised routes; Application validates the business schema and constrained JSON Schema generation is out of scope.
- Errors may carry an optional normalized `providerRequestId`, never raw provider bodies, prompt text, or credentials.
- The common Core manifest/Host contract and bundled Core Hello World reference are implemented. Community package loading/security policy and the AI Gateway remain separate follow-up scopes.
- No universal cross-runtime Plugin framework was selected. The design uses established manifest + runtime entrypoint + Host registry patterns, with SemVer and JSON Schema as interoperable building blocks.
- Remaining implementation details are limited to schema/SDK constants and validation policy listed above; no architectural ownership decision is left open in this proposal.
