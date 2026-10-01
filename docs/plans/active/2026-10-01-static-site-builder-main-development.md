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
- Use the existing projects as evidence and potential sources of validated contracts, without assuming their current template implementation is a standard:
  - `/Users/delta898/Project/StaticWeb`: Astro and Cloudflare static-site conventions.
  - `/Users/delta898/Project/Amade`: Docker CLI workflow and starter templates.
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

### Amade

- Provides a Docker-distributed CLI, local templates, and a workspace-oriented Astro setup.
- Docker fixes toolchain consistency and host prerequisite variation, but still requires Docker and usually Git; it adds container, mount, permission, preview, and auth-volume concerns.
- Its documentation explicitly accepts a security tradeoff where trusted build scripts share a container with provider auth state. BlogGenius must reassess that boundary rather than inherit it by default.

## Initial product hypothesis

BlogGenius may provide one guided user experience for project/site setup, template configuration, content creation, preview, build, and deployment while keeping the site/build/deploy domain separate from current Naver and WordPress publishers. Astro and Cloudflare Static Assets are the initial target hypothesis based on the user's existing projects. The precise product scope and execution architecture remain open.

The user's broader product model is that BlogGenius, StaticWeb, and Amade are distinct tools for realizing a shared site/product specification. BlogGenius may provide a desktop UI; StaticWeb/Amade may provide a Docker-based CLI and potentially other interfaces later. They should share agreed contracts where useful without being forced into one implementation or dependency chain.

### Template ownership and lifecycle (initial direction)

- BlogGenius is not a visual/free-form site builder. It helps a user choose a managed template, set the template's supported values (for example title, logo, and menu), connect content, preview/build, and deploy.
- Template definitions and releases are managed outside BlogGenius, currently envisioned in the Amade project. BlogGenius consumes a catalog/reference so adding a template such as `A2` or `D1` need not require a BlogGenius app release.
- The preferred direction is a dedicated repository for template specification, sources, and catalog, separate from both tool repositories. This may become the canonical template project rather than Amade; no repository has been created or named yet.
- A created site records the selected template identity and version. New sites may choose newer catalog entries; existing sites remain on their selected version until an explicit update/migration feature is designed.
- Whether existing sites can switch template families or upgrade from `A1` to `A2` is deferred until real templates and user changes provide evidence.
- The existing Amade template is only an initial example and may be replaced completely. Define a new template spec from product needs rather than treating its current file layout as normative.
- The exact configurable fields, compatibility contract, catalog transport, offline behavior, and asset delivery mechanism remain open.

### Candidate product separation

```text
Tools: BlogGenius (desktop UI) | Amade (Docker CLI) | possible future interfaces
                                  consume
Templates: separate repository (spec + template sources + versioned catalog)
```

This is the agreed product boundary: BlogGenius must not invoke, bundle, or depend on the Amade CLI. Doing so would introduce a Docker dependency and violate BlogGenius's no-extra-development-tools requirement. BlogGenius and Amade are independent consumers of the neutral template specification/catalog and implement their own runtime paths. The template project must not depend on either tool's runtime.

## Candidate user journey (discussion draft)

1. User has a Cloudflare account.
2. In BlogGenius, connect Cloudflare and grant the required account permissions.
3. Initialize a project, then add one or more sites (project-to-site cardinality is undecided).
4. For each site, select a managed template and configure the fields it exposes.
5. Edit the site using a separate Astro-capable tool when deeper edits are needed; the ownership, handoff, and supported scope of such edits need design.
6. Preview locally before the first deployment, then deploy to Cloudflare Static Assets.
7. Optionally connect a custom domain through Cloudflare and verify the live site.
8. Create an article in BlogGenius's writing workflow, publish it to the chosen static site, then rebuild/deploy the updated site.

This is a user-flow hypothesis, not an implementation contract. In particular, local preview must not silently imply an extra user-installed tool; and custom-domain connection must account for Cloudflare account scope, domain ownership, DNS state, and confirmation of any remote changes.

## Platform prerequisite requirement

- BlogGenius currently targets macOS Apple Silicon and Windows x64. Windows ARM64 may be considered later.
- The static-site feature should preserve the existing installation expectation: users install BlogGenius and do not need to separately install Docker, Node.js/npm, Git, Wrangler, or other development tools.
- Users may still need to authorize an external hosting account such as Cloudflare to deploy. Account authorization is distinct from installing a development tool.
- Windows ARM64 is a future compatibility consideration, not a presently guaranteed support target. Architecture and packaged dependencies should avoid unnecessary barriers where feasible; support requires later validation.

## Design questions to resolve

