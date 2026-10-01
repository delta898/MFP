# Static Site Builder Main Feature Development

## Branch and status

- Branch: `codex/static-site-builder-main`
- Start date: 2026-10-01
- Base branch: `main`
- Status: Design discussion and staged feature planning
- Parent branch: none; this is the integration branch for the Static Site Builder feature.

## User need and goal

BlogGenius currently supports Naver Blog and WordPress as publishing destinations. The user wants to add Astro-based static sites deployed to Cloudflare Static Assets, including site creation and management in addition to publishing content. The product goal is to make this workflow accessible without requiring users to understand Docker, npm, or Cloudflare tooling.

The user intends this to be the only feature-development track for the near term; bug fixes may continue independently. Work should be divided into independently reviewable sub-feature branches created from this parent branch. The parent branch name must include `-main` for clear identification. This parent currently branches from `main` and may later merge into `dev`; future feature work should branch from `dev`, then use the parent/sub-feature hierarchy with reverse-order integration.

## Scope

- Explore the product and architecture needed to connect site building, content management/publishing, and deployment in BlogGenius.
- Treat existing StaticWeb and Amade repositories as separate products. Their workflows may provide empirical lessons, but they do not constrain this feature's product or template specification.
- Define the template contract and catalog from a clean slate in a dedicated template project, separate from the tools.
- Keep existing Naver Blog and WordPress functionality stable and separately bounded.
- Develop an agreed feature roadmap, architecture, data/auth ownership, and migration/reuse strategy before material implementation.
- Implement the agreed scope as short-lived sub-feature branches, each with its own development record.

## Explicit non-goals until separately agreed

- Do not immediately port or merge all of StaticWeb or Amade into BlogGenius.
- Do not assume Docker must be retained or removed; compare app-managed local tooling, remote build execution, and other feasible approaches.
- Do not treat BlogGenius as a free-form site builder. It will select a separately managed template and expose a bounded set of template-defined settings; the exact settings remain to be discovered.
- Do not assume a CMS, theme marketplace, or dynamic/server-rendered sites are part of the initial product.
- Do not alter Naver or WordPress behavior as incidental cleanup.
- Do not commit, merge into `main`/`dev`, push, tag, publish, or deploy without a specific user request.
- Do not begin product implementation until the design and initial stage are agreed.

## Current evidence and context

### BlogGenius

- The app is an Electron desktop product with existing Naver and WordPress publishing paths.
- Its architecture favors capability boundaries and separates user-device authorization from trusted server-side provider credentials.
- Manuscript publishing already has a canonical draft/revision contract that may inform, but should not automatically dictate, static-site content ownership.
- Existing product and documentation rules prioritize architecture and contracts before UI polish.

### StaticWeb

- Uses Astro, npm workspaces, site-specific applications, Markdown/MDX content collections, and Cloudflare Workers Static Assets.
- Separates site source, build output, deployment target, and optional CI/CD concerns.
- Has operating experience with independent dev and production Workers and warns against putting secrets in generated static output.

## Initial product hypothesis

BlogGenius may provide one guided user experience for project/site setup, template configuration, content creation, preview, build, and deployment while keeping the site/build/deploy domain separate from current Naver and WordPress publishers. Astro and Cloudflare Static Assets are the initial target hypothesis based on the user's existing projects. The precise product scope and execution architecture remain open.

The user's product model separates tools from templates. BlogGenius provides a desktop UI, while a future Amade2 may provide a Docker-based CLI; each independently consumes a neutral template specification from a separate template project. The current Amade project may be inspected for workflow lessons, but its template is not a specification source and can be treated as nonexistent. No tool runtime is shared by the template project.

### Template ownership and lifecycle (initial direction)

- BlogGenius is not a visual/free-form site builder. It helps a user choose a managed template, set the template's supported values (for example title, logo, and menu), connect content, preview/build, and deploy.
- Template definitions and releases are managed in a dedicated template project, separate from BlogGenius and future Amade2. BlogGenius consumes a catalog/reference so new templates can be offered without a BlogGenius app release.
- The template project owns the new specification, template sources, and versioned catalog; it does not depend on either tool's runtime.
- A created site records the selected template identity and version. New sites may choose newer catalog entries; existing sites remain on their selected version until an explicit update/migration feature is designed.
- Whether existing sites can switch template families or upgrade from `A1` to `A2` is deferred until real templates and user changes provide evidence.
- Astro's conventional project structure is the baseline. Add only a thin product-specific contract for catalog identity/version, supported settings, and package integrity; do not redefine Astro's project layout.
- The exact configurable fields, compatibility contract, catalog transport, offline behavior, and asset delivery mechanism remain open.

