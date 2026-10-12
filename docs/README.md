# Documentation Guide

## Purpose
`docs/` contains current, maintained engineering documentation. A document that is not kept in sync is treated as stale and should be updated, archived, or removed.

## Structure
- `architecture/`
  - Current canonical system structure.
  - Long-lived documents that describe how the system is supposed to work now.
- `features/`
  - Feature-specific reference documents for implemented user-facing capabilities.
- `decisions/`
  - ADR-style records for important design decisions and tradeoffs.
- `plans/active/`
  - In-progress design and implementation plans.
- `plans/archive/`
  - Completed or superseded plans kept only for historical reference.
- `development-journal-topics.md`
  - Reusable topic seeds learned while building BlogGenius, kept free of secrets and private data.

## Lifecycle
1. Start design work in `plans/active/`.
2. When major design choices are made, record them in `decisions/` if the rationale matters long-term.
3. When implementation stabilizes, promote the current truth into `architecture/` and/or `features/`.
4. Move completed plans from `plans/active/` to `plans/archive/`, or delete them if they no longer add value.

## Maintenance Rules
- Update documentation alongside code changes that affect structure, control flow, contracts, or release process.
- Prefer small canonical docs over one large catch-all document.
- Keep documents scoped: one topic, one file.
- If a document becomes stale, fix it before adding new adjacent docs.
- `CHANGELOG.md` is the source of truth for user-facing release notes.

## Current Canonical Docs
- `architecture/overview.md`
- `architecture/agent-runtime.md`
- `architecture/memory-graph.md`
- `architecture/knowledge-providers.md`
- `architecture/trends-backend.md`
- `architecture/trends-backend-deployment.md`
- `architecture/keyword-research-backend.md`
- `architecture/workspace-layout.md`
- `decisions/2026-10-03-site-hosting-sibling-storage.md`
- `decisions/2026-10-04-site-hosting-post-frontmatter-contract.md`
- `decisions/2026-10-06-site-hosting-teardown-safety.md` (Site Hosting detach/delete reverse lifecycle, Cloudflare dry-run boundary, and archive policy)
- `architecture/manuscript-workspace.md`
- `architecture/site-hosting-vault-publishing.md`
- `architecture/cloudflare-workers-oauth-permissions.md` (Workers OAuth scope experiments, the tested Admin scope set, API Token distinction, and Production follow-up)
- `architecture/ui-runtime-boundaries.md`
- `architecture/ai-model-management.md`
- `architecture/chat-model-role.md`
- `architecture/development-environment-inventory.md`
- `architecture/runtime-environment-profiles.md`
- `architecture/deployment-safety-gates.md`
- `architecture/startup-resilience.md`
- `architecture/production-schema-audit-2026-08-27.md`
- `architecture/local-supabase-development.md`
- `architecture/hosted-development-environment.md`
- `architecture/runtime-credential-boundaries.md`
- `architecture/runtime-credential-rollout.md`
- `architecture/design-principles.md`
- `architecture/design-style-system.md`
- `architecture/design-style-warm-editorial.md`
- `architecture/design-style-quiet-sage-studio.md`
- `architecture/design-style-retro-terminal.md`
- `architecture/design-component-patterns.md`
- `architecture/ui-progress-feedback.md`
- `architecture/settings-information-architecture.md`
- `development-environment-guide.md`
- `development-journal-topics.md`
- `supabase-recovery-runbook.md`
- `license-policy.md`
- `keyword-research-operations.md`
- `features/mcp-client-setup.md`
- `features/blog-writing-style.md`
- `features/blog-writing-strategy.md`
- `features/content-writing-profiles.md`
- `features/continuous-publishing.md`
- `features/configurable-sidebar-content.md`
- `features/personalized-topic-recommendations.md`
- `features/card-news.md`
- `features/site-hosting-astro-project-meta-prompt.md` (experimental copyable prompt and candidate ZIP settings contract for Astro project import)
- `decisions/2026-06-19-license-features-and-publish-quota.md`
- `decisions/2026-06-27-paid-plans-and-credits.md`
- `decisions/2026-07-29-sns-entitlement-and-sheet-provisioning.md`
- `decisions/2026-07-31-buffer-publish-result-reconciliation.md`
- `decisions/2026-07-31-remote-ai-model-catalog.md`
- `decisions/2026-07-31-kie-async-media-jobs.md`
- `decisions/2026-08-04-google-ai-provider-normalization.md`
- `decisions/2026-08-16-keyword-provider-credentials.md`
- `decisions/2026-08-17-smart-capability-usage.md`
- `decisions/2026-08-23-proactive-guidance-contract.md`
- `decisions/2026-08-23-naver-news-search-provider.md`
- `decisions/2026-08-23-recommendation-lifecycle-store.md`
- `decisions/2026-08-23-recommendation-legacy-adapters.md`
- `decisions/2026-08-23-recommendation-grounding-and-provenance.md`
- `decisions/2026-08-23-server-managed-knowledge-gateway.md`
- `decisions/2026-08-25-server-managed-serpapi-corpus.md`
- `decisions/2026-08-26-content-writing-profile.md`
- `decisions/2026-08-27-development-environment-boundaries.md`
- `decisions/2026-08-28-runtime-credential-ownership.md`
- `decisions/2026-09-06-naver-oauth-publishing-boundary.md`
- `decisions/2026-09-15-sqlite-v2-agent-memory.md`
- `decisions/2026-09-23-ai-generation-cancellation-contract.md` (구현 전 설계 제안)
- `decisions/2026-10-03-amade-template-kinds-and-catalog.md` (Site Hosting / BlogGenius Style resource separation and GitHub catalog)
- `decisions/2026-10-03-amade-template-switching-direction.md` (original template-switching proposal and its 2026-10-09 superseding decision that Family is grouping only)
- `decisions/2026-10-04-amade-shared-catalog-resource-types.md` (shared Amade catalog for Site Hosting Templates and BlogGenius UI Styles)
- `decisions/2026-10-04-amade-shared-catalog-resource-types.md` (shared Amade discovery/metadata contract for Site Hosting families and BlogGenius UI Styles, with separate typed package contracts)

