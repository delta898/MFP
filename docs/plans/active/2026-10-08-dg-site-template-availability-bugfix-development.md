# DG site template availability bugfix

- Branch: `codex/bugfix-dg-site-template-availability`
- Start date: 2026-10-08
- Parent branch: `codex/static-site-builder-main`
- Status: Implementation complete; ready for user review

## User need

An existing Digital Garden site (`DG1`) appears disabled as a Blog Beta posting target with the reason that its template is unavailable, even though its site manifest has a Vault root and publication filter and the site contains its installed Astro template files.

## Goal and scope

Make existing Site Hosting sites report template availability from their installed site files, separately from whether the shared template catalog cache has downloaded the full package. Keep catalog package readiness as a requirement for creating or updating a site from that package. Preserve contract and Vault eligibility checks for posting.

In scope:

- Correct the existing-site availability and template-update distinction in the Site Hosting repository.
- Add focused repository/service regression coverage for a metadata-only catalog descriptor with an installed local site template.
- Keep the branch development record current and run focused Site Hosting tests.

Non-goals:

- Changing template download, catalog refresh, or package cache generation.
- Changing DG publication rules, Vault setup, contracts, or terminology.
- Modifying site data, installing a template package, merging, pushing, or releasing.

## Findings and design

- `workspace/site-hosting/sites/<site>/.bloggenius/site.json` records the selected template identity, version, family, source revision, and setup inputs; it does not store `package_ready`.
- `workspace/site-hosting/template-cache/<template>/template.json` stores `package_ready`, written as `Boolean(includePackage)` during catalog cache generation. Catalog refresh requests metadata with `includePackage: false`.
- The existing-site repository currently maps a missing descriptor or `package_ready === false` to `template_status: unavailable`, despite the installed site having `template/astro` files.
- The repository should determine whether an existing installation is available from the local managed template directory and keep package readiness as a separate prerequisite for applying a newer cached template package.

## Decisions and tradeoffs

- The user asked to isolate this fix on a new bugfix branch based on `codex/static-site-builder-main`.
- The user asked to diagnose and improve the existing-template readiness issue; this branch will not change package download behavior.
- Existing site files remain the installed source of truth for the current site. A missing local template should still be reported unavailable.

## Progress log

- 2026-10-08: Inspected DG1's saved manifest and template cache. DG1 has Vault and publication-filter inputs and a local `template/astro` installation. The catalog cache descriptor has `package_ready: false` because refresh downloaded metadata/preview only. The repository incorrectly uses that cache flag to mark the existing site unavailable.
- 2026-10-08: Created this bugfix branch from `codex/static-site-builder-main`.
- 2026-10-08: Updated the template catalog to expose a metadata-only cached descriptor to read-only consumers even when its package source folder is absent. `copySource` still rejects incomplete packages, preserving the full-package requirement for creating a site.
- 2026-10-08: Updated existing-site status to use the site's installed Astro package for family templates (or site root for standalone templates). Shared cache readiness now only gates update availability, not whether the current installation is usable.
- 2026-10-08: Added regressions for metadata-only descriptor access/copy rejection, local installation availability, and Blog Beta's DG `posting_target` eligibility. Focused Site Hosting tests all pass: 31 tests across the template catalog, site repository, and site service.

## Verification and handoff

- Focused checks passed: `node --test src/site-hosting/site-template-catalog.test.js src/site-hosting/site-repository.test.js src/ui-api/services/site-hosting-site.service.test.js` (31 tests); `git diff --check`.
- Manual UI confirmation remains for the user: reopen Blog Beta quick-create and confirm DG1 becomes selectable while actually unsupported/missing local templates remain disabled.
- Commit/merge/push: pending; no push is authorized.
