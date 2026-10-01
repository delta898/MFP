# Static Template Contract Spike

## Branch and status

- Branch: `codex/static-template-contract-spike`
- Start date: 2026-10-01
- Base/parent branch: `codex/static-site-builder-main`
- Status: Contract proof implemented and focused checks pass; ready for design review.
- Parent feature: [Static Site Builder Main Feature](2026-10-01-static-site-builder-main-development.md)

## User need and goal

The user wants BlogGenius (desktop UI) and Amade (Docker CLI) to be independent tools. BlogGenius must never invoke, bundle, or depend on the Amade CLI because that would introduce a Docker dependency. Both tools may independently consume a neutral template specification managed by a separate template project. The current Amade template is not a standard and may be replaced or discarded.

This spike should test whether a small, tool-neutral template contract can describe a template's identity/version, its user-adjustable settings, and the source files needed to produce an Astro site. It is an experiment to inform discussion, not a decision to adopt the contract or begin the full product implementation.

## Scope

- Define one minimal, disposable template example from scratch, not by modifying or extending Amade's existing starter.
- Explore how a template can declare a small set of inputs such as site title, logo, and navigation menu.
- Explore validation, deterministic rendering/copying, version pinning, and source integrity at the contract boundary.
- Keep the contract independent of Electron, Docker, Amade CLI, Cloudflare credentials, and BlogGenius internals.
- Use this repository only as a temporary spike location; if the result is useful, move the agreed canonical specification and template sources into a dedicated template repository in a later stage.

## Explicit non-goals

- Do not change or depend on the existing `/Users/delta898/Project/Amade` template files.
- Do not implement BlogGenius UI, Astro runtime packaging, local preview, Cloudflare authentication/deployment, custom domains, or content publishing.
- Do not implement template upgrades/migration for existing sites.
- Do not establish a production catalog service, CDN, registry, payment/license model, or repository name in this spike.
- Do not make the Amade CLI a BlogGenius dependency or shared runtime.
- Do not commit, merge, push, publish, or deploy this sub-feature without explicit instruction.

## Proposed experiment

Create a small, isolated fixture and validator/rendering proof that answers:

1. Can a descriptor express stable template ID/version, supported settings, required files, and compatibility requirements without encoding either consumer's runtime?
2. Can settings be schema-validated and applied deterministically to an Astro starter without arbitrary code execution from the descriptor?
3. Can a pinned template package be integrity-checked before use?
4. Can an independent consumer use the same artifact shape without importing the Amade CLI?

Favor plain data plus explicitly supported substitutions/copy rules. Avoid designing a general-purpose templating language. Record what could not be answered by this bounded proof.

## Design decisions and open questions

- Agreed direction: template specification and sources belong outside both tool repositories, likely in a dedicated project.
- Agreed boundary: BlogGenius and Amade are independent consumers; BlogGenius never uses the Amade CLI.
- Open: whether the spec is a published package, a repository convention, or a versioned archive/catalog artifact.
- Open: how content collections and user-authored content attach to a template-generated Astro app.
- Open: exact setting types, field constraints, asset references, localization, and compatibility policy.
- Open: catalog delivery, offline cache, signatures/integrity trust root, and release lifecycle.
- Open: whether Amade needs to consume this contract in its current product direction or remains a separate tool without immediate implementation work.

## Verification

- Run only focused validation for the spike contract and its deterministic rendering/validation behavior.
- No full application suite is warranted for an isolated prototype.
- Do not run networked, paid, production, or Cloudflare-mutating tests.
- No manual user interface validation is required; present the fixture and findings for discussion.

## Outcome and handoff

- Implementation result: added a disposable, tool-neutral descriptor and Astro fixture under `prototypes/static-site-template-contract/`. The descriptor carries schema version, stable template ID, semantic version, Astro compatibility range, setting declarations, and an explicit source-file list with SHA-256 values. The proof validates caller settings, rejects unknown fields and unsafe menu/logo values, verifies regular package files and hashes, and copies files plus generated site config without overwriting an existing output.
- Focused verification: `node --test prototypes/static-site-template-contract/contract.test.js` — 5 tests passed. `git diff --check` passed.
- Recommendation: keep this as a candidate contract shape for discussion. The experiment shows a neutral package can be consumed without the Amade CLI, but it does not prove both products have implemented consumers or that Astro builds/preview work in BlogGenius.
- Manual review: inspect the sample descriptor and generated site config; decide which fields belong in the contract before promoting it to a new template repository.
- Remaining risks: hashes do not authenticate publisher identity or a remote descriptor/catalog; distribution trust, signing, schema evolution, compatibility policy, content integration, and settings extensibility remain unresolved. A contract that is too generic may become a private framework; keep the proof small.
