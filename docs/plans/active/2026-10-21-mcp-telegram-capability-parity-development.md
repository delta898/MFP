# MCP Agent Capability Parity Development

## Branch and status

- Branch: `codex/fbr/mcp-telegram-capability-parity`
- Start date: 2026-10-21
- Base/parent: `codex/fbr/plugin-architecture-foundation`
- Status: Implementation complete; focused verification passed; manual OpenCode acceptance pending

## User need and goal

The existing MCP prototype exposes an old, narrow content-request bundle and does not keep pace with BlogGenius capabilities. Users want MCP clients such as OpenCode to perform the same meaningful Blog topic, publishing-queue, and manuscript/posting work that is available through Telegram.

Rebuild the MCP channel surface around the current shared Agent Runtime and Agent Action Catalog. MCP should translate protocol requests and results only; validation, clarification, confirmation, execution, memory, and Application workflows should follow the same channel-neutral path used by Telegram.

## Scope

- Trace the current Telegram request lifecycle and composed Blog topic, publishing-queue, and manuscript/posting actions.
- Replace the old MCP content-request bundle as the design baseline; do not preserve its tool shape solely for compatibility.
- Define MCP tools from executable, user-facing Agent action contracts so tool schemas, required questions, optional fields, and availability derive from the composed runtime catalog.
- Route MCP requests through the shared Agent Runtime, including clarification, preview, confirmation, pending-action lifecycle, execution, and structured result delivery. Preserve compact completion/failure outcomes so an MCP client can recover after its approval call times out without repeating a side effect.
- Keep Streamable HTTP and STDIO as channel transports where already useful; test their protocol behavior separately from Agent semantics.
- Add focused automated tests plus a practical manual MCP Inspector/OpenCode verification path. Do not perform real production writes or publishing as part of automated validation.
- Keep the feature extensible so future Agent actions become MCP-visible without adding a second phrase/action catalog.

## Non-goals

- Rewriting Telegram or changing its Application workflows except for a required shared-contract fix.
- Exposing arbitrary Plugin Host operations or raw Plugin IDs/operation IDs to MCP clients.
- Adding CLI support.
- Preserving the old MCP tool schema as a compatibility API unless the user later requests compatibility.
- Running broad tests, production mutations, publishing, or committing/merging without the required approval.

## Current-state findings

- `src/host/agent/runtime.js` and `src/host/agent/capability-registry/registry.js` provide the channel-neutral Agent execution and action catalog used by Telegram.
- Telegram is implemented as a channel adapter under `src/adapters/messaging/telegram/`; its request interpretation, confirmation, and response path should be inspected as the behavior reference, not copied into MCP.
- The former MCP adapter defined a fixed `content_request_prepare` bundle and `confirmation_decide` tool. That adapter, its token serializer, and the unused content-request bundle planner were removed as part of the redesign.
- MCP protocol transports are under `src/adapters/messaging/mcp/server/`; app-managed HTTP lifecycle is under `src/host/mcp/`.
- The canonical architecture document says channels must use the shared Agent Runtime and Plugin operations are not exposed automatically. The current path has not completed that convergence.
- MCP tests now cover Agent descriptor projection, shared `handleEnvelope()` dispatch, session-bound confirmation, and HTTP/stdio protocol request handling.
- The Telegram development record at `docs/plans/active/2026-10-19-telegram-agent-control-plane-development.md` contains the broader action parity inventory and completed topic-action findings.

## Proposed design and boundaries

- MCP protocol parsing, transport, and response serialization stay in `src/adapters/messaging/mcp/`.
- Request interpretation, action selection, validation, confirmation, and execution use `src/host/agent/` and its composed capability registry.
- Blog topic, queue, and manuscript workflows stay in `src/applications/blog/` and existing service/Plugin boundaries.
- MCP tools are generated from the runtime's exposed Blog action descriptors, including JSON Schema and required/optional input guidance. No independent static action list or MCP-only business workflow is added.
- MCP-specific identity/session fields are translated into the shared Agent context by the adapter; client-supplied identity cannot bypass Host policy.
- Side-effecting Blog actions retain the same confirmation requirements and execution semantics as Telegram.

### Selected MCP tool projection

