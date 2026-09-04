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
- `architecture/ui-runtime-boundaries.md`
- `architecture/ai-model-management.md`
- `architecture/chat-model-role.md`
- `architecture/development-environment-inventory.md`
- `architecture/runtime-environment-profiles.md`
- `architecture/deployment-safety-gates.md`
- `architecture/production-schema-audit-2026-08-27.md`
- `architecture/local-supabase-development.md`
- `architecture/hosted-development-environment.md`
- `architecture/runtime-credential-boundaries.md`
- `architecture/runtime-credential-rollout.md`
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

## Active Work

- `plans/active/2026-09-04-v0.4.3-card-news-03-source-preview-development.md`
- `plans/archive/2026-09-04-v0.4.3-card-news-02-source-project-development.md`
- `plans/archive/2026-09-04-v0.4.3-card-news-01-feasibility-development.md`
- `plans/active/2026-09-04-v0.4.3-card-news-main-development.md`
- `plans/active/2026-09-04-v0.4.2-product-surface-main-development.md`
- `plans/active/2026-09-04-v0.4.2-onboarding-guidance-development.md`
- `plans/active/2026-09-04-v0.4.2-settings-help-links-development.md`
- `plans/archive/2026-09-04-v0.4.2-product-surface-routing-development.md`
- `plans/archive/2026-09-04-publishing-progress-links-development.md`
- `plans/archive/2026-09-04-manual-publish-celebration-development.md`
- `plans/active/2026-08-30-continuous-publishing-main-development.md`
- `plans/active/2026-08-31-continuous-publishing-08-usability-development.md`
- `plans/archive/2026-08-31-continuous-publishing-07-safe-timer-development.md`
- `plans/archive/2026-08-30-continuous-publishing-06-automation-settings-development.md`
- `plans/archive/2026-08-30-continuous-publishing-05-draft-inputs-development.md`
- `plans/archive/2026-08-30-continuous-publishing-04-single-item-runner-development.md`
- `plans/archive/2026-08-30-continuous-publishing-03-queue-management-development.md`
- `plans/archive/2026-08-30-continuous-publishing-02-quick-queue-slice-development.md`
- `plans/archive/2026-08-30-continuous-publishing-01-contract-shell-development.md`
- `plans/archive/2026-08-30-local-trends-auth-infrastructure-development.md`
- `plans/archive/2026-08-30-title-curiosity-strategy-development.md`
- `plans/active/2026-08-29-ci-supabase-cli-setup-hotfix-development.md`
- `plans/active/2026-08-29-ci-node24-actions-development.md`
- `plans/active/2026-08-30-development-manual-publishing-development.md`
- `plans/active/development-environment-separation-main-plan.md`
- `plans/active/runtime-credential-security-main-plan.md`
- `plans/active/2026-08-29-runtime-credential-security-03-naver-blog-gateway-development.md`
- `plans/active/2026-08-29-runtime-credential-security-04-naver-shopping-gateway-development.md`
- `plans/active/2026-08-29-runtime-credential-security-05-runtime-config-development.md`
- `plans/active/2026-08-29-runtime-credential-security-06-integration-development.md`
- `plans/active/2026-08-29-runtime-credential-security-browser-smoke-fix-development.md`
- `plans/active/development-environment-01-contract-plan.md`
- `plans/active/development-environment-02-runtime-profile-plan.md`
- `plans/active/development-environment-03-deploy-guard-plan.md`
- `plans/active/development-environment-04a-production-schema-audit-plan.md`
- `plans/active/development-environment-04b-local-supabase-plan.md`
- `plans/active/development-environment-05-hosted-development-plan.md`
- `plans/active/development-environment-06-release-gate-plan.md`
- `plans/active/content-writing-profile-plan.md`
- `plans/active/serpapi-collection-main-plan.md`
- `plans/active/serpapi-collection-01-contracts-plan.md`
- `plans/active/serpapi-collection-02-corpus-store-plan.md`
- `plans/active/serpapi-collection-03-collector-plan.md`
- `plans/active/serpapi-collection-04-scheduler-plan.md`
- `plans/active/serpapi-collection-05-read-api-plan.md`
- `plans/active/serpapi-collection-06-serendipity-plan.md`
- `plans/active/serpapi-collection-07-operations-plan.md`
- `plans/active/proactive-guidance-main-plan.md`
- `plans/active/proactive-guidance-02-lifecycle-store-plan.md`
- `plans/active/proactive-guidance-03-legacy-adapters-plan.md`
- `plans/active/proactive-guidance-04-external-knowledge-gateway-plan.md`
- `plans/active/proactive-guidance-05-news-provider-plan.md`
- `plans/active/proactive-guidance-06-producers-plan.md`
- `plans/active/proactive-guidance-06a-producer-runtime-plan.md`
- `plans/active/proactive-guidance-06b-content-producers-plan.md`
- `plans/active/proactive-guidance-06c-operational-producers-plan.md`
- `plans/active/proactive-guidance-06d-commerce-producer-plan.md`
- `plans/active/proactive-guidance-07-policy-ranking-plan.md`
- `plans/active/proactive-guidance-07a-policy-eligibility-plan.md`
- `plans/active/proactive-guidance-07b-ranking-diversity-plan.md`
- `plans/active/proactive-guidance-07c-policy-evaluation-plan.md`
- `plans/active/proactive-guidance-08-capability-handoff-plan.md`
- `plans/active/proactive-guidance-09-in-app-center-plan.md`
- `plans/active/proactive-guidance-10-proactive-delivery-plan.md`
- `plans/active/proactive-guidance-01-contracts-plan.md`
- `plans/active/agent-redesign-plan.md`
- `plans/active/account-subscription-billing-foundation-plan.md`
- `plans/active/google-sheets-credentials-plan.md`
- `plans/active/internal-api-redesign-plan.md`
- `plans/active/paid-plans-and-credits-plan.md`
- `plans/active/remote-mcp-server-plan.md`

Completed and superseded implementation plans are retained under
`plans/archive/` for historical context. They are not current architecture or
open-work sources of truth.
- `2026-09-04-v0.4.2-ai-help-link-development.md` — AI 설정에서 Help 가이드로 이동