### Candidate product separation

```text
Tools: BlogGenius (desktop UI) | future Amade2 (Docker CLI) | possible future interfaces
                                  consume
Templates: new, separate project (spec + template sources + versioned catalog)
```

This is the agreed product boundary: BlogGenius must not invoke, bundle, or depend on an Amade CLI. Doing so would introduce a Docker dependency and violate BlogGenius's no-extra-development-tools requirement. BlogGenius and future Amade2 independently consume the neutral template specification/catalog and implement their own runtime paths.

## Candidate user journey (discussion draft)

1. User has a Cloudflare account.
2. In BlogGenius, connect Cloudflare and grant the required account permissions.
3. Initialize a Project as a management grouping, then add one or more Sites. The agreed relationship is one Project to many Sites.
4. For each site, select a managed template and configure the fields it exposes.
5. Edit the same Astro source project using a separate Astro-capable tool when deeper edits are needed. The normal collaboration model is shared source on the same machine; export/import is a secondary cross-machine transfer path.
6. Preview locally before the first deployment, then deploy to Cloudflare Static Assets.
7. A Site can be deployed and inspected without a custom domain using its Cloudflare `workers.dev` address. A custom domain is optional and can be connected through Cloudflare when desired.
8. Create an article in BlogGenius's writing workflow, publish it to the chosen static site, then rebuild/deploy the updated site.

Each Site is an independent build/deploy unit and is expected to have its own hostname when custom domains are used (for example, `docs.example.com` and `blog.example.com`). Project is a management grouping; whether it also carries a required parent/root domain is not yet decided. Without a custom domain, each Site still has its own `workers.dev` URL. This remains a user-flow hypothesis, not an implementation contract. Local preview must not silently imply an extra user-installed tool; custom-domain connection must account for Cloudflare account scope, domain ownership, DNS state, and confirmation of remote changes.

## Platform prerequisite requirement

- BlogGenius currently targets macOS Apple Silicon and Windows x64. Windows ARM64 may be considered later.
- The static-site feature should preserve the existing installation expectation: users install BlogGenius and do not need to separately install Docker, Node.js/npm, Git, Wrangler, or other development tools.
- Users may still need to authorize an external hosting account such as Cloudflare to deploy. Account authorization is distinct from installing a development tool.
- Windows ARM64 is a future compatibility consideration, not a presently guaranteed support target. Architecture and packaged dependencies should avoid unnecessary barriers where feasible; support requires later validation.

## Design questions to resolve

1. What optional domain metadata, if any, belongs on a Project when it groups Sites that each have a hostname? How should a Project work before any custom domain exists?
2. The default source-sharing model is a shared local Astro project. What file ownership and change-detection rules are needed when an external editor changes it? Should Git remain optional, and is export/import sufficient for cross-machine transfer?
3. Where do Astro dependencies, local preview, and builds run while preserving the no-extra-tool installation requirement?
4. How are Cloudflare identity, credentials, account selection, deployment approval, and recovery handled without exposing secrets to site scripts or static output?
5. Where should the template project live, and should it own only source/specification or also the user-facing catalog and release distribution? Existing Amade workflow may inform this investigation, while its template remains excluded.
6. How does the external template catalog work (version pinning, cache/offline behavior, compatibility, integrity, and trusted distribution)?
7. How should a BlogGenius article map to static-site content, and how should edits, scheduling, deletion, and failed redeployment behave?
8. What can Cloudflare custom-domain setup safely automate, and which domain/DNS changes require explicit user action?
9. What minimal consumer behaviors should BlogGenius and future Amade2 implement independently against the new contract?
10. What is the smallest end-to-end user scenario that validates value without turning BlogGenius into a site builder or general CMS?

## Proposed boundaries to evaluate

