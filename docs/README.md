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
- `architecture/manuscript-workspace.md`
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

## Active Work

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
