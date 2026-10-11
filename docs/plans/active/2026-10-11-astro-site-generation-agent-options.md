# User-Directed Astro Site Generation and Editing

**Status:** Product exploration / backlog proposal; implementation is not approved or started  
**Date:** 2026-10-11  
**Related backlog:** `docs/backlog.md` → “사용자 요구 기반 Astro 사이트 생성·발전 기능”

## Product goal

Let a user describe the site they want (needs and wants), create an Astro project from that brief, and keep evolving it over time. The user may start from a BlogGenius template, personalize it, publish articles through BlogGenius, and deploy it. They may also bring an Astro project made elsewhere and prepare it for BlogGenius Site Hosting.

The central product capability is **turning a user's site intent into a usable, editable Astro project and supporting its continued evolution**. Codex CLI, Claude Code CLI, API-based generation, OAuth, and structured template rendering are possible implementation mechanisms. None is selected yet.

## End-to-end user journey to design

1. User describes purpose, audience, style, pages, content, and required features; the product helps clarify missing or conflicting requirements.
2. BlogGenius proposes a site plan (page map, design direction, content structure, and implementation scope) for user review.
3. The chosen generation mechanism creates or customizes the Astro project.
4. BlogGenius builds and previews the result, explains issues, and lets the user request changes.
5. User reviews proposed source changes and accepts them while retaining a recoverable prior version.
6. Accepted projects use existing BlogGenius article publishing and Cloudflare deployment/domain flows.
7. Later, the user can continue evolving the site from new requirements without losing articles, media, or hosting configuration.

The product should support both starting paths: (a) BlogGenius template → user-directed customization → ongoing posting/deployment, and (b) user-created/imported Astro project → packaging/validation → BlogGenius posting/deployment.

## First user-facing path: import an Astro project directly as a Site

The first useful step does not need AI generation or a template-registration workflow. The user can create an Astro project using whichever tool suits them (for example, Codex, Claude Code, Pagesmith, or another editor/service), compress it, and upload the archive to BlogGenius. BlogGenius validates and imports it as a Site, then the user previews and deploys that Site.

1. User creates an Astro project independently; BlogGenius provides a clear guide and starter requirements.
2. User exports or compresses the project.
3. User uploads the archive in BlogGenius.
4. BlogGenius validates the archive and creates a Site directly from its contents. The ordinary import path does not require template registration.
5. User previews and deploys the Site through the existing Site Hosting flow.
6. If the user later wants to reuse the project as a starting point for multiple Sites, they may optionally register/promote it as a Template.

**Site import** and **Template registration** are separate product operations:

- A Site is the user's working Astro project and the target for preview, BlogGenius publishing where compatible, and deployment.
- A Template is a reusable starting package from which one or more new Sites can be created.
- Importing a project as a Site should not silently turn it into a Template or require users to understand template metadata.
- Template creation can later add descriptive metadata, preview assets, compatibility declarations, and reusable configuration on top of a validated project package.

BlogGenius publishing compatibility is optional for Site Hosting. A valid Astro Site may be deployable even when it does not implement BlogGenius's post/content contract. In that case it is simply omitted from the publishing-target list, consistent with current behavior for Sites that lack the required blog connection. This still serves users who only want a personal or product homepage and do not need BlogGenius-managed posts.

The guide should make the path approachable for users with little technical background: how to make/export an Astro project, what to include in the archive, how to import and preview it, how the default deployment address works, how custom domains fit later, and what free-plan/service limits apply. The exact packaging checks and help content remain to be designed.

## Implementation mechanisms to compare

These are alternatives and composable pieces, not a decision about which one must be implemented first.

### 1. Run a locally installed coding-agent CLI

BlogGenius starts the user's installed and authenticated Codex or Claude Code CLI in an isolated Astro workspace. The CLI provides coding-agent behavior (file inspection/editing and tool execution); BlogGenius owns the brief, user approval, preview, and handoff to existing publishing/deployment.

**Potential fit:** Desktop app; user already owns and configures an agent; fast way to evaluate arbitrary Astro editing.  
**Questions/costs:** CLI presence/version/login, separate process lifecycle, streaming and cancellation, provider-specific adapters, OS permissions, shell/network access, and security of project files.

OpenAI documents a Codex app-server protocol with newline-delimited JSON lifecycle and streaming events. Anthropic documents Claude Code non-interactive `-p` usage, JSON/stream output formats, turn limits, tool controls, and permission modes. These show available automation interfaces, but do not settle the product's process boundary or permission policy.

### 2. Use model APIs and build a BlogGenius-owned agent runtime

BlogGenius calls the user's configured model API and implements the tool loop itself: read/write project files, run bounded build commands, interpret errors, iterate, and report changes. An API key alone is only model access; the agent runtime and its tool permissions remain BlogGenius responsibilities.

**Potential fit:** Predictable product workflow and consistent UX, independent of locally installed coding tools.  
**Questions/costs:** More engineering, prompt/context management, tool orchestration, cost controls, isolation, command policy, and quality evaluation. Need decide whether current text/image API credentials can be reused or whether a separate coding-model setting is needed.

### 3. Provider-supported OAuth / subscription usage

OAuth can authorize more than identity, but only when the provider explicitly supports the intended application type, scopes, and inference usage. It is distinct from signing into a local CLI.

OpenAI publishes Sign in with ChatGPT token-sharing documentation for open-source/local apps, including a Codex app-server path. The same documentation says paid or remotely hosted apps should use a separate interest process. Therefore BlogGenius's app distribution and commercial model must be checked before treating this as an available product integration.  
Anthropic documents OAuth options for Claude Code itself (Anthropic Console and Claude Pro/Max), but this does not establish that BlogGenius can use a user's Claude subscription through a general third-party OAuth grant. Local invocation of a CLI already authenticated by its owner, Anthropic API-key access, and subscription OAuth are separate paths.

