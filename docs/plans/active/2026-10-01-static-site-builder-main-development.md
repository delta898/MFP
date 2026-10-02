# Static Site Builder Main Feature Development

## Branch and status

- Branch: `codex/static-site-builder-main`
- Start date: 2026-10-01
- Base branch: `main`
- Status: In progress; Project/Site design and the first site navigation slice are complete, and the next serial sub-feature will implement the site page interior.
- Parent branch: none; this is the integration branch for the Static Site Builder feature.

## User need and goal

BlogGenius currently supports Naver Blog and WordPress as publishing destinations. The user wants to add Astro-based static sites deployed to Cloudflare Static Assets, including site creation and management in addition to publishing content. The product goal is to make this workflow accessible without requiring users to understand Docker, npm, or Cloudflare tooling.

The user intends this to be the only feature-development track for the near term; bug fixes may continue independently. Work should be divided into independently reviewable sub-feature branches created serially from this parent branch and merged back here before the next sub-feature begins. The parent branch name must include `-main` for clear identification. This parent currently branches from `main` and may later merge into `dev` only on the user's explicit instruction. The initial 2026-10-01 idea that future feature work would branch directly from `dev` was refined on 2026-10-02: current static-site sub-features branch from this `-main` integration branch.

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

## User journey and BlogGenius surfaces (current proposal)

Cloudflare is a deployment connection, not a prerequisite for creating or working on a Site. The proposed user-facing responsibilities are:

| BlogGenius surface | What the user does there | Cloudflare required? |
| --- | --- | --- |
| `설정 > 기본 연결 > 사이트 호스팅` | Connect/reconnect Cloudflare once and inspect accessible accounts | Only to authorize deployment later; connection can be deferred |
| New top-level `사이트` surface | Create/manage Projects and Sites, choose an external template, set the Project's optional root domain and storage root, configure template-supported fields | No |
| Project detail | See its Sites and shared Project settings; choose/bind one accessible Cloudflare account when first deploying a Site in this Project | Only when starting remote deployment |
| Site detail | Open the shared Astro source folder in another tool, run BlogGenius-managed local preview/build, inspect build status, and deploy this Site | Preview/build: no. Deployment: yes |
| Blog writing workflow | Create content and choose a managed Site as a publishing destination; BlogGenius writes the content into that Site and rebuilds/deploys according to the agreed publishing flow | Local content/build may not; remote deploy does |

Proposed first-use journey:

1. Open `사이트` and create a Project. BlogGenius proposes `workspace/site-hosting/projects/{project-id}` as its root. The user may keep that location or choose a different Project root. The Project can be created without a Cloudflare connection or account binding.
2. Set an actual custom root domain only if one is known. It is optional; do not use a fake placeholder. Add a Site and choose a template from the external catalog.
3. BlogGenius creates the Site package under `{project-root}/sites/{site-id}`. The Astro project root remains standard and can be opened by a separate Astro-capable tool; BlogGenius metadata is kept separately inside the package.
4. Set the template's supported fields, edit source in the external tool as needed, and build/preview locally without Cloudflare.
5. When the user chooses `배포`, connect Cloudflare if needed, select one accessible account for the Project, and deploy the Site. A Site uses its own Worker target (1:1 is the current candidate policy). The `workers.dev` URL is generated/obtained without requiring a custom domain.
6. Optionally configure the Project's single root domain and a Site hostname later. Apex handling remains a separate feature.
7. In the Blog writing flow, choose a Site as the content destination. Publishing content updates the selected Site and follows the separately agreed build/deploy confirmation flow.

Each Site is an independent build/deploy unit. A Project may have zero or one configured custom root domain: it may be created and used before the user owns or chooses one, but Sites in one Project must not use multiple unrelated root domains. When the Project has a root domain, a Site's optional hostname is interpreted within that domain (for example, `www` produces `www.example.com`, while `docs` produces `docs.example.com`). The Site's `workers.dev` address is an internal deployment address, not a user-entered custom domain. To manage a separate root domain, create a separate Project. Apex handling remains separate. Cloudflare custom-domain attachment requires an active zone, and an existing DNS record can block attachment; the app must explain conflicts rather than silently changing DNS. Local preview must not require an extra user-installed tool.

