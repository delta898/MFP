# Astro Project ZIP Import to Site

- Branch: `codex/site-hosting-astro-project-import`
- Base/parent branch: `release/v0.6.0`
- Start date: 2026-10-11
- Status: ZIP import UI supports prompt/upload → one-step settings analysis → inline preview → creation, with imported-site preview/settings and initial thumbnails; automated focused checks pass, user visual acceptance remains

## User need

Users may describe a website in their own words, use a supplied AI meta-prompt with an agent/tool of their choice, receive a ZIP, and create a BlogGenius Site from it. The generated project should work for ordinary hosting even when it does not implement BlogGenius article publishing. The Site flow may optionally let users adjust a small set of identity/navigation settings before creation, or show a read-only preview and create directly.

## Goal and scope

Design, in reverse from the Site creation experience, the handoff contract across four stages:

1. A copyable AI meta-prompt with a small, obvious user-editable section and strong defaults for non-expert users.
2. An Astro project ZIP produced by an AI/tool or packaged by the user.
3. BlogGenius archive inspection, validation, preview preparation, and mapping into the Site model.
4. A Site creation experience that can either allow safe profile/navigation edits or create from a read-only preview.

The intended result is a ZIP import path that reuses existing Site Hosting build, preview, deployment, Cloudflare account, and domain-management workflows where their contracts apply. Template registration remains a separate optional action. A project may be hosted even when it does not implement BlogGenius article publishing.

## Reverse design proposal (discussion draft)

This section captures the agreed support tiers and remaining implementation details.

### Stage 4: User-facing Site creation result

The primary outcome is a Site the user can preview and deploy. For non-expert users, the flow should have a low-friction default: inspect the uploaded ZIP, show a preview and concise summary, then create. Hosting is valuable on its own even when the project has no BlogGenius publishing integration. A secondary “adjust before creating” path may expose only settings BlogGenius owns and can safely apply without rewriting project design:

- Site name (required BlogGenius identity)
- Logo, if the project has a supported logo slot
- Navigation labels and destinations, if the project declares editable navigation

The UI must distinguish fields that are genuinely editable from project content that is only being previewed. If the uploaded project does not declare a supported logo/menu slot, do not imply that changing those values will update the site. Read-only preview remains a valid creation path. Overrides should be retained as Site configuration and applied through an explicit adapter; they should not silently mutate arbitrary Astro source files.

Support tier is determined by the optional descriptor: absent or invalid descriptor means read-only import; a valid descriptor can unlock supported edits and publishing integration. The user should still be able to create a read-only hosted Site when descriptor validation fails, provided the Astro project itself passes hosting validation.

### Stage 3: What BlogGenius needs from the ZIP

BlogGenius needs to determine, without trusting archive contents:

- Which directory is the Astro project root.
- Whether the project declares Astro and has enough build inputs for supported local build.
- What preview information can be shown before Site creation (at minimum a build result or safe preview artifact generated in an isolated staging location).
- Whether BlogGenius can safely expose editable identity/navigation fields.
- Whether the project opts into the separate BlogGenius publishing contract.
- Any dependency/build requirements needed by the existing Site Hosting build pipeline.

Draft boundary: recognize a small, versioned BlogGenius import descriptor next to the Astro project, rather than guessing site-editing semantics from arbitrary source. The descriptor is distinct from reusable Template metadata. It should declare the project root and capabilities/slots, not duplicate values that the existing Site configuration UI already collects. Descriptor processing is capability-based and non-blocking for hosting:

1. Descriptor absent → read-only import; Astro project may still be hosted.
2. Descriptor present but malformed, unsupported, or inconsistent → report that enhanced integration is unavailable and offer read-only import; do not trust any partial declarations.
3. Descriptor present and fully valid against both schema and project → enable only the explicitly declared and verified editing capabilities and BlogGenius publishing integration.

The validator must not infer enhanced capabilities from a partially valid file. “Fully valid” includes consistency checks against actual pages, content sources, build configuration, and publishing contract artifacts where applicable. A valid declaration alone is not enough if the project does not implement the declared behavior.

### Current ZIP import flow: analyze, confirm settings, create