1. What does a Project represent in BlogGenius, and should it contain one Site or N Sites?
2. Who owns canonical site source and content: BlogGenius-managed files, user-selected files, Git, or a hosted service? What happens when the user edits Astro files externally?
3. Where do Astro dependencies, local preview, and builds run while preserving the no-extra-tool installation requirement?
4. How are Cloudflare identity, credentials, account selection, deployment approval, and recovery handled without exposing secrets to site scripts or static output?
5. Where should the template project live, and should it own only source/specification or also the user-facing catalog and release distribution?
6. How does the external template catalog work (version pinning, cache/offline behavior, compatibility, integrity, and trusted distribution)?
7. How should a BlogGenius article map to static-site content, and how should edits, scheduling, deletion, and failed redeployment behave?
8. What can Cloudflare custom-domain setup safely automate, and which domain/DNS changes require explicit user action?
9. Which StaticWeb/Amade contracts are stable and reusable, and which are early experiments that should not be adopted?
10. What is the smallest end-to-end user scenario that validates value without turning BlogGenius into a site builder or general CMS?

## Proposed boundaries to evaluate

- BlogGenius user experience: projects/sites, guided operations, preview, and clear deployment outcomes.
- Static-site domain: project/site/content contracts and lifecycle, separate from Naver/WordPress-specific publishing adapters.
- Build execution: an explicit boundary with resource limits, cancellation, logs, and deterministic outputs.
- Deployment adapter: initially Cloudflare Static Assets, with target and environment shown before remote changes.
- Identity and secrets: explicit ownership and least privilege; never embed deployment secrets in site source, generated pages, or logs.
- Existing StaticWeb and Amade repositories: reference implementations and possible upstream assets, not assumed runtime dependencies.

These are hypotheses for design work, not finalized architecture decisions.

## Staged plan

1. **Product and architecture discovery**: map the user flow, Project/Site relationship, source ownership, execution choices, Cloudflare boundaries, and external template contract. Recommend an initial vertical slice before implementation.
2. **Foundation contracts**: after user agreement, define project/site/content/template/build/deploy contracts and local data ownership.
3. **Vertical slice**: initialize one project, create one site from one catalog template, apply its basic settings, preview/build, and deploy to a development Cloudflare target with explicit confirmation.
4. **Writing integration**: publish one BlogGenius manuscript as static-site content and redeploy the changed site, preserving the last successful deployment if a later build/deploy fails.
5. **Site lifecycle expansion**: validate N-site projects, external Astro editing, custom domains, production deployment, and template upgrade/switch behavior as separate decisions.

Stages 2–5 may be reordered or narrowed based on the discovery result. Each implementation stage should be a separate sub-feature branch based on this parent branch and should have its own dated development record before material changes.

## Decisions made with the user

- This is the sole planned feature-development track for the near term; bug fixes are still allowed.
- Create a dedicated parent integration branch whose name contains `-main`.
- Develop independent stages on sub-feature branches and integrate them back into the parent according to the repository branch policy.
- First capture and maintain the discussion/decisions in project documentation; this is a large project requiring continued design discussion.
- No implementation, release, push, or deployment was authorized by the initial opinion request.

## Alternatives and tradeoffs under discussion

- **Docker CLI model (Amade)**: reproducible, pinned toolchain and OS isolation; users still install/run Docker, and mounts/auth state/build code create operational and security complexity.
- **BlogGenius-managed local runtime**: can remove Docker and Node/npm setup from the user flow; transfers cross-platform toolchain lifecycle and filesystem/process isolation responsibilities to the desktop app.
- **Remote build service**: minimizes local prerequisites and improves centralized reproducibility; requires uploading or syncing source/content, service operations, privacy/cost controls, and a remote credential/deployment model.
- **Git-first workflow**: strong ownership/history and integration with StaticWeb; may retain setup burden that the product is intended to remove.
- **Managed template configuration**: keeps the BlogGenius product bounded and can add catalog templates independently; users are limited to fields each template exposes and need an external path for deeper edits.
- **Direct Astro source editing through a separate tool**: preserves flexibility and project separation; requires clear file ownership, handoff, and preview/build compatibility.

No execution model is selected yet.

## Next discovery experiments (proposal)

1. **Template contract spike:** define one minimal template descriptor and one Astro template from scratch (not by inheriting the current Amade template). Validate that title/logo/menu-style values can be declared, validated, applied, and previewed. Include immutable template identity/version and integrity metadata; do not implement existing-site migration.
2. **Independent consumer check:** use the same descriptor/source artifact from an Amade CLI proof and a BlogGenius-side prototype or contract check. The goal is to confirm independent consumption of one neutral contract; BlogGenius must not invoke or package the Amade CLI.
3. **Runtime feasibility check:** on macOS Apple Silicon and Windows x64, establish whether BlogGenius can package or manage the Astro build/preview runtime without user-installed developer tools. Check package size, startup, process cleanup, preview port conflicts, and whether site build scripts can access Cloudflare credentials. Windows ARM64 is a future compatibility consideration only.
4. **Cloudflare auth/deploy check:** separately prove the smallest dev-only deploy flow and its permissions, with explicit target confirmation and safe failure behavior. Custom-domain/DNS changes are excluded from this first check.