## Platform prerequisite requirement

- BlogGenius currently targets macOS Apple Silicon and Windows x64. Windows ARM64 may be considered later.
- The static-site feature should preserve the existing installation expectation: users install BlogGenius and do not need to separately install Docker, Node.js/npm, Git, Wrangler, or other development tools.
- Users may still need to authorize an external hosting account such as Cloudflare to deploy. Account authorization is distinct from installing a development tool.
- Windows ARM64 is a future compatibility consideration, not a presently guaranteed support target. Architecture and packaged dependencies should avoid unnecessary barriers where feasible; support requires later validation.

## Design questions to resolve

1. How should the Site's optional hostname be represented when a Project has no custom root domain? The Project may have zero or one root domain; `www` and other subdomain labels belong under that root. Apex handling is separate.
2. The default source-sharing model is a shared local Astro project. What file ownership and change-detection rules are needed when an external editor changes it? Should Git remain optional, and is export/import sufficient for cross-machine transfer?
3. Where do Astro dependencies, local preview, and builds run while preserving the no-extra-tool installation requirement?
4. 사용자 단위 Cloudflare 연결, 첫 배포 때 Project account binding, 배포 승인 및 복구를 어떻게 하며 site script나 산출물에 비밀정보가 노출되지 않게 할까?
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
| Project display name and optional Project root folder | Stable Project ID and machine-local root-path registry |
| Site display name (for example, “Product docs”) | Stable Site ID |
| Selected template and pinned template version | Parent Project ID |
| Template-supported settings (for example title, logo, menu) | Local Astro source location and source state |
| Optional Project custom root domain; optional Site hostname under it (for example `www`, `docs`) | Build/dependency/runtime metadata and build output location |
| Cloudflare account choice when deploying; optional custom-domain attachment | Cloudflare account/Worker identifiers and `workers.dev` URL |
| Content/site publishing choices supported by the selected template | Deployment history, status, timestamps, and diagnostics |
|  | Credentials/tokens in secure credential storage, never in site source/config |