The existing Site creation dialog is organized around choosing a Template. Keep that path intact and make the creation method explicit before showing its contents:

1. **Choose creation method:** two clear choices, “템플릿으로 만들기” and “Astro ZIP 가져오기.” This avoids presenting an upload as if it were another Template.
2. **Astro ZIP 가져오기 view:** show a short three-step guide: copy the prompt, ask an AI tool to create/download the Astro project ZIP, then upload the ZIP here. Provide `프롬프트 복사` and a separate `사용 방법` link/expandable help. Keep the full meta-prompt out of the main form; a secondary view can show it for review.
3. **Upload and inspect:** after ZIP selection, analyze the Astro project and any `.bloggenius/site.json`. Prefer usable metadata, salvage valid fields from incomplete metadata, then infer missing values from Astro project files. Show the project summary and proposed settings rather than requiring a specific metadata file or hardcoded project layout.
4. **Confirm settings and create:** allow the user to correct Site name, description, search indexing, and menu labels/paths in the existing Site creation dialog. Save those settings in BlogGenius `.bloggenius/site.json` alongside the imported Astro project. These settings describe BlogGenius's Site record; this import stage does not rewrite arbitrary Astro source or promise that the uploaded site's own navigation changes. Then reuse the existing Site preview/build/deploy/domain flow.

ZIP analysis itself must not execute project code. The user explicitly starts that work by choosing `설정`; the settings step then prepares a preview in a temporary copy. Creating the Site runs the normal build for the persistent project and captures its first card thumbnail. If that build fails, keep the imported Site and show the failure so the user can retry through Preview or Deploy.

If Astro project validation fails, keep the uploaded file selection and show a short actionable reason plus a way to replace the ZIP. Missing or incomplete BlogGenius metadata is not a project failure: infer what can be inferred and let the user correct the proposed fields. Errors should live in one message area for that import flow rather than appearing in both the upload control and a second global message.

Inspection should validate ZIP paths, file types, size/count/depth limits, Astro project identity, descriptor schema, build inputs, and declared capabilities before creating a persistent Site. Errors should identify a fix in user language. Inspection must not execute scripts from the archive; dependency installation/build is a separate, clearly communicated trust boundary. Invalid input should leave no partial Site.

### Stage 2: What the AI/tool should package

The archive must contain one identifiable Astro project. The BlogGenius import descriptor is optional: its absence yields read-only import and does not reduce the hosting value. When present, it may request enhanced editing and publishing capabilities, which BlogGenius must verify before enabling. The archive should not require a registered Template package or Template metadata. It should omit generated dependencies, caches, secrets, local environment files, and unrelated parent-directory files. The meta-prompt should tell the agent to produce the project and, when enhanced integration is requested, a descriptor; verify the project locally where possible; and create a ZIP with a predictable top-level structure. Users may create the ZIP themselves, so the structure and checklist must also be understandable to a person.

Open packaging choices include whether to require a root-level project or allow exactly one containing folder, whether to include a lockfile, and whether to include a static preview image or seed content. Current recommendation: include the lockfile when the chosen package manager generated one, omit dependencies and build output, and treat preview images and seed content as optional. Blog content should not be required for a general homepage.

### Stage 1: What the meta-prompt should cover

The prompt should do most of the work for someone who only knows how to describe what they want. It should have a short editable “my site” section (purpose, audience, name, mood/references, sections/pages, language, optional contact/social links) and stable instructions that:

- Produce a complete, responsive Astro project compatible with BlogGenius Site Hosting.
- Use accessible semantic markup, restrained motion, and sensible mobile behavior.
- Avoid requiring code edits after generation for a baseline result.
- Keep site-specific content and assets local to the project; include no credentials or private data.
- For the basic path, produce a complete Astro site that can be hosted without a descriptor. For enhanced BlogGenius editing/publishing, produce an import descriptor matching the agreed contract and accurately declare capabilities.
- Explain the output tree, local verification steps, and ZIP packaging.
- Clearly say whether article publishing is supported; do not claim support unless its contract is implemented.

### Imported Site settings follow-up (2026-10-11)

