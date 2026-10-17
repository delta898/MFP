# Social Publisher Plugin

The Social Publisher Plugin provides workspace/channel discovery, publication, and publication-status operations. Its public manifest describes social publishing capabilities; the current provider implementation lives under `providers/buffer/` and owns Buffer GraphQL transport, authentication headers, request/response normalization, and provider-specific errors. The Host supplies credentials through `getCredentials()`; ordinary post operations do not accept API keys in their inputs. `connection.inspect` accepts an optional transient API key for validating a value entered in Settings before it is saved.

The package exposes workspace/channel inspection, recent post lookup, post status lookup, and immediate multi-channel publishing. Product workflows, SNS policies, content formatting, retries, persistence, and UI behavior belong to Applications and their adapters.

The implementation is packaged under `packages/plugins/core/social-publisher/` and does not import BlogGenius Application modules. Another provider can implement the same Plugin contract without changing Application callers.
