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
- Do not assume how BlogGenius should package or manage the local Astro toolchain; validate platform-specific approaches. Build and preview themselves are local by user decision; a remote build service is not the current product direction.
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

현재 합의: BlogGenius는 데스크톱 UI를 제공하고, 별도 외부 저장소에서 template을 가져온다. 가칭 Amade2는 이 template source repository를 뜻하며 저작 도구나 CLI가 아니다. BlogGenius는 template catalog/source를 내장하거나 소유하지 않는다. 별도 CLI나 다른 소비 도구는 현재 범위 밖이며 추후 별도로 논의한다. 기존 Amade 프로젝트와 그 template은 사양의 근거로 사용하지 않는다.

### Template ownership and lifecycle (initial direction)

- BlogGenius is not a visual/free-form site builder. It helps a user choose a managed template, set the template's supported values (for example title, logo, and menu), connect content, preview/build, and deploy.
- Template 정의와 배포 버전은 BlogGenius와 분리된 외부 저장소에서 관리한다. BlogGenius는 catalog와 template source를 참조하므로 새 template 제공에 BlogGenius 앱 배포가 필요하지 않다.
- The template project owns the new specification, template sources, and versioned catalog; it does not depend on either tool's runtime.
- A created site records the selected template identity and version. New sites may choose newer catalog entries; existing sites remain on their selected version until an explicit update/migration feature is designed.
- Whether existing sites can switch template families or upgrade from `A1` to `A2` is deferred until real templates and user changes provide evidence.
- Astro's conventional project structure is the baseline. Add only a thin product-specific contract for catalog identity/version, supported settings, and package integrity; do not redefine Astro's project layout.
- The exact configurable fields, compatibility contract, catalog transport, offline behavior, and asset delivery mechanism remain open.

### Candidate product separation

```text
BlogGenius (desktop UI) ── 참조/가져오기 ──> 외부 template 저장소
                                           (사양 + template source + 버전 catalog)
```

합의된 경계: BlogGenius는 template을 저작하거나 관리하는 site builder가 아니며, Amade CLI를 호출·포함·의존하지 않는다. 외부 저장소가 template 모음을 소유하고 BlogGenius가 이를 참조한다. 별도 CLI 소비자는 현재 요구사항이 아니며 추후 논의한다.

## Candidate user journey (discussion draft)

1. User has a Cloudflare account.
2. BlogGenius 사용자 단위로 Cloudflare OAuth를 한 번 연결한다. Cloudflare 사용자는 여러 account에 접근할 수 있다.
3. Project는 관리 묶음이며, 각 Project에 접근 가능한 Cloudflare account 하나를 선택한다. 한 Project에는 여러 Site를 둘 수 있고 Project마다 다른 account를 선택할 수 있다.
4. For each site, select a managed template and configure the fields it exposes.
5. Edit the same Astro source project using a separate Astro-capable tool when deeper edits are needed. The normal collaboration model is shared source on the same machine; export/import is a secondary cross-machine transfer path.
6. Cloudflare 인증 없이 로컬에서 build/preview 한다. Cloudflare는 원격 배포 시에만 필요하며, 배포 대상은 Cloudflare Static Assets다.
7. A Site can be deployed and inspected without a custom domain using its Cloudflare `workers.dev` address. A custom domain is optional and can be connected through Cloudflare when desired.
8. Create an article in BlogGenius's writing workflow, publish it to the chosen static site, then rebuild/deploy the updated site.

Each Site is an independent build/deploy unit. A Project may have zero or one configured root domain: it may be created and used before the user owns or chooses a domain, but Sites in one Project must not use multiple unrelated root domains. When the Project has a root domain, a Site's optional hostname is interpreted within that domain (for example, `www` produces `www.example.com`, while `docs` produces `docs.example.com`); whether to represent the apex hostname specially remains a contract detail. A Site without a custom hostname still has its own `workers.dev` URL. To manage a separate root domain, the user creates a separate Project. This is the agreed policy direction and remains to be reflected in a later data/UX contract. Cloudflare custom-domain attachment requires an active zone, and an existing CNAME at the chosen hostname can block attachment; the app must check and explain conflicts rather than silently changing DNS. Local preview must not silently imply an extra user-installed tool.