## Cloudflare 연동 검증 진행

- Cloudflare OAuth 및 계정 목록 검증은 완료되어 [Cloudflare 데스크톱 OAuth 및 계정 목록 PoC 기록](../archive/2026-10-01-cloudflare-oauth-desktop-poc-development.md)에 보관했다. 결과는 `codex/cloudflare-oauth-poc`에서 `codex/static-site-builder-main`으로 fast-forward 병합했다.
- 2026-10-02 기준 시스템 브라우저 OAuth Authorization Code + PKCE 인증, `memberships.read` scope, Bearer token을 이용한 `GET /memberships` 조회가 실제 Cloudflare 계정에서 성공했다. 실제 계정의 식별 정보와 token은 기록하지 않는다.
- Workers Static Assets 목록 조회 단계는 [Cloudflare Static Assets 목록 조회 PoC 기록](2026-10-02-cloudflare-static-assets-list-poc-development.md)에서 추적한다. `workers-scripts.read` scope와 `has_assets` 기반 분류를 실제 계정에서 확인했다. 결과는 구현된 `codex/cloudflare-static-assets-list-poc` 브랜치에 있으며 아직 커밋·병합하지 않았다.
- 다음 검증은 Static Assets Worker의 배포 및 상태 조회 API, 필요한 scope, 샘플 배포의 변경 위험을 조사하는 것이다. 배포는 별도 합의 전까지 수행하지 않는다.

These are decision-support experiments, not approval to implement the full feature. Prefer disposable fixtures and a dedicated development Cloudflare target; do not incur paid AI, production mutations, or unapproved remote changes.

## Progress log

### 2026-10-01 — initial discovery and branch setup

- Inspected BlogGenius architecture, workspace layout, runtime credential boundaries, agent runtime, manuscript workspace, and publishing references.
- Inspected StaticWeb README, system overview, static-site publishing specification, container runtime evaluation, staged project/deployment workflow, and ADR-0008/ADR-0019.
- Inspected Amade README, Compose setup, starter manifest, and template instructions.
- Confirmed the working tree was clean on `main` before creating this branch.
- Created `codex/static-site-builder-main` from a commit shared by `main` and `dev` (`3b6158ca`). The intended branch name was later clarified as `codex/dev-static-site-builder-main`.
- No implementation code changed. This record is the initial planning artifact; deeper discovery and architecture recommendation remain.

### 2026-10-01 — integration flow clarified

- User confirmed the intended flow: `main -> dev -> parent feature -> sub-feature`, then merge in reverse order.
- Confirmed the current parent feature's base commit is identical to `dev` (`3b6158ca`), so its file ancestry already matches the selected integration base.
- The actual branch rename to `codex/dev-static-site-builder-main` was attempted but blocked by a filesystem permission error while Git moved the reflog. No Git metadata was edited manually; the current checked-out branch remains `codex/static-site-builder-main` until the rename can be performed safely.

### 2026-10-01 — shared specification and tool roles

- User clarified the product model: BlogGenius, StaticWeb, and Amade are separate tools that may implement the same intended site specification through different interfaces.
- Recorded BlogGenius desktop UI and StaticWeb/Amade Docker CLI as distinct experiences; future interfaces remain possible without requiring implementation convergence.
- Recorded the no-extra-development-tools prerequisite and future Windows ARM64 consideration.
- This remains a design direction. A machine-readable shared spec, code sharing, and repository ownership boundaries still need examples and agreement.
- User clarified that BlogGenius is not a general site builder. It should select externally managed templates, expose template-supported configuration, connect writing/content, and deploy; template ownership stays outside BlogGenius.
- User agreed that adding/updating catalog templates should not require BlogGenius release, while existing-site migration between template versions/families is deferred.
- User supplied a candidate flow covering Cloudflare connection, Project/Site setup, template settings, external Astro editing, local preview, Static Assets deployment, article publishing, redeployment, and custom domains. It remains a draft to refine.
- User cautioned that Amade's current template is not a standard and may be replaced or discarded; the template specification should be designed from product needs.
- User proposed separating tools (BlogGenius UI and Amade CLI) from a dedicated template repository, potentially a new “Amade2”-like project. This is the preferred structure to examine, not yet a finalized catalog distribution contract.
- User explicitly clarified that BlogGenius must not use the Amade CLI at all, because doing so would create a Docker dependency. BlogGenius and Amade are independent tools that consume the separately defined template contract through their own implementations.

## Verification and handoff

- Automated verification: not applicable; documentation/branch setup only.
- Manual review: user and agent should agree on initial product scenarios, source ownership, and local-vs-remote execution before the first implementation sub-feature.
- Current worktree changes: development record and docs index are uncommitted. The checked-out branch is still `codex/static-site-builder-main`; intended name is `codex/dev-static-site-builder-main`.
- Remaining risks: execution model and data/credential ownership materially affect privacy, cost, OS support, and feasibility; they must be resolved before product implementation.