The user clarified that imported Sites were missing **Settings**, not Delete. Imported Astro Sites expose the Settings action. Its dialog edits only BlogGenius metadata: Site name, description, search indexing, images, and navigation labels/paths. Supported settings are applied to `site-data/site.json`; arbitrary Astro source remains untouched. Saving an imported Site with a declared integration rebuilds it and refreshes its thumbnail. The shared Preview action starts a temporary copy with the current form settings, leaving the saved Site unchanged until the user applies the changes. Focused service and UI contract tests pass. Manual UI acceptance remains with the user.

The prompt must not imply that an agent can guarantee a successful build without running it. It should ask the agent to report build failures and unresolved assumptions. A later wizard can populate the editable section; before that exists, the prompt itself serves as the guided input surface.

### ZIP import screen refinement (2026-10-12)

The user asked to bring the PoC screen closer to the existing template creation experience. The upload view now keeps the guide/prompt and ZIP picker in independent-height cards so expanding the prompt does not stretch the upload card or its action. Selecting a ZIP remembers its parent directory for the next native picker opening. A single `설정` action inspects the archive and opens editable settings; the old separate analysis/results confirmation step is removed. The creation footer is hidden until settings are open, then uses the shared `취소` / `미리보기` / `사이트 만들기` actions. Imported previews build in a temporary draft and appear in the left preview pane; they do not create a persistent Site. Preview failures retain any prior valid preview. User visual acceptance remains pending.

### Import preview polish (2026-10-12)

The user asked to remove the repeated page/menu analysis summary from both views, align the ZIP upload card with the prompt guide without making it grow when the prompt expands, give the settings preview more room, and automatically prepare the preview when settings open. The status summary is now hidden after successful analysis and while settings are displayed. The upload card uses a stable minimum height with its action anchored at the bottom. The settings preview stretches with the settings content and has a larger minimum canvas. Entering settings now immediately builds a temporary preview; the existing footer preview action remains available for retries after build failure or later edits. The settings action already represented an explicit user step before running uploaded build code; its helper copy now says that analysis and preview preparation will start.

### End-to-end direction

Describe needs → copy/edit meta-prompt → AI/tool generates Astro project plus import descriptor → user uploads ZIP → BlogGenius validates and stages → read-only preview or limited supported edits → create Site → existing preview/deploy/domain flow. Template registration can be offered later as a distinct action and is not required to create the Site.

### Declared settings integration (2026-10-12)

The user confirmed the goal is an end-to-end feasibility path for a ZIP that follows the provided meta-prompt: supported common settings should show in the settings UI, update the preview, persist into the Astro project's shared config, and be present in the created/deployed site. The project-owned `project` object and unknown fields remain intact. BlogGenius continues to own `.bloggenius/site.json`; the uploaded project declares its editable config in `site-data/site.json` and capability flags in `bloggenius/project.json`.

Implemented one importer integration path across inspection, temporary preview, Site creation, and saved Site settings:

- The inspector reads `bloggenius/project.json`, validates the schema and declared `settings_support` booleans, validates required `site-data/site.json` fields per capability, and checks for the project's shared config module. Only declared and structurally present capabilities are editable. The import metadata stores the validated capability summary, not the project settings object.
- Site identity, description, indexing, navigation labels/paths, logo, favicon, and share image flow into `site-data/site.json` when supported. Menu IDs and unknown menu fields are preserved, as are all other project-owned/unknown settings fields. Selected image bytes are placed under the Astro root `public/` and the shared config stores the public path.
- Existing configured raster images are read from safe paths within the ZIP's `public/` directory and shown in the setup/settings UI. Replacing or removing them follows the same project-config path; unsupported formats or missing files remain replaceable through the normal PNG/JPG/WebP controls.
- Temporary preview applies the same settings to a copied project before Astro build. Import creation applies settings before saving `.bloggenius/site.json`. Saving later Site settings applies the same adapter and builds the Site again so changed metadata/settings can be checked in the result.
- Menu entries with ID `posts` retain their identity through form submissions and updates; inspector prefers that explicit ID when selecting the suggested post-list menu, instead of guessing from unrelated `getCollection()` calls on the home page.
- Imported menu destinations are constrained to internal paths. A `posts` menu cannot use `/`, consistent with the prompt's URL contract that post detail routes derive from the selected listing path.
- The meta-prompt and its implementation notes now describe this shared contract and the distinct ownership of ZIP metadata versus BlogGenius Site metadata.

