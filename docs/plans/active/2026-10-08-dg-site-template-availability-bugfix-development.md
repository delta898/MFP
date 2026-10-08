# DG site template availability bugfix

- Branch: `codex/bugfix-dg-site-template-availability`
- Start date: 2026-10-08
- Parent branch: `codex/static-site-builder-main`
- Status: Follow-up implementation in progress; saved-topic site settings are being added before queue execution support

## User need

An existing Digital Garden site (`DG1`) appears disabled as a Blog Beta posting target with the reason that its template is unavailable, even though its site manifest has a Vault root and publication filter and the site contains its installed Astro template files.

## Original goal and scope

Make existing Site Hosting sites report template availability from their installed site files, separately from whether the shared template catalog cache has downloaded the full package. Keep catalog package readiness as a requirement for creating or updating a site from that package. Preserve contract and Vault eligibility checks for posting.

In scope:

- Correct the existing-site availability and template-update distinction in the Site Hosting repository.
- Add focused repository/service regression coverage for a metadata-only catalog descriptor with an installed local site template.
- Keep the branch development record current and run focused Site Hosting tests.

Non-goals:

- Changing template download, catalog refresh, or package cache generation.
- Changing DG publication rules, Vault setup, contracts, or terminology.
- Modifying site data, installing a template package, merging, pushing, or releasing.

## Follow-up scope: Site Hosting targets in saved topics

After DG1 became eligible in Blog Beta's quick-writing target list, the user expanded this branch to continue site-target support for per-topic settings. This follow-up remains on the current branch.

In scope:

- Save a site's stable `project_id`, `site_id`, and `kind` in the topic `options.site_target` object.
- For Vault sites, also save the selected relative `destination_path`; do not save the normal site's `listing_route` as a publishing destination.
- Restore the saved target and Vault folder in saved-topic/queue-item editing.
- Permit saving a site target on a saved idea while continuing to reject moving it into the ready queue until the queue runner supports Site Hosting.
- Show live queue-readiness reasons on saved-topic list rows and prevent an invalid item from opening the promotion editor. This includes the explicit Site Hosting runner limitation.

Explicit non-goals for this follow-up slice:

- Site Hosting queue execution or scheduler integration.
- Automatically converting the normal site's `/blog/` listing route into a post destination.
- Persisting a queue readiness/diagnostic snapshot; readiness remains derived from current settings and capabilities.
- Commit, merge, push, or release.

## Findings and design

- `workspace/site-hosting/sites/<site>/.bloggenius/site.json` records the selected template identity, version, family, source revision, and setup inputs; it does not store `package_ready`.
- `workspace/site-hosting/template-cache/<template>/template.json` stores `package_ready`, written as `Boolean(includePackage)` during catalog cache generation. Catalog refresh requests metadata with `includePackage: false`.
- The existing-site repository currently maps a missing descriptor or `package_ready === false` to `template_status: unavailable`, despite the installed site having `template/astro` files.
- The repository should determine whether an existing installation is available from the local managed template directory and keep package readiness as a separate prerequisite for applying a newer cached template package.

## Decisions and tradeoffs

- The user asked to isolate this fix on a new bugfix branch based on `codex/static-site-builder-main`.
- The user asked to diagnose and improve the existing-template readiness issue; this branch will not change package download behavior.
- Existing site files remain the installed source of truth for the current site. A missing local template should still be reported unavailable.
- The quick-writing form is the reference for site selection and Vault folder selection. The saved topic's own settings are captured into that topic's `options`, independent of quick-writing defaults.
- A normal blog site's `listing_route` is informational only. Queue settings store stable project/site identity and `kind: "blog"`; they do not treat `/blog/` as a post path.
- A Vault topic stores its selected folder as a normalized relative `destination_path` under `options.site_target`.
- Site Hosting does not expose scheduled publishing in its settings UI. When editing a legacy topic that already has `post_status: "schedule"`, keep its stored value until the user changes it, while preventing selection of scheduled publishing for Site Hosting.
- Saved ideas may retain Site Hosting settings before the queue runner supports them. Promotion to the ready queue remains rejected until the execution path exists, avoiding a ready item that the runner cannot process.
- Saved ideas and already-ready items use the same live diagnostic. The saved-topic list exposes the issue through the existing readiness marker/popover and disables promotion while blocked; clicking an invalid promotion action no longer opens the editor just to reveal the same validation message.

## Progress log

