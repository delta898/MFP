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
- `license-policy.md`
- `keyword-research-operations.md`
- `features/mcp-client-setup.md`
- `features/blog-writing-style.md`
- `features/blog-writing-strategy.md`
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
- `plans/active/agent-redesign-plan.md`
- `plans/active/account-subscription-billing-foundation-plan.md`
- `plans/active/intelligent-memory-owner-identity-plan.md`
- `plans/active/intelligent-memory-owner-retrieval-plan.md`
- `plans/active/intelligent-memory-topic-semantics-plan.md`
- `plans/active/intelligent-memory-activity-lifecycle-plan.md`
- `plans/active/intelligent-memory-blog-lifecycle-plan.md`
- `plans/active/intelligent-memory-shopping-lifecycle-plan.md`
- `plans/active/intelligent-memory-sns-lifecycle-plan.md`
- `plans/active/intelligent-memory-telegram-provenance-plan.md`
- `plans/active/intelligent-memory-feedback-provenance-plan.md`
- `plans/active/intelligent-memory-collection-audit-plan.md`
- `plans/active/intelligent-memory-retrieval-v2-plan.md`
- `plans/active/intelligent-memory-owner-profile-plan.md`
- `plans/active/intelligent-memory-naver-trends-knowledge-plan.md`
- `plans/active/intelligent-memory-topic-candidate-plan.md`
- `plans/active/intelligent-memory-topic-ranking-plan.md`
- `plans/active/intelligent-memory-recommendation-learning-plan.md`
- `plans/active/kie-async-image-integration-plan.md`
- `plans/active/chat-model-source-selection-plan.md`
- `plans/active/configurable-content-surfaces-plan.md`
- `plans/active/manual-sns-publishing-plan.md`
- `plans/active/naver-smart-comment-improvement-plan.md`
- `plans/active/blog-writing-strategy-plan.md`
- `plans/active/shopping-content-quality-plan.md`
- `plans/active/smart-keyword-topic-title-pipeline-plan.md`
- `plans/active/smart-capability-usage-hardening-plan.md`
- `plans/active/paid-plans-and-credits-plan.md`
- `plans/active/trend-posting-plan.md`
- `plans/active/trend-posting-handoff.md`
- `plans/archive/kie-ai-provider-integration-plan.md`
- `plans/archive/kie-gpt-integration-plan.md`
- `plans/archive/ai-provider-profiles-plan.md`
- `plans/archive/configurable-sidebar-content-plan.md`
