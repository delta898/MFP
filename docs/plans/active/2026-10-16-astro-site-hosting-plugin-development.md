# Astro Site Hosting Plugin Development

- Branch: `codex/feat/astro-site-hosting-plugin`
- Start date: 2026-10-16
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: design and implementation in progress

## User need and goal

Complete the Blog vertical stack by moving Site Hosting's external/tool-specific execution behind the existing Plugin architecture. Keep Astro as the fixed site framework while allowing deployment providers to expand beyond the current Cloudflare implementation.

The feature will define and implement one bundled Core Plugin, tentatively named **Astro Site Hosting Plugin**. The Plugin may expose separate capabilities for site content publishing, Astro build/preview, deployment, and domain management while remaining one installable/enableable Plugin unit.

## Scope

- Inspect existing Site Hosting contracts, runtime entrypoints, provider integrations, storage ownership, route callers, and tests.
- Define the Plugin descriptor and capability operations for Astro project build/preview, provider deployment, custom-domain management, and safe provider resource lifecycle calls.
- Keep BlogGenius Site content-contract serialization, Vault containment rules, local post writes, and draft/public state policy in the Site Hosting Application/service.
- Keep Cloudflare as the first deployment provider behind a provider-neutral deployment contract; do not expose Cloudflare SDK types through the Plugin/Application contract.
- Move or adapt the current Astro runtime and Cloudflare deployment/domain operations into the bundled Plugin with explicit host-owned dependencies.
- Connect Blog Site Hosting management and Blog publishing flows through Applications and composition, preserving UI/API contracts where practical.
- Keep Cloudflare OAuth token storage, refresh, and credential policy in the Host boundary; provide scoped credentials to Plugin operations.
- Update architecture/feature documents and focused contract tests alongside implementation.

## Explicit non-goals

- Adding another deployment provider.
- Supporting a non-Astro site framework.
- Moving all Site Hosting routes, UI, repositories, templates, or project/site product workflows into the Plugin.
- Redesigning Amade template/content contracts or changing their versions.
- Changing Site Hosting UI flows except where a narrow adapter is required to preserve existing operations.
- Full unit suite, release, merge to the parent, or deployment without the applicable approval/request.

## Proposed responsibility boundaries

- **Site Hosting Application(s):** own product workflows, site eligibility/readiness policy, Site state transitions, confirmation requirements, queue integration, and orchestration.
- **Astro Site Hosting Plugin:** owns Astro-specific build/preview execution and hosting-provider operations exposed through stable capabilities; provider-neutral operation names hide Cloudflare API details.
- **Deployment provider contract:** provider-neutral deploy/status/domain operations. Cloudflare is the initial implementation and remains replaceable behind this contract.
- **Host:** owns Cloudflare OAuth lifecycle, encrypted credential persistence/refresh, and supplies least-scope credentials or an explicit credential port.
- **UI/API adapters:** keep route parsing, response mapping, and progress presentation at the adapter boundary.

The Site service remains the workflow owner: local content serialization/write and draft-vs-public decisions stay there; public publication invokes the Plugin's combined Astro build/deploy operation. Custom-domain and resource cleanup operations remain separately callable. Astro and Cloudflare execution implementations live inside the bundled Plugin package; Host composition injects credentials and application-owned data/services required by that execution. The manifest uses provider-neutral domain/site-resource operation names, with Cloudflare API mapping private to the bundled Plugin. Progress, cancellation, and cross-provider resource lifecycle normalization remain follow-up design work; current APIs preserve their existing behavior and error handling.

## Design and implementation stages

1. **Inventory:** trace Site create/import/settings, build/preview, deploy, domain bind/unbind, postMarkdown, Vault publishing, queue execution, repositories, credential flow, and route/UI callers.
2. **Contracts:** define plugin identity, capability operation schemas, deployment-provider interface, credential injection, normalized errors/results, progress, cancellation, and failure/partial-state behavior.
3. **Composition:** register the bundled Plugin and inject Host-owned Astro process/runtime and Cloudflare credentials/provider dependencies without introducing Plugin-ID knowledge in UI callers.
4. **Site management migration:** route build, preview, deployment, domain connection/status/disconnection through the Plugin while keeping product lifecycle policy in the Application.
5. **Blog publishing integration:** keep contract validation, Vault target rules, local Markdown/image writes, and temporary-save behavior in the existing Site Hosting service. For public publication, invoke the Plugin build/deploy capability after the local write, preserving the current saved-content-on-deploy-failure behavior.
6. **Verification and docs:** run focused unit/contract tests for each migrated operation and failure path; update canonical architecture docs and this record. Browser smoke is required for changed user-facing operation flows; final visual acceptance remains with the user.

