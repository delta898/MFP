# Cloudflare Node SDK Integration PoC

## Branch and status

- Branch: `codex/cloudflare-node-sdk-integration-poc`
- Start date: 2026-10-02
- Base/parent branch: `codex/static-site-builder-main`
- Status: SDK mock and live verification completed; recommendation and remaining packaging assessment recorded below.

## User need and goal

BlogGenius has a successful isolated proof of concept for Cloudflare OAuth and Static Assets deployment using direct HTTP requests. The next question is whether Cloudflare's official Node SDK can use the OAuth access token and reproduce the relevant workflow with less custom API handling, while remaining suitable for BlogGenius's supported desktop platforms.

The goal is a short technical validation that compares the official SDK against the existing direct REST approach. This PoC should inform an architecture decision; it is not yet product integration.

## Scope

- Verify the current official Cloudflare Node SDK's authentication support for the OAuth access token obtained by the existing PKCE flow.
- Reproduce authenticated Worker inventory lookup.
- Reproduce a sample Static Assets upload, version creation, and deployment in an isolated prototype, then inspect deployment status and its `workers.dev` URL.
- Assess Node/Electron runtime compatibility and practical packaging impact for macOS Apple Silicon and Windows x64. Record Windows arm64 as a future platform consideration, not a current acceptance target.
- Compare reliability, maintenance burden, request control, diagnostics, and packaging cost with the existing direct REST implementation.

## Explicit non-goals

- Integrating the SDK into BlogGenius product code or adding UI.
- Building Astro sites, a site builder, or template management.
- Invoking Amade CLI, Docker, Wrangler, or other user-installed tools.
- Designing or implementing custom domain support.
- Adding Windows arm64 support in this stage.
- Automatically migrating existing deployed sites or replacing the existing REST PoC.

## Proposed design and boundaries

Keep the experiment under `prototypes/` and isolate SDK-specific calls behind a small adapter. Pass the OAuth access token in memory; do not persist it in the prototype, print it, or include it in development records. Keep the existing OAuth PKCE prototype as the token source and the direct REST deployment PoC as the comparison baseline.

Before coding, verify the official SDK's current API and authentication behavior from primary documentation or source. Do not assume that an API token option and an OAuth bearer access token are interchangeable. Keep application-level workflow contracts independent of the SDK so the comparison can inform, rather than predetermine, the eventual integration boundary.

## Stages and gates

1. Inspect official SDK documentation/source for OAuth bearer-token configuration, Workers list APIs, Static Assets upload/version/deploy APIs, Node support, and package size/dependencies.
2. Build a minimal isolated adapter and focused tests with mocked requests. Verify token redaction and error handling.
3. Validate read-only Worker listing against the test account only after the user authorizes the live check.
4. For live write validation, present the exact account, new disposable Worker name, public URL, and persistent-resource effects, then obtain explicit user approval before creating or deploying anything. The existing REST PoC Worker is a reference and must not be replaced or reused for SDK writes.
5. Verify the deployed response and status, compare results with REST, and record a recommendation with evidence and remaining risks.

## Decisions and alternatives

- BlogGenius must not depend on the Amade CLI or Docker; the user should need only BlogGenius installed.
- A direct REST PoC has already successfully listed Cloudflare Static Assets-related resources and deployed a sample to `workers.dev` using OAuth-derived authorization.
- The SDK is being evaluated, not selected in advance. Direct REST remains the alternative and may be preferable if SDK authentication, Static Assets coverage, runtime compatibility, or packaging impact is unsuitable.
- A successful API-level PoC does not by itself confirm user-facing integration or desktop packaging acceptance.

## Progress and verification

- Branch created from `codex/static-site-builder-main` at `3828252de707d50b7e6fc98f1e680bfaf584da39`.
- Added an isolated prototype under `prototypes/cloudflare-node-sdk-integration-poc/` using official `cloudflare@7.2.0`; the product dependency list is unchanged.
- Verified the SDK uses `Authorization: Bearer <token>` when the OAuth access token is supplied through its `apiToken` option. A mocked SDK request confirmed the header and account-scoped Worker Scripts endpoint.
- Verified SDK methods exist for Worker Scripts listing, Workers subdomain lookup, Worker creation, Static Assets upload-session creation, Worker version creation, and deployment create/list.
- The SDK's deployment-list method currently models the response as pagination, but Cloudflare returns a nested `{ deployments: [...] }` object. The prototype adapter reads that response shape directly from the SDK response object because the generated pagination iterator produces no items for it.
- Cloudflare's official example also sends asset bytes to the signed asset-bucket upload URL with a direct fetch. Therefore the SDK removes most Cloudflare API plumbing but does not replace the raw HTTP request for the binary transfer.
- Package metadata reports zero runtime dependencies and Node.js 20+ support; BlogGenius packages Node 24. macOS Apple Silicon and Windows x64 package smoke checks remain pending.
- The npm package tarball is approximately 6.9 MB compressed and 69.5 MB unpacked (16,885 package entries, including generated API/source artifacts). This is package contents, not a measured increase to BlogGenius's final distribution; actual packager inclusion still needs checking before adoption.
- Focused verification passed: 7 PoC tests, `node --check` for both runtime modules, and `git diff --check`.
- User approved the exact persistent deployment plan. Live OAuth succeeded with `memberships.read workers-scripts.read workers-scripts.write`; the SDK listed 6 Worker Scripts in account suffix `e03358`.
- Live deployment succeeded for new Worker `bg-sdk-poc-muq4p458-0a4047` at `https://bg-sdk-poc-muq4p458-0a4047.delta898.workers.dev/`. The SDK-created deployment ID was `f3f1ea0d-c48f-4c8a-9178-4c8a588fbc52`; deployment lookup confirmed the new version received 100% of traffic; a public fetch returned HTTP 200 and the expected sample marker.
- The test Worker and its public sample remain in the Cloudflare account. No cleanup was requested.
- No broad test suite was run; this remains an isolated prototype.

## Final result and follow-up

## Result and recommendation

The official SDK reproduced the tested OAuth-backed Worker list and most deployment orchestration steps. Supplying the OAuth access token as `apiToken` correctly sent it as a Bearer credential. SDK calls created the Worker, opened the asset upload session, created the version, deployed 100% of traffic, and queried deployment state. The asset bytes still require a direct fetch to Cloudflare's signed bucket-upload endpoint, consistent with Cloudflare's official SDK example.

The SDK is a viable candidate for future product integration, but this PoC does not prove Electron/pkg packaging on both supported desktop targets. The SDK currently has zero runtime dependencies and supports Node.js 20+; the experiment ran under BlogGenius's Node 24 environment. Its npm package is 6.9 MB compressed and 69.5 MB unpacked, so the final distribution impact needs measurement before adoption. A future integration should keep a small Cloudflare gateway boundary and isolate the signed asset transport. The SDK v7.2.0 deployment-list pagination mismatch is also a maintenance concern: the prototype reads the parsed nested result to work around the generated iterator returning no entries.

The branch is not committed. Follow-up work is to review the prototype diff, complete any additional packaging checks needed for the architecture decision, and update the parent feature record with the conclusion before merging this sub-feature.