- BlogGenius user experience: projects/sites, guided operations, preview, and clear deployment outcomes.
- Static-site domain: project/site/content contracts and lifecycle, separate from Naver/WordPress-specific publishing adapters.
- Build execution: an explicit boundary with resource limits, cancellation, logs, and deterministic outputs.
- Deployment adapter: initially Cloudflare Static Assets, with target and environment shown before remote changes.
- Identity and secrets: explicit ownership and least privilege; never embed deployment secrets in site source, generated pages, or logs.
- New template project: owns product-specific template specification, sources, and versioned catalog independently from tool runtimes.
- BlogGenius and future Amade2: independent consumers that implement their own package retrieval and materialization behavior.

These are hypotheses for design work, not finalized architecture decisions.

## Staged plan

1. **Product and architecture discovery**: map the user flow, Project/Site relationship, source ownership, execution choices, Cloudflare boundaries, and new template contract. Recommend an initial vertical slice before implementation.
2. **Foundation contracts**: after user agreement, define project/site/content/template/build/deploy contracts and local data ownership. Start the template project and its initial specification independently from tool implementations.
3. **Vertical slice**: initialize one project, create one site from one catalog template, apply its basic settings, preview/build, and deploy to a development Cloudflare target with explicit confirmation.
4. **Writing integration**: publish one BlogGenius manuscript as static-site content and redeploy the changed site, preserving the last successful deployment if a later build/deploy fails.
5. **Site lifecycle expansion**: validate the already-agreed N-site Project model, external Astro editing, optional custom domains, production deployment, and template upgrade/switch behavior as separate decisions.

Stages 2–5 may be reordered or narrowed based on the discovery result. Each implementation stage should be a separate sub-feature branch based on this parent branch and should have its own dated development record before material changes.

## Decisions made with the user

- This is the sole planned feature-development track for the near term; bug fixes are still allowed.
- Create a dedicated parent integration branch whose name contains `-main`.
- Develop independent stages on sub-feature branches and integrate them back into the parent according to the repository branch policy.
- First capture and maintain the discussion/decisions in project documentation; this is a large project requiring continued design discussion.
- No implementation, release, push, or deployment was authorized by the initial opinion request.

## Alternatives and tradeoffs under discussion

- **Independent Docker CLI tool**: reproducible, pinned toolchain and OS isolation; users still install/run Docker, and mounts/auth state/build code create operational and security complexity. This is for a future CLI product, never a BlogGenius dependency.
- **BlogGenius-managed local runtime**: can remove Docker and Node/npm setup from the user flow; transfers cross-platform toolchain lifecycle and filesystem/process isolation responsibilities to the desktop app.
- **Remote build service**: minimizes local prerequisites and improves centralized reproducibility; requires uploading or syncing source/content, service operations, privacy/cost controls, and a remote credential/deployment model.
- **Git-first workflow**: strong ownership/history and integration with StaticWeb; may retain setup burden that the product is intended to remove.
- **Managed template configuration**: keeps the BlogGenius product bounded and can add catalog templates independently; users are limited to fields each template exposes and need an external path for deeper edits.
- **Direct Astro source editing through a separate tool**: preserves flexibility and project separation; requires clear file ownership, handoff, and preview/build compatibility.

No execution model is selected yet.

## Next discovery experiments (proposal)

1. **Template contract spike:** define one minimal product descriptor layered on a conventional Astro starter, from scratch. Validate that title/logo/menu-style values can be declared, validated, and applied. Include immutable template identity/version and integrity metadata; do not implement existing-site migration.
2. **Independent consumer check:** use the same descriptor/source artifact from a future Amade2 proof and a BlogGenius-side prototype or contract check. The goal is to confirm independent consumption of one neutral contract; BlogGenius must not invoke or package a CLI.
3. **Runtime feasibility check:** on macOS Apple Silicon and Windows x64, establish whether BlogGenius can package or manage the Astro build/preview runtime without user-installed developer tools. Check package size, startup, process cleanup, preview port conflicts, and whether site build scripts can access Cloudflare credentials. Windows ARM64 is a future compatibility consideration only.
4. **Cloudflare auth/deploy check:** separately prove the smallest dev-only deploy flow and its permissions, with explicit target confirmation and safe failure behavior. Custom-domain/DNS changes are excluded from this first check.

These are decision-support experiments, not approval to implement the full feature. Prefer disposable fixtures and a dedicated development Cloudflare target; do not incur paid AI, production mutations, or unapproved remote changes.

## Progress log

### 2026-10-01 — initial discovery and branch setup