- 2026-10-08: Inspected DG1's saved manifest and template cache. DG1 has Vault and publication-filter inputs and a local `template/astro` installation. The catalog cache descriptor has `package_ready: false` because refresh downloaded metadata/preview only. The repository incorrectly uses that cache flag to mark the existing site unavailable.
- 2026-10-08: Created this bugfix branch from `codex/static-site-builder-main`.
- 2026-10-08: Updated the template catalog to expose a metadata-only cached descriptor to read-only consumers even when its package source folder is absent. `copySource` still rejects incomplete packages, preserving the full-package requirement for creating a site.
- 2026-10-08: Updated existing-site status to use the site's installed Astro package for family templates (or site root for standalone templates). Shared cache readiness now only gates update availability, not whether the current installation is usable.
- 2026-10-08: Added regressions for metadata-only descriptor access/copy rejection, local installation availability, and Blog Beta's DG `posting_target` eligibility. Focused Site Hosting tests all pass: 31 tests across the template catalog, site repository, and site service.
- 2026-10-09: Began the user-approved saved-topic follow-up. Topic capture and edits now carry `options.site_target`; quick writing passes site identity and Vault's relative folder, while topic-only save continues to omit publishing settings.
- 2026-10-09: Saved-topic editing restores the Site Hosting target and Vault destination. If site lookup fails or the saved site is no longer eligible, its saved identity is retained in a disabled option rather than silently cleared.
- 2026-10-09: Site targets remain invalid for ready-queue promotion with an explicit unsupported-target error until queue execution is implemented. Added service forwarding coverage and Blog Beta quick-flow contract coverage. Focused topic/options/service tests pass (72 tests total); the focused quick-flow contract passes (24 tests); syntax checks and `git diff --check` pass.
- 2026-10-09: Corrected a regression found during user review: Site Hosting's `schedule` option is disabled in the saved-topic editor as well as quick writing. A pre-existing saved schedule is not silently rewritten; the user can change it to a supported mode. Focused verification passes (97 tests across the quick-flow contract, topic/options, and continuous-publishing service suites); syntax check and `git diff --check` pass.
- 2026-10-09: The user reported saved-topic tab activation still failing. Tracing the reservation-option change found a missing `topicEditor` declaration in `syncBlogNextSiteHostingOptions`; the function still read it, causing a `ReferenceError` during publishing-setting synchronization. Restored the declaration and kept the original per-button tab handlers; removed the unsuccessful delegated-handler experiment. The focused quick-flow contract passes 26 tests; syntax checks and `git diff --check` pass.
- 2026-10-09: Added the same derived readiness diagnostic to saved-topic list responses. Site Hosting now reports the specific current queue-runner limitation; incomplete saved items show their reasons in the existing list warning popover and have a disabled “대기열로 이동” action. The list action still opens the shared editor for items that are currently ready. Focused readiness, service, and quick-flow contract tests pass (82 tests); syntax checks and `git diff --check` pass.
- 2026-10-09: Updated readiness notices so only one reason popover can remain open across the queue and saved-topic lists. Selecting another warning closes the previous one; selecting the open warning closes it. Added a quick-flow contract check.
- 2026-10-09: Added outside-click dismissal for an open readiness reason popover while keeping clicks inside its trigger/popover from closing it. The focused UI contract covers this behavior; all 82 focused tests pass, along with queue UI syntax and diff checks.

## Original verification and handoff

- Focused checks passed: `node --test src/site-hosting/site-template-catalog.test.js src/site-hosting/site-repository.test.js src/ui-api/services/site-hosting-site.service.test.js` (31 tests); `git diff --check`.
- Manual UI confirmation remains for the user: reopen Blog Beta quick-create and confirm DG1 becomes selectable while actually unsupported/missing local templates remain disabled.
- Commit/merge/push: pending; no push is authorized.

## Follow-up verification and handoff

- Current focused verification: `node --test src/continuous-publishing/queue-readiness.test.js src/ui-api/services/continuous-publishing.service.test.js scripts/blog-next-quick-flow-contract.test.js` (82 passing), including saved-site readiness and list action contracts; syntax checks for changed queue UI scripts and `git diff --check` pass.
- Remaining: inspect final diff and perform user-owned visual confirmation of saving/restoring a normal site and a DG Vault folder in the saved-topic editor.
- Queue runner integration, browser UI regression, and end-to-end site posting remain future work. Do not describe Site Hosting as queue-supported until that work is complete.
- Commit/merge/push remain pending and unauthorized.