## Decisions made with the user

- Work proceeds on a feature branch from `codex/fbr/plugin-architecture-foundation`.
- Astro remains the supported framework for this Plugin.
- The first deployment target is Cloudflare; the internal deployment contract should permit future providers without changing Application contracts.
- Treat build/preview, site content publishing, deployment, and custom-domain operations as distinct capabilities within one Astro Site Hosting Plugin initially; do not split them into separate Plugin packages without evidence that independent lifecycle/distribution requires it.
- Custom-domain management is a Site lifecycle operation, not part of every post publication. Immediate publication may invoke build and deploy; temporary save does not. Application owns when each operation occurs.
- Cloudflare OAuth/credential lifecycle remains Host-owned and is not moved into the Plugin.

## Progress and verification

- 2026-10-16: Created this sub-feature branch from the clean parent feature branch and recorded the initial scope before implementation.
- 2026-10-16: Re-read Site Hosting architecture and code. The Site service owns product policy and local content lifecycle; the Astro runtime and Cloudflare deployer were initially under `src/site-hosting/`. Immediate Site publication writes contract-shaped content and follows build/deploy; draft save writes locally only.
- 2026-10-16: Added the `astro-site-hosting` Core Plugin manifest, runtime operations for Astro build/status/preview and provider deployment/API calls, a Host Adapter, and composition wiring. Site Hosting now dispatches its Astro runtime and Cloudflare provider work through the Plugin Host while retaining Site policy and repository operations. OAuth credentials remain Host-owned and are passed to scoped Plugin operations. Added focused Plugin and Adapter contract tests. Existing Site Hosting service and Plugin registry/runtime tests pass. Astro runtime tests that open loopback preview servers fail in this restricted runner with `listen EPERM`; those require a permitted/manual environment for full confirmation.
- 2026-10-16: Normalized the Plugin provider operation names so the manifest does not expose Cloudflare-specific method names. Verified Plugin, adapter, Site Hosting service/deletion/domain lifecycle, Cloudflare deployer, Site routes, and queue executor tests: 51 focused tests pass. `git diff --check` passes. The direct Astro preview runtime tests were attempted separately; loopback server cases are blocked by runner `listen EPERM`.
- 2026-10-16: Corrected the initial wrapper-only implementation after identifying that composition constructed Astro runtime and Cloudflare deployer outside the Plugin and injected them. Moved Astro process/build/preview runtime and Cloudflare SDK/deployment implementation into `packages/plugins/core/astro-site-hosting/`; the Plugin now constructs and owns these implementations. Composition supplies Host/application ports (credentials, site/template repositories, screenshot, and knowledge-collection services), not runtime/deployer objects. Updated the canonical architecture description. Plugin, Cloudflare adapter, Site Hosting service, deletion/domain lifecycle, registry, and routes focused tests pass (46 tests). Existing Astro runtime tests that open loopback preview servers remain blocked by runner `listen EPERM`.
- 2026-10-17: Removed the bundled `src/site-hosting/templates/minimal-homepage` prototype from application packaging. Deterministic repository/runtime tests now use a test-only cached-template fixture, while Amade GitHub catalog tests continue to exercise remote catalog retrieval, checksum verification, cache materialization, and fallback behavior with mocked HTTP responses.

## Risks and open design questions

- Current `site-hosting-site.service.js` combines UI-facing service orchestration, template/site policy, content serialization, local persistence, build/deploy, domain and deletion lifecycle. Its functions must be classified individually; a wholesale folder move would preserve undesirable coupling.
- Uploaded/imported Astro projects execute npm install/build scripts. Process isolation, permissions, cancellation, and resource limits may constrain how the build capability is exposed.
- Custom-domain disconnect and Site deletion have explicit safety preflights and partial-state behavior. These safeguards remain in the Site service and need to be provider-neutralized if another provider is added.
- Vault content publishing has different path-containment and Knowledge Collection visibility rules from normal Astro Blog content; preserve those in the Site Hosting service while routing only Astro and provider execution through the Plugin.
- The Plugin manifest and Site service Adapter use normalized domain/site-resource action names. Persisted Site deployment metadata and the deletion safety snapshot still contain Cloudflare Worker concepts; a future provider must introduce normalized provider references and cleanup snapshots before it can use those lifecycle flows.
- Decide which progress data is normalized by the Application versus presented by UI adapters; the Plugin should report structured stages and counts rather than Korean UI strings.

## Final handoff

To be completed after implementation: record exact migrated operations, focused test commands/results, browser smoke result or reason it could not run, manual acceptance flows, remaining limitations, and whether the feature remains uncommitted or is later merged on explicit request.