**Potential fit:** Convenient account authorization and potentially a familiar usage entitlement.  
**Questions/costs:** App eligibility, provider approval/terms, account/workspace binding, user consent, token refresh/revocation, quota/billing display, and provider differences.

### 4. Structured site plan + deterministic Astro components

An AI model turns the brief into a validated site specification (pages, sections, text, theme tokens, navigation, and assets); a renderer composes known Astro components from that specification.

**Potential fit:** Easier validation, repeatability, lower command-execution risk, stable compatibility with BlogGenius publishing contracts.  
**Questions/costs:** Less design and code freedom; users may outgrow the declared component set. This may be a useful first authoring mode or safe fallback, but is not equivalent to arbitrary Astro project creation.

### 5. Hybrid approach

The app can use a deterministic planner/specification for requirements and product contracts, then delegate source implementation to either a local CLI or an app-owned API agent. The same review, build, preview, backup, and publishing boundary can be shared. This may keep product rules independent from the chosen model/agent transport, but should be adopted only if it reduces real duplication rather than adding abstraction prematurely.

## Current technical evidence

- **OpenAI Codex app-server:** official documentation describes a stdio JSON protocol (`initialize`, thread/turn start, streamed message events, completion states) and an OAuth access-token configuration for Responses API inference. This is an integration surface, not evidence that every commercial app may use ChatGPT plan sharing.
- **OpenAI Sign in with ChatGPT:** official documentation describes user consent and token sharing for eligible local/open-source apps and explicitly separates paid/remotely hosted app eligibility for further review.
- **Claude Code CLI:** official documentation supports launching `claude -p` in non-interactive workflows, JSON/streaming output, max turns, and tool/permission controls. Claude Code can authenticate via Anthropic Console OAuth or Claude Pro/Max login for its own CLI.
- **Partnership:** using standard model APIs or launching a user-owned local CLI does not inherently imply a partnership requirement. Subscription-funded OAuth integration is a different matter and must follow the provider's published eligibility and terms. Do not reverse-engineer or copy local CLI credential stores.
- **Existing BlogGenius base:** Site Hosting already manages local Astro projects and build/preview/deploy paths. The agent feature should build on that product journey while preserving the normal Astro project layout and `.bloggenius` metadata boundary; it should not assume arbitrary source can be safely regenerated from a template.

## Recommended investigation before implementation

For the direct-import path, first validate archive handling, Site creation, build/preview, and deployment without committing to a generator. For a later built-in generation/editor path, do not select CLI, API, or OAuth based only on the shortest proof of concept. Compare them against the same product task: generate a small multi-page Astro site from a user brief, change it in a follow-up request, preserve existing content/configuration, show a diff, build, preview, and recover cleanly from a failed attempt.

For each candidate, document:

- setup and first-run experience for a typical BlogGenius user;
- supported auth and who pays for inference;
- quality and ability to revise the existing project;
- process/runtime requirements across supported desktop platforms;
- progress, cancellation, retries, and recovery;
- project/file/secret/network/command permissions;
- diff review, backup, build, preview, and acceptance;
- maintenance burden, provider coupling, and relevant usage terms.

The resulting design decision should choose (or explicitly combine) execution transport and configuration independently from the shared product workflow. Keep adapter-specific details out of site domain logic.

## Security and reliability boundaries

- Agent-generated project code and dependency scripts execute on the user's machine in a local-CLI design; project-folder restriction alone is not an OS sandbox.
- Never pass unrelated files, `.env` values, provider keys, or stored OAuth credentials into the prompt by default. Do not read CLI credential files as an integration shortcut.
- Use a disposable copy/worktree or snapshot before edits. Preserve the last valid Site when generation, build, or preview fails, and make rollback understandable.
- Define explicit policies for file edits, shell commands, network access, dependency installation, and destructive operations. Do not default to bypassing all permission prompts.
- Show the user which provider/account or API credential performs model work, explain possible usage charges, and handle quota/authentication errors without losing their project.
- Validate output with Astro build and preview, but let the user review design and source changes before promoting them to the active Site.
- Do not promise that generated sites are production-ready without user review.

## Open product questions

- Is the first user experience a guided brief-to-plan conversation, a single prompt, or both?
- How much should BlogGenius constrain design through its templates and components versus allowing arbitrary Astro code?
- Should initial creation and editing of an existing Site share one workflow, or should creation produce a new Site that can later be promoted?
- What is the durable source of truth for user intent and design decisions across future edit sessions?
- Which existing content, media, routes, SEO metadata, and hosting configuration must be protected during agent edits?
- Which providers and desktop platforms are launch requirements?
- Which auth and billing options are acceptable, especially for ChatGPT plan sharing and Claude Pro/Max usage?

## Official references

- OpenAI, [Sign in with ChatGPT token sharing for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source)
- OpenAI, [Codex app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- OpenAI, [Sign in with ChatGPT registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- Anthropic, [Set up Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started)
- Anthropic, [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)

These sources establish documented capabilities and constraints, not legal advice or blanket provider approval for BlogGenius. Recheck them when choosing an implementation.

## Scope guard

This is a product/technical exploration note. It does not select a generation mechanism or authorize a feature branch, OAuth client registration, provider-account changes, package installation, or agent execution against a real Site. Start implementation only after the user asks and the mechanism/initial scope are agreed.