## Platform prerequisite requirement

- BlogGenius currently targets macOS Apple Silicon and Windows x64. Windows ARM64 may be considered later.
- The static-site feature should preserve the existing installation expectation: users install BlogGenius and do not need to separately install Docker, Node.js/npm, Git, Wrangler, or other development tools.
- Users may still need to authorize an external hosting account such as Cloudflare to deploy. Account authorization is distinct from installing a development tool.
- Windows ARM64 is a future compatibility consideration, not a presently guaranteed support target. Architecture and packaged dependencies should avoid unnecessary barriers where feasible; support requires later validation.

## Design questions to resolve

1. How should the data/UI represent a Site's optional custom hostname before a Project has a root domain, and how should the apex hostname be represented? `www` and other subdomain labels are allowed under the Project's single root domain; separate root domains require separate Projects.
2. The default source-sharing model is a shared local Astro project. What file ownership and change-detection rules are needed when an external editor changes it? Should Git remain optional, and is export/import sufficient for cross-machine transfer?
3. Where do Astro dependencies, local preview, and builds run while preserving the no-extra-tool installation requirement?
4. 사용자 단위 Cloudflare 연결과 Project별 account 선택, 배포 승인 및 복구를 어떻게 하며 site script나 산출물에 비밀정보가 노출되지 않게 할까?
5. 외부 template 저장소는 BlogGenius가 가져갈 source/사양/catalog를 어떻게 배포할까? 기존 Amade workflow와 template은 요구사항에서 제외한다.
6. How does the external template catalog work (version pinning, cache/offline behavior, compatibility, integrity, and trusted distribution)?
7. How should a BlogGenius article map to static-site content, and how should edits, scheduling, deletion, and failed redeployment behave?
8. What can Cloudflare custom-domain setup safely automate, and which domain/DNS changes require explicit user action?
9. 외부 template contract를 바탕으로 BlogGenius가 구현할 최소 retrieval/materialization 동작은 무엇인가? 다른 소비 도구는 현재 범위에서 제외한다.
10. What is the smallest end-to-end user scenario that validates value without turning BlogGenius into a site builder or general CMS?

## Site attributes (discussion draft)

Keep user choices separate from implementation state. The Project owns the optional single root domain; a Site chooses a hostname under that Project domain. A Site with no custom hostname remains available at its generated `workers.dev` address.

| User-facing/site configuration candidates | Internally managed candidates |
| --- | --- |
| Site display name (for example, “Product docs”) | Stable Site ID |
| Selected template and pinned template version | Parent Project ID |
| Template-supported settings (for example title, logo, menu) | Local Astro source location and source state |
| Optional hostname label under the Project domain (for example `www`, `docs`) | Build/dependency/runtime metadata and build output location |
| Optional custom-domain attachment and canonical-host preference, if supported | Cloudflare account/Worker identifiers and `workers.dev` URL |
| Content/site publishing choices supported by the selected template | Deployment history, status, timestamps, and diagnostics |
|  | Credentials/tokens in secure credential storage, never in site source/config |

This is a candidate list, not a committed schema. A hostname is exact: `www.example.com` and `example.com` are separate hostnames. Cloudflare Custom Domains attach to an exact hostname; supporting both requires a redirect or a second hostname attachment/configuration. Therefore, selecting `www` does not itself make the apex `example.com` work. The initial product can treat the Site's chosen hostname as canonical and defer apex alias/redirect handling, while explaining that distinction. Cloudflare can attach a Custom Domain to the apex as well as subdomains, subject to zone and DNS conditions.

## Proposed boundaries to evaluate