## Active Work

- `plans/active/2026-10-11-site-hosting-astro-project-import-development.md` (direct Astro project ZIP import to Site)
- `plans/active/2026-10-11-astro-site-generation-agent-options.md` (product and technical exploration; generation mechanism not selected)
- `plans/active/2026-10-01-static-template-contract-spike-development.md`
- `plans/active/2026-10-02-cloudflare-static-assets-list-poc-development.md`
- `plans/active/2026-10-02-cloudflare-static-assets-deploy-poc-development.md`
- `plans/active/2026-10-01-static-site-builder-main-development.md` (`main` → `codex/static-site-builder-main` → serial sub-features; the parent may merge into `dev` only by explicit request)
- `plans/active/2026-10-03-amade-template-catalog-and-site-template-development.md` (current serial sub-feature; Amade catalog and Site Hosting Template Family integration)
- `plans/active/2026-10-03-amade-template-spec-v0.1-design.md` (experimental Site Hosting 0.1 design extended to share Amade discovery/metadata with BlogGenius UI Styles; existing 1.x resources are legacy)
- `plans/active/2026-10-05-digital-garden-template-poc.md` (full-Vault local Astro POC and evidence; no deployment)
- `plans/active/2026-10-05-knowledge-collection-template-contract-model.md` (proposed Collection/Knowledge Collection contract model and open decisions; discussion draft)
- `plans/archive/2026-10-02-site-creation-development.md` (completed serial sub-feature; Site creation, Astro build/preview, Cloudflare deployment/domain connection, and Site management UI)
- `plans/archive/2026-10-10-cloudflare-workers-admin-oauth-scope.md` (completed OAuth scope configuration and Workers Admin validation)
- `plans/archive/2026-10-02-site-management-page-development.md` (completed serial sub-feature; Project list, create, and detail IA)
- `plans/archive/2026-10-02-project-site-model-and-user-flow-design.md` (completed Project/Site model and user-flow design stage)
- `plans/archive/2026-10-02-site-sidebar-navigation-development.md` (completed site sidebar navigation and entry screen slice)
- `plans/archive/2026-09-30-release-v0.5.5-development.md`
- `plans/archive/2026-10-01-ai-model-save-without-key-development.md`
- `plans/archive/2026-09-15-telegram-network-resilience-development.md`
- `plans/active/2026-09-06-v0.4.3-backlog-current-state-development.md`
- `plans/active/runtime-credential-security-main-plan.md`
- `plans/active/serpapi-collection-main-plan.md`
- `plans/active/serpapi-collection-07-operations-plan.md`
- `plans/active/agent-redesign-plan.md`
- `plans/active/internal-api-redesign-plan.md`
- `plans/active/remote-mcp-server-plan.md`
- `plans/active/account-subscription-billing-foundation-plan.md`
- `plans/active/paid-plans-and-credits-plan.md`

Completed and superseded implementation plans are retained under
`plans/archive/` for historical context. They are not current architecture or
open-work sources of truth.