This is a candidate list, not a committed schema. A hostname is exact: `www.example.com` and `example.com` are separate hostnames. Cloudflare Custom Domains attach to an exact hostname; supporting both requires separate hostname handling. Selecting `www` does not itself make the apex `example.com` work. Apex alias/redirect handling remains a separate feature.

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
- 하위 feature [Cloudflare 데스크톱 연결 통합](../archive/2026-10-02-cloudflare-desktop-connection-development.md)을 완료해 `설정 > 기본 연결 > 사이트 호스팅` UI와 OAuth connection API를 통합했다. 사용자가 실제 system-browser OAuth 승인과 계정 목록 표시를 확인했다. Project account binding/Worker 선택/배포는 후속 단계다.
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
- Cloudflare는 배포 기능의 prerequisite다. Project/Site 생성, template 설정, Astro 편집, local build/preview는 OAuth 연결 및 Cloudflare account 지정 없이 가능해야 한다. 계정 연결과 Project account binding은 첫 배포까지 미뤄도 된다.
- Astro build와 preview는 로컬에서 수행하며 Cloudflare와 무관하다. OAuth 연결/account는 원격 배포 시점에만 필요하다.
- Project/Site 관리는 설정의 Cloudflare 연결 카드가 아니라 별도 `사이트` top-level surface에 둔다. Cloudflare 연결은 설정에서 하고, static-site content destination은 BlogGenius 글쓰기 흐름에서 선택하는 안을 제안한다.
- 기본 Project root는 `workspace/site-hosting/projects/{project_id}`이고, 사용자는 Project별 다른 root를 지정할 수 있다. 각 Site는 Project root 아래 `sites/{site_id}`에 저장한다. Project metadata는 그 root에 두며, machine-local absolute path는 portable manifest와 분리하는 방향을 검토한다.
- 사용자는 논의를 무한정 끝내기보다 큰 경계와 위험을 먼저 합의한 뒤, 구현 결과에서 새로 드러난 점을 문서화하고 보완하는 반복 방식을 선택했다. 매 하위 기능 전마다 전체 설계를 다시 확정할 필요는 없다.
- 현재 UX 제안은 `설정 > 기본 연결 > 사이트 호스팅`에서 Cloudflare만 연결하고, 별도 `사이트` 화면에서 Project/Site 생성·편집·local preview/build/deploy를 관리하는 것이다. BlogGenius 글쓰기 화면에서 Site를 발행 대상으로 고르는 안은 사용자 확인 전이다.
- sidebar에 `웹사이트` 소그룹과 `사이트` 항목을 추가한다. 사용자는 `홈 → 웹사이트 → 콘텐츠 → 계정 → 시스템`을 잠정 순서로 적용하고 사용 후 변경하기로 했다. `웹사이트`를 먼저 두면 Project/Site/source/build/deploy를 아우르는 영역의 제품상 비중과 사이트 준비 흐름이 드러난다. `콘텐츠`를 먼저 두면 기존 BlogGenius의 익숙한 글쓰기·발행 흐름을 우선할 수 있다. 두 그룹은 부모·자식이 아닌 형제 영역이며, 실제 사용 흐름과 메뉴 탐색성을 확인한 뒤 순서를 재검토한다. `사이트` 첫 화면은 이후 Project 목록이 되며, 메뉴 slice에서는 준비 중 상태만 간결하게 알린다.
- Project/Site 관계, Project root, 선택적 domain, Cloudflare 경계와 기본 사용자 흐름의 설계 기록은 [완료된 설계 단계](../archive/2026-10-02-project-site-model-and-user-flow-design.md)에 보관한다. 세부 계약은 이후 구현 slice에서 보완한다.
- 첫 UI slice인 `웹사이트 > 사이트` 메뉴와 진입 화면은 [사이트 메뉴 및 진입 화면 개발 기록](../archive/2026-10-02-site-sidebar-navigation-development.md)에 기록했다. 해당 구현은 `codex/static-site-builder-main`에 병합되었으며, 다음 serial sub-feature는 사이트 화면 내부(Project/Site 관리 흐름) 개발을 다룬다.
- 가칭 Amade2는 외부 template source repository다. 저작 도구/CLI가 아니며 BlogGenius는 이 repository의 catalog와 source를 참조한다. 별도 consumer/tool 논의는 후속으로 미룬다.
- 이 최신 합의는 위의 과거 진행 기록 중 “Amade2 CLI” 또는 build 단계의 Cloudflare 의존을 전제한 문장을 대체한다.
- 이후 하위 기능은 직렬로 진행한다. 현재 `codex/project-site-model-and-flow` 설계 단계를 이 `codex/static-site-builder-main`에 먼저 병합하고, 메뉴 진입점 작업은 병합 완료 후 이 부모 브랜치에서 새 하위 브랜치로 시작한다. 이는 2026-10-01 기록의 “미래 작업은 dev에서 시작” 방침을 현재 sub-feature 흐름에 맞춰 구체화한 것이다.

## Verification and handoff

- Automated verification: not applicable; documentation/branch setup only.
- Manual review: user and agent should agree on initial product scenarios, source ownership, and local-vs-remote execution before the first implementation sub-feature.
- Current sub-feature work is tracked by its branch-specific development record; the parent integration record summarizes cross-stage decisions.
- Remaining risks: execution model and data/credential ownership materially affect privacy, cost, OS support, and feasibility; they must be resolved before product implementation.