Validation on 2026-10-12:

- Extracted `/Users/delta898/Downloads/mentivenus-site_codex.zip` to a temporary directory and ran the real inspector. It reported valid descriptor/settings, all five declared capabilities (`site_identity`, `navigation`, `logo`, `favicon`, `share_image`), four navigation entries, and selected the `posts` menu (`/blog/`) at index 2.
- Focused checks passed: `node --test src/applications/site-hosting/domain/astro-project-inspector.test.js src/adapters/storage/site-hosting/site-repository.test.js src/ui-api/services/site-hosting-site.service.test.js scripts/site-hosting-create-mode-tabs-ui-contract.test.js` (39 tests), `node --check` for the changed JavaScript modules, and `git diff --check`.
- Static structural checks cannot prove arbitrary Astro source fully honors a declared capability. The actual ZIP still needs a live preview/build and user visual acceptance. Detailed archive limits and hostile ZIP handling remain follow-up hardening, outside this settings-integration slice.

## Design constraints and initial assumptions

- The ZIP is untrusted input. Archive paths, file types, sizes, nesting, and extraction destinations need explicit limits and traversal protection.
- Project validation should identify a supported Astro project from package metadata and build inputs without executing package scripts during archive inspection.
- Dependency installation and Astro build execute project-controlled code. Their trust boundary, user messaging, cancellation, and failure recovery must be explicit and consistent with current Site Hosting behavior.
- Import should stage files separately and only create/publish Site metadata after validation and extraction succeed.
- The import path should not require or synthesize BlogGenius Template metadata. Site metadata remains BlogGenius-owned and should not overwrite user project files.
- No contract or package version changes are planned unless investigation proves a contract change is required; ask the user to choose the exact version before changing a shared Amade contract version.

## Stages

1. **Product agreement:** agree on the read-only/default creation path, editable fields/capabilities, and the point where an uploaded project is considered valid.
2. **Import contract:** settle ZIP layout, descriptor ownership/fields, descriptor optionality, build/install behavior, limits, and error categories. Document examples an AI agent and a human can both follow.
3. **Meta-prompt:** write the copyable prompt from the agreed contract, with user-editable inputs clearly marked and safe defaults for non-experts.
4. **Implementation:** only after explicit approval, add bounded archive validation/extraction, Site creation mapping, preview/edit flow, and the prompt artifact/UI. Keep non-template imports explicit in Site metadata only where existing contracts require it.
5. **Verification:** run focused service, repository, archive-security, and UI contract tests; run the relevant browser smoke flow when the end-to-end import flow is ready. Do not run the full unit suite without explicit approval.
6. **Handoff:** summarize supported ZIP shape, tested limits/failure paths, manual UI acceptance steps, and remaining constraints. Do not commit, push, merge, or delete this branch without a separate user request.

## Decisions made with the user

- The capability is a separate FBR with discussion, design, development, and testing on that branch.
- The first path is direct Astro project ZIP upload → Site creation → existing deployment flow. Template creation is optional and outside the ordinary import path.
- A project may be hosted even if it cannot be selected for BlogGenius article publishing.
- The wider AI site generation mechanism remains undecided and is not required for this import feature.
- The design should proceed in reverse from the user's Site creation outcome toward ZIP validation, AI output requirements, then the copyable meta-prompt.
- A later wizard is a future improvement; the first version can use a carefully designed prompt as the guided input surface.
- The first PoC uses one general-purpose meta-prompt for any requested site; audience-specific prompt recipes are deferred until the shared flow is proven.
- ZIP import support tiers: no descriptor means read-only hosting; present but invalid descriptor also falls back to read-only hosting; a valid and project-consistent descriptor enables declared editing and BlogGenius publishing capabilities.
- Astro project hosting/deployment is independently valuable even when there is no BlogGenius-compatible blog menu or publishing integration.
- Delivery is divided into four successive phases: (1) copyable meta-prompt, guide, and read-only ZIP import; (2) descriptor-validated editing and BlogGenius publishing integration; (3) a prompt-generation Wizard; (4) direct AI-powered Astro project generation inside BlogGenius.
- The imported Astro source stays unchanged. Before creation, users may adjust BlogGenius-owned identity and menu metadata; this does not imply that the uploaded project's visual navigation or content is edited.