- BlogGenius user experience: projects/sites, guided operations, preview, and clear deployment outcomes.
- Static-site domain: project/site/content contracts and lifecycle, separate from Naver/WordPress-specific publishing adapters.
- Build execution: an explicit boundary with resource limits, cancellation, logs, and deterministic outputs.
- Deployment adapter: initially Cloudflare Static Assets, with target and environment shown before remote changes.
- Identity and secrets: explicit ownership and least privilege; never embed deployment secrets in site source, generated pages, or logs.
- New template project: owns product-specific template specification, sources, and versioned catalog independently from tool runtimes.
- BlogGenius: 외부 저장소에서 template을 가져와 site source로 만든다. 외부 저장소 자체는 앱에 포함하지 않는다.

These are hypotheses for design work, not finalized architecture decisions.

## Staged plan

1. **Product and architecture discovery**: map the user flow, Project/Site relationship, source ownership, execution choices, Cloudflare boundaries, and new template contract. Recommend an initial vertical slice before implementation.
2. **Foundation contracts**: after user agreement, define project/site/content/template/build/deploy contracts and local data ownership. Start the template project and its initial specification independently from tool implementations.
3. **User-scenario technical PoCs**: validate the journey in order, starting with Cloudflare authorization and account discovery, then read-only inventory, a disposable Static Assets deployment, and deployment/status inspection. Derive the required scopes, data model, error handling, and product boundaries from observed results.
4. **Local site lifecycle**: initialize one project, create one site from one catalog template, apply basic settings, and preview/build locally.
5. **Writing integration**: publish one BlogGenius manuscript as static-site content and redeploy the changed site, preserving the last successful deployment if a later build/deploy fails.
6. **Site lifecycle expansion**: validate the already-agreed N-site Project model, external Astro editing, optional custom domains, production deployment, and template upgrade/switch behavior as separate decisions.

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

실행 위치는 사용자가 로컬 build/preview로 정했다. 다만 사용자에게 Node/npm을 추가 설치시키지 않으면서 macOS Apple Silicon과 Windows x64에서 Astro runtime을 어떻게 제공·업데이트·격리할지는 아직 검증이 필요하다.

## Next discovery experiments (proposal)

1. **Template contract spike (prototype completed):** a minimal descriptor and Astro fixture were implemented and merged in `fbc4b0e5`. Treat it as a candidate for design review, not as an adopted canonical contract. See the [spike record](2026-10-01-static-template-contract-spike-development.md); do not implement existing-site migration.
2. **Cloudflare user-journey PoC:** Authorization Code + PKCE, membership lookup, and Worker Static Assets inventory are verified and merged. An approved sample Worker was successfully deployed through the stable version API after matching Cloudflare's hash-named multipart asset fields; the public `workers.dev` URL returned HTTP 200 and the expected sample content. See the [Cloudflare Static Assets 배포 PoC 기록](2026-10-02-cloudflare-static-assets-deploy-poc-development.md). Custom-domain/DNS changes remain outside the stage.
3. **Template retrieval check:** BlogGenius가 외부 저장소에서 버전 지정 template을 가져오며 catalog를 앱에 내장하거나 CLI에 의존하지 않는지 확인한다.
4. **Runtime feasibility check:** macOS Apple Silicon과 Windows x64에서 사용자 별도 개발 도구 설치 없이 Astro build/preview runtime을 앱이 관리할 수 있는지 확인한다. 패키지 크기, 시작 시간, 프로세스 정리, preview port 충돌, Cloudflare 연결·credential 없는 build/preview를 살핀다. Windows ARM64는 추후 호환성 고려사항이다.

## Cloudflare 연동 검증 진행