- Inspected BlogGenius architecture, workspace layout, runtime credential boundaries, agent runtime, manuscript workspace, and publishing references.
- Reviewed Astro and Cloudflare conventions in StaticWeb documentation as background only; they do not define the new template contract.
- Earlier inspection of the current Amade repository is historical context only. Its code, CLI behavior, and templates are excluded from specification decisions for this feature.
- Confirmed the working tree was clean on `main` before creating this branch.
- Created `codex/static-site-builder-main` from `main`; `main` and `dev` happened to point to the same commit (`3b6158ca`) at branch creation.
- No implementation code changed. This record is the initial planning artifact; deeper discovery and architecture recommendation remain.

### 2026-10-01 — integration flow clarified

- User confirmed the intended flow: `main -> dev -> parent feature -> sub-feature`, then merge in reverse order.
- Confirmed the current parent feature's base commit is identical to `dev` (`3b6158ca`), so its file ancestry already matches the selected integration base.
- The user chose to keep this parent based on `main`; it can later merge into `dev`. Future feature branches should start from `dev`.

### 2026-10-01 — shared specification and tool roles

- User clarified the product model: BlogGenius, StaticWeb, and Amade are separate tools that may implement the same intended site specification through different interfaces.
- Recorded BlogGenius desktop UI and StaticWeb/Amade Docker CLI as distinct experiences; future interfaces remain possible without requiring implementation convergence.
- Recorded the no-extra-development-tools prerequisite and future Windows ARM64 consideration.
- This remains a design direction. A machine-readable shared spec, code sharing, and repository ownership boundaries still need examples and agreement.
- User clarified that BlogGenius is not a general site builder. It should select externally managed templates, expose template-supported configuration, connect writing/content, and deploy; template ownership stays outside BlogGenius.
- User agreed that adding/updating catalog templates should not require BlogGenius release, while existing-site migration between template versions/families is deferred.
- User supplied a candidate flow covering Cloudflare connection, Project/Site setup, template settings, external Astro editing, local preview, Static Assets deployment, article publishing, redeployment, and custom domains. It remains a draft to refine.
- User cautioned that Amade's current template is not a standard and may be replaced or discarded; the template specification should be designed from product needs.
- User proposed a separate template repository and a future Amade2-like CLI tool; this direction is now agreed.
- User explicitly clarified that BlogGenius must not use any CLI, because doing so would create a Docker dependency. BlogGenius and future Amade2 independently consume the new template contract.
- User explicitly removed the current Amade project and its templates as design inputs: treat them as nonexistent and start the template specification from scratch.
- User agreed tools and templates are separate: BlogGenius UI and future Amade2 CLI consume a separate template project's specification/catalog independently.
- User confirmed the Project/Site model: Project is a management grouping with one-to-many Sites; each Site is an independent build/deploy unit.
- User expects separate hostnames per Site when custom domains are used (for example, `docs.example.com`, `blog.example.com`). Custom domains are optional; each Site must work through `workers.dev` without one.
- The normal external-editing workflow shares the same source project. Export/import is primarily for moving a project between machines.
- User clarified that the existing Amade project is worth reviewing as an experimental workflow reference, while its current template remains non-normative and is not the basis for the new template specification. This supersedes the earlier exclusion of all Amade material as evidence.

### 2026-10-01 — Project/Site and deployment assumptions clarified

- Revised the candidate journey to distinguish Project management grouping from independently built/deployed Sites, and to make custom domains optional.
- Recorded `workers.dev` as the default inspection/deployment address when the user has no custom domain.
- Updated open questions to focus on optional Project domain metadata, shared local source ownership/change detection, and cross-machine transfer.
- The user's latest clarification supersedes earlier notes that treated the current Amade workflow itself as nonexistent; only its template remains excluded as a standard.
- Astro's conventional project structure is the baseline; any product-specific template contract should be a thin addition, not a competing Astro project standard.
- The current parent starts from `main` and is named `codex/static-site-builder-main`; the intended destination is `dev`. Future feature work starts from `dev`.

## Verification and handoff

- Automated verification: not applicable; documentation/branch setup only.
- Manual review: user and agent should agree on initial product scenarios, source ownership, and local-vs-remote execution before the first implementation sub-feature.
- Current worktree changes are tracked by the active sub-feature branch and its development record.
- Remaining risks: execution model and data/credential ownership materially affect privacy, cost, OS support, and feasibility; they must be resolved before product implementation.