## Progress and verification

- 2026-10-11: Created this branch from the clean `release/v0.6.0` checkout and added the branch record before implementation.
- 2026-10-11: Read-only discovery found that Site creation currently requires a catalog Template ID and copies template files; Site reads also classify missing catalog templates as unavailable. Direct imports therefore need explicit source/provenance rather than a fake Template.
- 2026-10-11: Astro build already supports a project rooted either at the Site root or `template/astro`, so a staged imported project can likely use the Site root without an additional build-root mode.
- 2026-10-11: The Site creation UI currently centers on template selection and a profile form. A separate import action can share Site Hosting's existing project/list and build/deploy flows, subject to the source/provenance design.
- 2026-10-11: User specified reverse design order and a non-expert-oriented copyable prompt with a small user-editable area; a future wizard may replace or supplement it.
- 2026-10-11: User agreed on three support tiers: no descriptor → read-only import; invalid descriptor → read-only fallback; fully valid descriptor and matching project → declared edit capabilities and BlogGenius publishing. Hosting is available regardless of publishing support once the Astro project itself is valid.
- 2026-10-11: User organized delivery into four phases (prompt/read-only import, editing/publishing integration, prompt Wizard, direct in-app AI generation). Added a Phase 1 UI proposal that separates Template creation from ZIP import and guides users from prompt copy through upload, inspection, build preview, and read-only Site creation.
- 2026-10-11: User selected tabs inside the existing Site creation dialog as the separation point. Implemented the Template/ZIP tab shell and keyboard-accessible tab switching.
- 2026-10-11: User asked to move directly to ZIP selection and Site creation using `dambaek-record.zip`, deferring guide/prompt and detailed ZIP integrity work. Added a native ZIP picker, short-lived server-side selection token, Astro project checks (`package.json`, lockfile, Astro dependency, and build script), extraction into a temporary directory, and Site-root import with explicit `source.kind: imported-astro` metadata. The imported project appears in the Site list without pretending to be a catalog Template.
- 2026-10-11: Initial ZIP import deliberately did not run the project's npm install or build scripts. The 2026-10-12 flow now starts temporary preview preparation after the user clicks `설정`, and builds the persistent Site after the user clicks `사이트 만들기` so its list card has a thumbnail. Imported Sites remain ineligible for BlogGenius post publishing unless a separate publishing capability is implemented.
- 2026-10-11: Focused repository/service/route/UI contract tests pass (44 tests), and `git diff --check` passes. Separately exercised the supplied `/Users/delta898/Downloads/dambaek-record.zip` through the native ZIP extractor in a temporary workspace: it was recognized as Astro 7.3.7 with `astro build`, its `/blog/` page was imported, and no build output was created. Browser smoke remains unavailable because local loopback binding is denied by the sandbox; user visual acceptance remains outstanding.
- 2026-10-11: Investigated the report that `사이트 만들기` did nothing with a ZIP selected. The hidden Template tab still contained a required site-name input, so native browser validation could block form submission before the ZIP handler ran. Disabled native form validation for this multi-mode form; the existing mode-specific JavaScript checks remain authoritative. ZIP import errors now appear in the ZIP panel's single status area. Focused UI contract plus route/service tests pass (35 tests), and the updated UI contract test and `git diff --check` pass. Manual retry in the running app remains outstanding.
- 2026-10-11: User clarified the intended flow: inspect the actual uploaded project (not Amade-specific constants), prefer and salvage `.bloggenius/site.json` when present, infer remaining identity and navigation details from Astro project files, then present a Site-settings-like form for user correction before creation. Implemented Astro project inspection, ZIP analyze endpoint, editable BlogGenius-owned name/description/indexing/menu metadata, and import creation that preserves the Astro source unchanged. Fixed the source-directory path error found by focused tests and updated the service assertion to confirm Astro source preservation. The focused inspector, UI contract, route, and service suite passes (37 tests); `git diff --check` passes.
- 2026-10-11: User approved making the sequence explicit as ZIP → analysis → settings → creation. Split the analyzed summary and settings form into separate steps, added forward/back controls, kept the same message area across steps, and enabled site creation only after the user enters the settings step. Updated the UI contract assertions. Focused inspector, UI contract, route, and service checks pass (37 tests); `git diff --check` passes. Gemini's ZIP failure is not diagnosed because its archive and error message have not been provided.
- 2026-10-11: User reported the ZIP settings view could not scroll to its menu section. The workspace clips overflow to keep the header and footer fixed, while the ZIP panel had no scroll container. Added vertical scrolling and minimum-height handling to the ZIP panel; the focused UI contract test and `git diff --check` pass. User visual retry remains pending.
- 2026-10-11: Matched the ZIP import settings step to the existing Site settings layout: a preview area on the left and editable Site metadata on the right. The preview area is a placeholder with a disabled build button; no ZIP build or project script runs automatically or from this button in this stage. The imported Site name is reflected in the preview frame title. The UI contract and Site Hosting service checks pass (25 tests), and `node --check` plus `git diff --check` pass. User visual acceptance remains pending.
- 2026-10-11: Added a guided ZIP-tab flow with a single reusable Korean Astro site meta-prompt, expandable prompt review, clipboard copy with a manual-selection fallback, and a separate direct-ZIP path for users who already have an archive. The prompt requests package/lockfile consistency and verifies with `npm ci` plus `npm run build`; site-specific prompt recipes remain deferred for this PoC. The focused UI contract test passes; JavaScript syntax and `git diff --check` pass. Actual clipboard behavior and visual acceptance remain for the user to verify in the app.
- 2026-10-11: Reorganized the ZIP preparation step into a responsive two-column layout: guide/prompt copy on the left and ZIP selection/analysis/results on the right, with the Astro introduction spanning both columns. Expanded the panel width to use more of the dialog; the columns stack on narrower screens. The focused UI contract test, JavaScript syntax check, and `git diff --check` pass; visual acceptance remains with the user.
- 2026-10-12: Refined the import flow per user direction: prompt expansion no longer stretches the upload card, ZIP picker remembers the last directory during the app session, one `설정` action analyzes and opens settings, and footer actions appear only in settings. `미리보기` now builds an imported project in a temporary draft and displays it in the left pane; changing import metadata/menu marks the preview stale. Focused UI contract and Site service checks plus syntax/diff checks pass; user visual acceptance remains pending.
- 2026-10-12: Removed the repeated successful-analysis message block, gave the upload card a stable matching height with a bottom-aligned action, enlarged and stretch-aligned the settings preview, and auto-started the temporary build/preview after ZIP analysis succeeds. The upload copy makes the build step clear; successful preview status no longer overlays the site. Focused UI contract and Site service tests pass (25 tests), JavaScript syntax checks pass, and `git diff --check` passes. User visual acceptance remains pending.
- 2026-10-12: Added optional logo, share image, and favicon controls to imported Astro Site creation and settings. The image files are stored under `.bloggenius/assets/` and referenced from BlogGenius metadata; copy explicitly states that arbitrary Astro source will not automatically render these assets. Imported navigation now has a BlogGenius post-list menu radio, initialized from inspection when a candidate is inferred, and the selection persists as menu metadata without making the Site eligible for BlogGenius publishing. Updated the imported navigation grid to reserve space for the radio and full-width remove action, fixing the previous overlap. Focused service/inspector/UI contract checks pass (27 tests), JavaScript syntax checks and `git diff --check` pass. User visual acceptance remains pending.
- 2026-10-12: Drafted a copyable Astro project meta-prompt at `docs/features/site-hosting-astro-project-meta-prompt.md`. It proposes `site-data/site.json` as the shared project settings file and `bloggenius/project.json` as a per-feature support declaration, while keeping `.bloggenius/site.json` BlogGenius-owned. This is a testable PoC contract, not an implemented or validated importer contract; the next step is to generate and inspect a ZIP with another AI before aligning project inspection, preview, build, and settings persistence.
- 2026-10-12: Fixed the imported-site settings follow-up reported during hands-on use. Import now runs the normal Site Hosting build once after the user submits “사이트 만들기” and returns the captured screenshot so the new Site card has a thumbnail immediately; build failures keep the imported Site and surface the error. Existing imported Sites now keep the shared “미리보기” action, which clones the Site into a temporary draft and applies the current form values there, leaving saved files untouched until “변경사항 반영.” Also moved the import preview loading status to the top of its viewport and retained the saved Site name as a defensive fallback when collecting settings. The focused service tests (including preview isolation), ZIP UI contract test, and syntax/diff checks pass; browser visual acceptance remains pending.
- 2026-10-12: Fixed two further hands-on issues in imported Site settings. The submit handler now awaits asynchronous collection of imported settings (including image reads) before sending the payload; previously it sent a Promise object, causing the server to receive no Site name and reject the update. Moved the import preview status out of the iframe canvas into its own row directly below the preview toolbar so it stays visible above the viewport content. Focused ZIP UI contract and Site Hosting service tests pass (26 tests); JavaScript syntax and diff checks pass. User visual acceptance remains pending.
- 2026-10-12: Applied the structured meta-prompt to the BlogGenius ZIP import screen. The runtime prompt is now included from its own UI partial and kept byte-for-byte aligned with the documented prompt by a focused UI contract. The user-facing form begins with the editable-by-copy example checklist, followed by the HTML comment note and Astro/BlogGenius project requirements. Updated the guide and copy feedback to explain replacing examples, renamed the ZIP analysis action to “가져오기,” and removed the upload card's forced minimum height and bottom-pinned action that created excess empty space. Focused UI contract/Cloudflare Site UI checks, composed-HTML prompt inclusion, syntax, and diff checks pass; user visual acceptance remains pending.