- Project one MCP tool per eligible Agent Action Catalog entry, deriving each tool's JSON Schema, description, examples, and availability from its descriptor. This lets OpenCode's model select a typed action and avoids repeating the old all-in-one `content_request_prepare` bundle.
- When a projected tool is called, create an action envelope and pass it through `AgentRuntime.handleEnvelope()`. The runtime remains the owner of validation, preview, confirmation policy, execution, and event recording.
- Expose one shared confirmation decision tool for the pending confirmation ID returned by a side-effecting action. Bind confirmation lookup to the MCP session/user context and never accept an arbitrary action list from the client at approval time.
- Initially project only the current Blog topic, queue, and manuscript/posting actions requested by the user. Do not expose arbitrary Plugin operations or unrelated Settings/Memory actions in this first slice.
- Tool invocation is a typed request from the OpenCode model; natural-language interpretation and follow-up questions remain with that MCP client. MCP itself does not carry Telegram-style chat turns. The action schema and descriptor guidance must let the client ask for missing required fields before invocation.
- Required questions and optional field prompts live in the shared action descriptor input policy. Telegram uses the policy for its clarification/additional-input flow; MCP projects it into the tool schema and description so its client can collect the same fields in its own interaction model. User-mentioned-but-unspecified optional choices require clarification; unmentioned options retain action defaults.
- MCP confirmation execution outcomes are compactly recorded with the confirmation. Approval returns an immediate accepted response while execution continues, then `blog_confirmation_status` provides the running/final state; repeated decisions do not execute again.
- `blog_confirmation_update` lets an MCP client apply validated option changes to a pending confirmation, regenerate its preview through Agent Runtime, and ask for approval only after the user reviews the updated preview.
- MCP client logs showed long-running approval calls could surface `-32001` even though the background Naver draft save completed. Approval is now acknowledged immediately so a transport timeout is not presented as an action failure.
- Optional fields remain optional: this request did not ask to choose image/category/reference options, so defaults were valid. If the user asks to choose or changes their mind after the preview, the client can ask and update the still-pending confirmation.
- Manuscript generate, generate-and-publish, and publish actions accept Naver and WordPress categories and pass them through draft settings to publication.

## Implementation stages

1. **Contract audit and shared composition:** complete. Telegram and MCP now build the same control plane in `src/composition/agent-control-plane.js`.
2. **Action tool projection:** complete. Eligible Blog descriptors are projected as typed MCP tools; confirmation remains session-bound.
3. **Blog vertical slice:** complete at runtime wiring. Tool catalog includes topic capture, queue list/move/update, manuscript generate/publish, and generate-and-publish actions.
4. **Transport and security:** HTTP/stdio protocol paths retained; bearer authentication and HTTP session identity remain in transport, while confirmation ownership is checked in the adapter.
5. **Verification and docs:** focused automated checks for channel parity, confirmation status recovery, and category propagation; user hands-on OpenCode/Inspector verification remains.

## Decisions made with the user

- The target is feature parity for the Telegram-level Blog topic, publishing-queue, and manuscript/posting capabilities.
- Existing MCP feature behavior and tool design are to be disregarded and rebuilt rather than incrementally extended.
- Work begins on a new feature branch under `codex/fbr/plugin-architecture-foundation`.
- The user will use OpenCode to connect to the MCP server; Codex-specific client integration is skipped for now.

## Verification and remaining work

- After OpenCode evidence review, pending confirmations gained validated option updates and MCP approval became an immediate acknowledgment with final results delivered by status lookup. The latest focused run passed 31 tests covering the runtime, MCP adapter/HTTP/stdio, Telegram input policy, registry contract, and manuscript option propagation.
- Follow-up OpenCode evidence showed that the first multiple-choice prompt was the required side-effect confirmation gate, not a request for optional settings. A separate publish-policy mismatch rejected WordPress drafts that intentionally retained unresolved image prompts. Drafts now pass through to WordPress with the prompt visibly escaped in the content and a warning; the manuscript stays in BlogGenius as before. The result message uses the actual publication status. Focused regression run: 57 tests passed across manuscript publication, content API, Agent Runtime, and MCP adapter.
- `git diff --check` passed.
- The stdio process-level smoke harness could not bootstrap in this environment because its license setup reported `Unsupported OAuth environment: (missing)`. The stdio protocol handler is covered with injected services; an app-environment stdio smoke test remains.
- Automated verification must use fakes/fixtures for mutations; manual development validation may use controlled test data after explicit scope is agreed.
- The supplied log confirms the Naver draft completed successfully. It does not contain the OpenCode-side `-32001`, so identifying it as a client timeout is an inference from the long-running action and later successful status result. User-owned OpenCode retest should confirm the immediate approval response and option-update interaction. No commit, merge, push, or production publish is authorized by this plan.