- Cloudflare OAuth 및 계정 목록 검증은 완료되어 [Cloudflare 데스크톱 OAuth 및 계정 목록 PoC 기록](../archive/2026-10-01-cloudflare-oauth-desktop-poc-development.md)에 보관했다. 결과는 `codex/cloudflare-oauth-poc`에서 `codex/static-site-builder-main`으로 fast-forward 병합했다.
- 현재 sub-feature [Cloudflare 데스크톱 연결 통합](2026-10-02-cloudflare-desktop-connection-development.md)에서 `설정 > 기본 연결 > 사이트 호스팅` UI와 OAuth connection API를 구현했다. 이번 slice는 사용자 단위 연결 및 접근 가능한 계정 표시까지이며 Project account binding/Worker 선택/배포는 다음 단계다. 사용자의 system-browser OAuth 및 실제 UI 검증을 기다린다.
- 개발 사용자는 `.env.oauth`에 `CLOUDFLARE_OAUTH_CLIENT_ID`를 넣고 `./run_dev.sh`로 실행한다. 개발 launcher는 이 값을 Development 프로세스에 전달하고 Production launcher는 `.env.oauth`에서 이 값을 읽지 않는다. 공개 앱용 release 설정은 별도 후속 작업이다.
- 2026-10-02 기준 시스템 브라우저 OAuth Authorization Code + PKCE 인증, `memberships.read` scope, Bearer token을 이용한 `GET /memberships` 조회가 실제 Cloudflare 계정에서 성공했다. 실제 계정의 식별 정보와 token은 기록하지 않는다.
- OAuth 정체성 연결은 BlogGenius 사용자/설치 단위로 두고, 한 사용자가 접근할 수 있는 Cloudflare account 중 하나를 각 Project가 선택한다. 한 Project는 Cloudflare account 하나에 연결되며 Site는 각자 Worker 배포 대상이 된다.
- Astro build/preview는 Cloudflare와 독립된 로컬 작업이다. OAuth 연결과 Cloudflare account는 원격 배포 시점에만 필요하다.
- Workers Static Assets 목록 조회 단계는 [Cloudflare Static Assets 목록 조회 PoC 기록](2026-10-02-cloudflare-static-assets-list-poc-development.md)에서 추적한다. `workers-scripts.read` scope와 `has_assets` 기반 분류를 실제 계정에서 확인했고, 커밋 `4c943f9c`로 부모에 병합했다. 하위 브랜치는 삭제했다.
- 배포 PoC는 [Cloudflare Static Assets 배포 기록](2026-10-02-cloudflare-static-assets-deploy-poc-development.md)에서 추적한다. OAuth write 동의 후 사용자가 승인한 동일 샘플 Worker 배포가 완료됐고, workers.dev 공개 URL에서 HTTP 200과 예상 본문을 확인했다. Worker와 샘플은 Cloudflare 계정에 남겨두었다.
- 배포 scope는 Cloudflare API 문서의 `Workers Scripts Write`에 대응하는 OAuth scope ID를 실제 scope 목록에서 재확인해야 한다. 계정/Worker의 `workers.dev` 설정도 배포 URL 확인 전에 확인해야 한다.
- 현재 직접 upload 문서의 첫 Worker 생성 및 분리된 version API 예제는 Workers Beta API를 사용한다. 안정 API의 module upload 경로와 비교해 장기 지원 위험을 확인하기 전에는 제품 구조의 확정 근거로 삼지 않는다.
- Cloudflare 공식 문서 중 Workers for Platforms 가이드의 hash 이름 multipart 필드와 안정 `/workers/scripts/{name}/versions` API를 사용해 실제 샘플을 배포했다. `workers.dev` URL에서 HTTP 200과 샘플 marker를 확인했다. `body[hash]`는 HTTP 202와 completion JWT 없는 응답을, beta version API는 HTTP 415를 반환한 뒤 경로를 수정했다. 집중 테스트 25개가 통과했다.

These are decision-support experiments, not approval to implement the full feature. Prefer disposable fixtures and a dedicated development Cloudflare target; do not incur paid AI, production mutations, or unapproved remote changes.