## Open design decisions

- Determine safe archive size, file count, path depth, symlink, and extraction-time limits.
- Refine the structural check of the Astro config module; current source-token inspection is a lightweight signal, while build/preview is the practical behavior check.
- Decide how build output and errors should surface if settings are persisted but a subsequent build fails; current service returns a visible build error and keeps the saved settings.
- Publishing eligibility remains a separate capability and is not granted by the common settings descriptor or the `posts` menu ID alone.

## Remaining risks and manual acceptance

- Establish safe limits for compressed and expanded size, file count, path depth, symlinks, and extraction time based on current desktop capabilities; this PoC currently leaves detailed limits deferred.
- Decide how dependency installation/build scripts are communicated and run, since a valid Astro ZIP can still contain arbitrary project code.
- Decide whether invalid project input leaves no Site record or creates a visible failed-draft Site; default assumption is no partially created Site.
- Manual acceptance for this slice: upload `mentivenus-site_codex.zip`, choose `설정`, verify the `뉴스` menu is selected as the post-list menu and images/settings load, change a name/menu/image and inspect the rebuilt preview, create the Site, and verify the same settings in its deployed output. Also confirm a ZIP without the declaration remains read-only. User visual acceptance remains pending.
- Later archive-hardening acceptance should cover malformed/non-Astro ZIP, archive traversal attempts, build failure/cancel, deployment, and an imported project without publishing support.

## 2026-10-12 preview consistency follow-up

- Moved the region progress layer toward the top of the ZIP import preview so its message aligns with the site-description controls; the existing-site settings preview uses the same position.
- Reused the left settings preview pane for both imported Astro and template-backed site settings. The separate large preview dialog remains for the initial template creation flow.
- Added an inline iframe and status region to the current-site preview, kept the prior screenshot visible until a preview is requested, and changed the browser smoke expectation to verify the inline settings preview.
- Refined the ZIP upload step with equal-height guide and upload cards, quieter shared card styling, and a centered file selection area with a clear next action.
- Site creation now uses the shared `region-indeterminate` progress layer while loading the template catalog, replacing the standalone loading text and preserving dialog cancellation. Merge review caught and fixed an inert-state restoration ordering issue so the template panel becomes interactive again after loading. The focused Site Hosting tests (50) and browser smoke pass; JavaScript syntax and diff checks pass.
- Focused UI contract tests and browser smoke passed. The browser smoke blocks external Google Fonts requests by design.
