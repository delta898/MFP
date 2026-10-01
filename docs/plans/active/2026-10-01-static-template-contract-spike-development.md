# Static Template Contract Spike

## Branch and status

- Branch: `codex/static-template-contract-spike`
- Start date: 2026-10-01
- Base/parent branch: `codex/static-site-builder-main`
- Status: Contract proof implemented and focused checks pass; ready for design review.
- Parent feature: [Static Site Builder Main Feature](2026-10-01-static-site-builder-main-development.md)

## User need and goal

The user wants tools and templates to be separate products: BlogGenius (desktop UI) and a future Amade2 (Docker CLI) independently consume a neutral template specification from a dedicated template project. BlogGenius must never invoke, bundle, or depend on a CLI because that would introduce a Docker dependency. The current Amade project and all its templates are excluded as design inputs and are treated as nonexistent for this work.

This spike should test whether a small, tool-neutral template contract can describe a template's identity/version, its user-adjustable settings, and the source files needed to produce an Astro site. It is an experiment to inform discussion, not a decision to adopt the contract or begin the full product implementation.

## Scope

- Define one minimal, disposable template example from scratch, not by modifying or extending any existing starter.
- Explore how a template can declare a small set of inputs such as site title, logo, and navigation menu.
- Explore validation, deterministic rendering/copying, version pinning, and source integrity at the contract boundary.
- Keep the contract independent of Electron, Docker, Amade2 CLI, Cloudflare credentials, and BlogGenius internals.
- Use this repository only as a temporary spike location; if the result is useful, move the agreed canonical specification and template sources into a dedicated template repository in a later stage.

## Explicit non-goals

- Do not inspect, change, or depend on the existing Amade repository or its template files.
- Do not implement BlogGenius UI, Astro runtime packaging, local preview, Cloudflare authentication/deployment, custom domains, or content publishing.
- Do not implement template upgrades/migration for existing sites.
- Do not establish a production catalog service, CDN, registry, payment/license model, or repository name in this spike.
- Do not make any CLI a BlogGenius dependency or shared runtime.
- Do not commit, merge, push, publish, or deploy this sub-feature without explicit instruction.

## Proposed experiment

Create a small, isolated fixture and validator/rendering proof that answers:

1. Can a descriptor express stable template ID/version, supported settings, required files, and compatibility requirements without encoding either consumer's runtime?
2. Can settings be schema-validated and applied deterministically to an Astro starter without arbitrary code execution from the descriptor?
3. Can a pinned template package be integrity-checked before use?
4. Can independent tools consume the same artifact shape without sharing or importing a CLI runtime?

Favor plain data plus explicitly supported substitutions/copy rules. Avoid designing a general-purpose templating language. Record what could not be answered by this bounded proof.

## Design decisions and open questions

- Agreed direction: create a new template project with a new specification and sources; it is separate from tool repositories.
- Agreed boundary: BlogGenius and future Amade2 are independent consumers; BlogGenius never uses a CLI.
- Agreed baseline: preserve Astro's conventional project structure and add only a thin product-specific contract if required for template catalog identity, declared settings, version pinning, and package integrity.
- Open: whether the spec is a published package, a repository convention, or a versioned archive/catalog artifact.
- Open: how content collections and user-authored content attach to a template-generated Astro app.
- Open: exact setting types, field constraints, asset references, localization, and compatibility policy.
- Open: catalog delivery, offline cache, signatures/integrity trust root, and release lifecycle.
- Open: when to build Amade2 and whether it needs to consume the contract in its first release.

## Verification

- Run only focused validation for the spike contract and its deterministic rendering/validation behavior.
- No full application suite is warranted for an isolated prototype.
- Do not run networked, paid, production, or Cloudflare-mutating tests.
- No manual user interface validation is required; present the fixture and findings for discussion.

## Outcome and handoff

- Implementation result: added a disposable, tool-neutral descriptor and Astro fixture under `prototypes/static-site-template-contract/`. The descriptor carries schema version, stable template ID, semantic version, Astro compatibility range, setting declarations, and an explicit source-file list with SHA-256 values. The proof validates caller settings, rejects unknown fields and unsafe menu/logo values, verifies regular package files and hashes, and copies files plus generated site config without overwriting an existing output.
- Focused verification: `node --test prototypes/static-site-template-contract/contract.test.js` — 5 tests passed. `git diff --check` passed.
- Recommendation: keep this as a candidate thin contract layered on the normal Astro project structure. It is a prototype, not a settled standard. The experiment does not prove two production consumers or that Astro builds/preview work in BlogGenius.
- Manual review: inspect the sample descriptor and generated site config; decide which fields belong in the contract before promoting it to a new template repository.
- Remaining risks: hashes do not authenticate publisher identity or a remote descriptor/catalog; distribution trust, signing, schema evolution, compatibility policy, content integration, and settings extensibility remain unresolved. A contract that is too generic may become a private framework; keep the proof small.