The Cloudflare PoC follows the user journey rather than selecting a technology stack in advance. Cloudflare's OAuth documentation supports Authorization Code with PKCE for desktop clients. Its API exposes Worker Script inventory and Static Assets upload/deployment operations; “Static Assets list” should therefore be verified as the relevant Worker/deployment inventory and not assumed to be a separate site registry. A live sample deployment is a remote mutation and must use a user-designated disposable/development account and an explicitly confirmed Worker name.

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
- User agreed to the domain grouping rule: a Project supports at most one root domain; it may remain unassigned so sites can be built, deployed, and inspected on `workers.dev`; sites needing another root domain belong in another Project. Do not represent an unassigned domain using a fake placeholder such as `notassignedyet.com`.
- User clarified the ownership boundary: the root domain belongs to Project; a Site should choose only its hostname under that Project domain. `www` must be allowed.
- Product principle: BlogGenius is a best-effort helper. It should automate what it can, detect external constraints/conflicts, explain them plainly, and guide the user to resolution; it cannot promise to override Cloudflare/domain/DNS limitations.
- Recorded a draft split of Site user-configurable attributes and internally managed state. The exact fields remain subject to product-flow design.
- User chose a scenario-first discovery method: validate technical capability in the order the user encounters it, and derive requirements and architecture from PoC evidence rather than trying to settle every detail by speculation.

### 2026-10-01 — Project/Site and deployment assumptions clarified

- Revised the candidate journey to distinguish Project management grouping from independently built/deployed Sites, and to make custom domains optional.
- Recorded `workers.dev` as the default inspection/deployment address when the user has no custom domain.
- Updated open questions to focus on the exact hostname rule under a Project's optional single root domain, shared local source ownership/change detection, and cross-machine transfer.
- The user's latest clarification supersedes earlier notes that treated the current Amade workflow itself as nonexistent; only its template remains excluded as a standard.
- Clarified that `www.example.com` is not the apex `example.com`; Cloudflare custom domain attachment is exact-hostname. Serving both requires separate hostname handling (typically a redirect/alias setup), so the initial Site hostname can be canonical and apex behavior can be a separate supported flow.
- Reordered the proposed discovery path so the next technical PoC follows Cloudflare authorization, account selection, read-only inventory, disposable sample deployment, then status/URL verification. Astro local build/preview follows that platform-path check.
- Astro's conventional project structure is the baseline; any product-specific template contract should be a thin addition, not a competing Astro project standard.
- The current parent starts from `main` and is named `codex/static-site-builder-main`; the intended destination is `dev`. Future feature work starts from `dev`.

### 2026-10-02 — 현재 유효한 제품 경계

- Cloudflare OAuth는 BlogGenius 사용자/설치 범위에서 연결한다. 사용자는 여러 Cloudflare account에 접근할 수 있으며 각 Project는 그중 account 하나를 선택한다. Site마다 Worker 배포 대상을 둔다.
- Astro build와 preview는 로컬에서 수행하며 Cloudflare와 무관하다. OAuth 연결/account는 원격 배포 시점에만 필요하다.
- 가칭 Amade2는 외부 template source repository다. 저작 도구/CLI가 아니며 BlogGenius는 이 repository의 catalog와 source를 참조한다. 별도 consumer/tool 논의는 후속으로 미룬다.
- 이 최신 합의는 위의 과거 진행 기록 중 “Amade2 CLI” 또는 build 단계의 Cloudflare 의존을 전제한 문장을 대체한다.

## Verification and handoff

- Automated verification: not applicable; documentation/branch setup only.
- Manual review: user and agent should agree on initial product scenarios, source ownership, and local-vs-remote execution before the first implementation sub-feature.
- Current worktree changes are tracked by the active sub-feature branch and its development record.
- Remaining risks: execution model and data/credential ownership materially affect privacy, cost, OS support, and feasibility; they must be resolved before product implementation.
