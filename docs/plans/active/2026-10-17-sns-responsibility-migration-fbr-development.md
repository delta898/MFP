# SNS Responsibility Migration Feature Branch

## Branch

- Branch: `codex/fbr/sns-buffer-plugin`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: SNS responsibility migration implemented; final verification in progress

## User Need and Goal

SNS and shared social-publishing code had accumulated in the legacy `src/social/` directory. The user wants each responsibility moved into its architectural layer, the old directory removed, and Buffer integration delivered as a complete Plugin that can later be replaced by another provider. Card News is an identified consumer of shared feed and publication capabilities.

## Scope

- Inventory former `src/social/` files and migrate them according to responsibility.
- Package provider transport/authentication inside the Plugin package.
- Use a capability-oriented name and contract (`social-publisher`) instead of naming the Plugin after the current product (Buffer).
- Put SNS workflows in `src/applications/sns/`, shared publishing/feed rules in services/utilities, and protocol adapters in `src/adapters/`.
- Remove the former `src/social/` directory and update its callers, test imports, package/test collection paths, and architecture documentation.

## Explicit Non-goals

- Do not migrate Card News's own application workflows as part of this change.
- Do not alter the user's Buffer account, publish to external services, or deploy a Plugin.
- Do not rename unrelated UI/API routes or CSS classes that use “social” or “buffer” as presentation terminology.
- Do not commit, merge, push, or delete branches without a later explicit request.

## Design and Ownership Decisions

- The Plugin is named for its capability: `social-publisher`. Buffer is the current provider implementation under `providers/buffer/`.
- The Plugin owns Buffer protocol and credentials. The host adapter owns the Plugin operation identifiers and exposes a social publishing port to callers.
- Channel-selection count is an Application policy (currently three for SNS and Card News), not a Social Publisher Plugin contract limit. Buffer API publishing/status calls are sent one item at a time; provider request quotas are Buffer-owned and not represented as a fixed channel count.
- SNS Applications own manual publishing, discovery/distribution, and SNS AI workflows.
- Feed parsing and configured-blog feed resolution are reusable utilities because both SNS and Card News use them.
- Channel formatting and limits are shared social-publishing services; they do not belong to the Buffer Plugin or one vertical.
- Google Sheets and Google Drive HTTP integrations are adapters; SNS spreadsheet schema and delivery workflow remain app/shared domain concerns.

## Responsibility Map

| Responsibility | Location |
| --- | --- |
| Social publishing Plugin manifest and host operations | `packages/plugins/core/social-publisher/` |
| Current Buffer API client/protocol | `packages/plugins/core/social-publisher/providers/buffer/` |
| Plugin operation translation and shared composition | `src/adapters/plugins/social-publisher.js`, `src/composition/social-publishing.js` |
| SNS manual publishing | `src/applications/sns/publishing/` |
| SNS feed discovery and automatic distribution | `src/applications/sns/distribution/` |
| SNS AI prompt/response policy | `src/applications/sns/generation/` and `src/services/sns/` |
| Shared SNS sheet schema | `src/services/sns/` |
| Shared social channel formatting/limits | `src/services/social/` |
| Feed parsing, configured feed resolution, ordering | `src/utilities/feeds/` |
| Google Sheets SNS gateway | `src/adapters/storage/` |
| Google Drive public-media transport | `src/adapters/media/` |

## Implementation Progress

- 2026-10-17: Created this parent feature branch from `codex/fbr/plugin-architecture-foundation` and mapped current Buffer consumers across SNS, Card News, and Settings.
- Added the `social-publisher` package/manifest and moved the Buffer client into its provider folder. The public operation IDs and capability identifiers now describe social publication, while Buffer protocol details stay inside the provider implementation.
- Added a Social Publisher host adapter/composition and switched SNS and Card News callers to capability-oriented port names (`publishMany`, `listRecentPublications`, `getPublicationStatuses`). Normal publication/status calls no longer pass credentials from Applications; the Plugin Host supplies them. The transient key remains limited to connection verification.
- Renamed the Plugin-facing workspace input to `workspaceId`; the Buffer provider translates it to its API's `organizationId` internally.
- Removed the Plugin manifest's three-item schema caps and Buffer client's three-item checks. Buffer's official API guidance describes one `createPost` call per channel and plan-dependent per-client request quotas; the provider now sends each publish/status item in its own API request. SNS Application still enforces its three-selected-channel policy and now lists all available workspace channels rather than silently truncating discovery to three.
- Renamed the Plugin operation from `publications.publish-many` to `publications.publish`; the Application adapter retains its `publishMany` port method because it describes the multi-delivery application call.
- Moved the former `src/social/` workflows, adapters, services, and utilities into their owner directories; extracted configured blog feed definitions/order as shared utilities for Card News; removed `src/social/`.
- Updated unit-test source collection and `test:chat-model` to the new file locations, and updated the architecture map with the resulting boundary.
- Post-move focused verification passed 166 tests across Plugin/provider, SNS Application, shared Card News consumers, settings, storage/media adapters, utilities, and Plugin Host/registry boundaries.
- After the final capability-port and workspace terminology adjustment, a focused regression rerun passed 80 tests, including all directly affected Plugin, adapter, SNS, Card News publishing, registry, and Host cases.
- After separating the Application's three-channel policy from provider request handling, the focused Social Publisher and SNS publishing suite passed 46 tests; added coverage confirms the Plugin accepts more than three publication/status items, SNS workspace discovery returns all available channels, and the Application still rejects a fourth selected channel before Plugin invocation.
- UI server boundary/settings checks passed 2 tests. Syntax checks passed for relocated modules and changed runtime entrypoints; `git diff --check` passed; no source imports reference the removed `src/social/` directory.

## Verification and Remaining Work

- Run final syntax and diff checks; confirm no source imports still point at the removed `src/social/` tree.
- Confirm no production source/test import still references `src/social/` and the directory remains absent.
- No manual UI acceptance or external publishing has been performed.
- Review whether Buffer-specific config/persistence identifiers should remain as provider-owned compatibility details or move behind a more generic workspace contract in a future separately scoped change.
