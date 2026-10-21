# Agent Runtime

## Responsibility
The agent runtime turns channel input into validated actions, manages confirmation, executes capabilities, and records events.

## Layer Ownership
- Host orchestration and channel-neutral action/plan contracts live in `src/host/agent/`.
- Telegram-specific deterministic and model-assisted interpretation lives in `src/adapters/messaging/telegram/`.
- Confirmation state and its JSON persistence implementation live in `src/adapters/storage/confirmations/`; Host runtime receives the store through composition.
- The Agent Action Catalog and Agent-owned action declarations live in `src/host/agent/capability-registry/`.
- The canonical capability ID format is a shared contract in `src/services/agent-actions/`; structured runtime configuration state is owned by `src/host/configuration/` and injected through Composition.
- Product action declarations live beside their owning Application in `src/applications/<product>/agent-actions/` and are contributed through Composition.

## Current Runtime Path
1. Channel adapter receives message.
2. Retrieval service builds a context packet.
3. Channel parser produces an action envelope.
4. Host Agent Runtime plans the envelope, validates plan steps and capability parameters.
5. If confirmation is needed, Runtime creates a pending confirmation.
6. If confirmed or non-interactive, Runtime executes the capability.
7. The channel renderer presents the result.
8. Runtime records plan, confirmation, and action outcomes in Memory.

## Current Boundaries
- Runtime may parse and validate.
- Runtime may not directly mutate config or run domain logic.
- Only capabilities execute changes.
- Telegram message interpretation selects from the runtime Agent Action Catalog; feature phrases are not maintained in a Telegram intent-to-capability mapping table.
- Telegram passes parsed envelopes to `AgentRuntime.handleEnvelope()`; planning and execution orchestration belong to Host Runtime, not the Telegram bot service.
- Natural-language selection uses the configured Chat Model over that catalog. Deterministic Telegram parsing is limited to explicit slash commands and exact user-authored routines; it does not classify product requests by phrase.
- Telegram has one execution route: parsed `action_id` plus typed parameters go through Host planning, validation, confirmation, and the owning capability/Application. Unsupported requests stop there; the channel has no parallel intent dispatcher or fallback executor.
- Blog Beta's shared execution coordinator is also the source of truth for UI progress. A terminal success or failure remains observable after its execution lease is released so the queue panel and global widget indicator can leave the running state consistently.

## Agent Action Catalog
- The capability registry composes Agent-exposed actions from Agent-owned actions and Application action providers. Product action declarations live beside their owning Application; Telegram does not need feature-specific routing changes.
- `AgentRuntime.handleEnvelope()` owns the channel-neutral plan → validation → confirmation → execution sequence. Channel adapters may parse requests and render outcomes, but should not build or execute action plans independently.
- Every exposed action declares when to use it, when to avoid it, its effect class, confirmation policy, JSON Schema input contract, result description, examples, and known availability notes. The same descriptor informs Chat Model selection and Host validation; the Host remains authoritative for confirmation and execution.
- Actions may annotate schema properties with `parameterSemantics`. An `explicit_constraint` is a hard part of the current request and must remain satisfied by the action's output; personalization and external knowledge can only refine results within that constraint. `personalization_context` is optional evidence and cannot replace a current explicit choice. The Application that owns the action enforces the meaning; the channel parser only carries the contract to the model.
- Resolve referenced artifacts from available Application data before asking users for internal IDs. Manuscript generation may inherit settings from one exact, unique saved or queued topic; ambiguous subject matches are not auto-selected, and an explicit row number must resolve to the same subject when one is provided.
- Effect classes distinguish read-only queries, generated output, local changes, external side effects, and persistent automation. External side effects and persistent automation require explicit confirmation. A missing or ambiguous required input must result in a focused clarification, not an inferred action argument.
- Telegram interaction follows a required-versus-optional input policy: missing required inputs and ambiguous target/action choices are clarified before execution; optional enrichment is suggested without blocking. Required questions and optional suggestions belong to the action descriptor beside its input schema, while the router validates a proposed action against that schema before handing it to Host Runtime. Memory may fill optional values only when evidence supports them; it never supplies missing required or consequential choices.
- Skill-like natural-language descriptions help discover and select registered actions; they do not execute code or grant authority. The callable Action contract and owning Application/capability remain the execution boundary.
- **Action** means one atomic ability. **Workflow** is the general execution model for composing actions in a declared order with explicit conditions, data bindings, failure handling, and confirmation points. A pre-defined Application workflow is one kind of Workflow that owns product rules. General model-planned workflows are a future extension; current execution supports registered Application workflows and only the existing limited action planning.
- Actions are either atomic abilities or registered Application workflows. Application workflows own validated multi-stage business behavior and can use services/adapters, including Core Plugin-backed services. Prefer a workflow action for a dependent business sequence.
- Blog manuscript generation and publication are separate abilities. Generation creates a revisioned, locally stored manuscript without choosing a destination or publication status. Publication selects an existing manuscript plus a registered destination and a destination-supported status (`draft`, `schedule`, or `publish`) through a provider-neutral publication contract. Do not create one Agent action per destination/status combination.
- Publication destinations are runtime registrations with an identifier, user-facing description, supported statuses, required destination inputs, readiness check, and publish operation. Blog Applications validate common manuscript and status rules; destination adapters validate their own settings and translate to provider-specific transport. Adding Blogger or Tistory should register a destination adapter, not add Telegram intent branches or clone actions.
- When a request asks for a compound outcome such as “write and save a draft to Naver,” a registered Blog Application workflow may compose manuscript generation and publication using typed results and one confirmation point for the external publication. Keep generation callable on its own, and allow the generated manuscript to be published later to a different registered destination. Until generic output binding is implemented, only explicit Application workflows may compose dependent steps.
- Register an action only when its execution dependency is available in the composed runtime. The first Blog topic action uses the Blog Queue Management Application for save-versus-enqueue behavior, carries topic/keyword/target/writing options in its typed input, and requires confirmation before the Sheet change. When the Application is absent, the persistence action is omitted from Agent discovery rather than advertised as usable.
- Preparation/normalization helpers are internal contracts, not user-facing Agent actions. A generated preview must never be rendered as a completed persistent change; only a confirmed Application execution can report the change as registered.
- Blog manuscript actions expose generation, delivery of an existing draft, and a general `generate_and_publish` Application workflow as distinct catalog entries. The workflow persists its generated draft first, then applies the selected destination/status and publishes only after the Host confirmation; generation by itself does not publish externally. Current destination values are limited by the manuscript subsystem to Naver and WordPress.
- Blog topic discovery and queue-to-saved/saved-to-queue transitions are exposed as Application-backed catalog actions only when the composed Google Sheets read and status-update operations are available. These actions read persisted topic rows, refuse ambiguous subject matches, and share the Blog execution coordinator so a queue cannot be changed during an active publishing run.
- The Agent may combine explicitly requested independent actions. It must not infer data flow between dependent actions until typed output/input binding is implemented. Plugin operations are not automatically exposed; a Core Plugin action contribution must be explicitly designed and adapted through the Host boundary.
- The catalog is a composed Agent-facing view, not a replacement for Capability Registry or Plugin Host. Plugin IDs, operation IDs, and provider credentials do not become natural-language routing inputs.
- Every exposed action has one stable `action_id`; every planned invocation has a separate `id`. The model returns only `action_id` and typed `params`. Host resolves the canonical registration and fills internal type/domain/name fields; model-provided routing metadata is never authoritative.
- Capability identity is canonicalized once by the registry. An explicit ID must agree with its domain and name; when an implementation omits its name, the registry derives it from the ID. Parsers, memory, and other consumers use the canonical registry record rather than independently reconstructing identity.

## Personalization and Memory
- Keep request-local conversational context, user-authored rules, and event-derived preferences as separate data types with separate lifetimes and authority.
- Resolution policy: make a reasonable effort to find or complete a requested task using the current message, recent conversation, and structured outputs from recent actions before asking the user for information. Resolve references such as “that draft” to a unique recent artifact and carry its exact identifier/version forward; ask one focused question only when candidates conflict or required facts cannot be recovered. Never invent identifiers, apply an operation to a weakly matched target, or treat inferred context as new authorization. Preserve and reuse partial-success artifacts when a later workflow step fails.
- User-authored action defaults are a third durable personalization record, separate from exact-trigger routines and inferred preference projections. A capability opts in only specific optional, type-safe parameter paths through `personalizableParameters`; Host applies a saved value only when the current request leaves that path unset, then validates and previews the resulting action normally. The current request wins, and confirmation/readiness policy is unchanged.
- Explicit action defaults are scoped by user, canonical action ID, and declared parameter path. They can be inspected and removed. An unavailable Memory store means the Agent does not advertise these controls or claim defaults were saved/applied.
- User-authored routines are explicit, user-owned records. A routine has a user-visible trigger, a canonical `action_id`, and schema-validated input bindings. The first slice supports exact triggers and one registered action; the contract should admit registered Application workflows without teaching a channel adapter their internal steps. A routine cannot define code, bypass action readiness, or grant standing approval for an action that normally requires confirmation.
- Create a rule only after showing its trigger, resolved action, arguments, and effect to the user and receiving confirmation. On invocation, resolve the target against the live catalog again; if it is missing or invalid, ask for correction instead of falling back to a different action.
- Inferred preferences are derived from attributable interaction events and remain labeled with confidence, evidence count, recency, and provenance. They may guide recommendations and optional defaults, but never override the current request or a user-authored rule.
- A stored routine resolves its `action_id` against the live catalog at invocation. Its action parameters are forwarded unchanged and then revalidated by Host; renamed or removed actions are reported instead of being guessed from a `domain/name` pair.
- Use the minimum relevant memory for a request. Do not persist full conversation text as a durable preference or rule. Never infer authorization to publish, change settings, or create recurring automation from repeated behavior.
- Provide user control to inspect, disable, re-enable, and delete explicit rules; replacing a rule currently means deleting it and creating a new one. Users can inspect or clear inferred preference summaries. A missing or disabled memory store must degrade to non-personalized behavior without claiming a remembered preference.
- Personalization is event-first: retain attributable interaction facts, derive preferences with evidence and provenance separately, and keep explicit routines/defaults as user-authored instructions. A current request takes precedence over saved routines/defaults, which take precedence over inferred preferences. Inferred preferences may fill optional values but cannot decide missing required or consequential choices.

## Current Gaps
- Model selection is catalog-driven, but generic semantic intent coverage is not yet independently validated by Host. The first enforced parameter semantics are being added at the owning Application boundary.
- Multi-step action composition is still limited to preflight query expansion.
- Core Plugin manifest actions and live Plugin readiness are not yet dynamically contributed to the Agent Action Catalog.
- Typed output-to-input binding between atomic actions is not implemented; use an Application workflow for dependent sequences.
- Pending confirmation handling is only partially rule-driven.
- MCP surface currently projects Blog topic, queue, and manuscript Agent actions, with session-bound confirmation, status lookup, and validated updates to pending optional action parameters.
- Remote MCP is still prototype-grade: a dedicated app-managed remote service now exists, but SSE/resumability and broader tool coverage are not finished.

## Current Planner Coverage
- Deduplicates actions.
- Orders actions by execution priority.
- Expands setting updates into `query -> update` preflight plans where needed.
- Adds capability preconditions to steps.
- Replaces older same-domain pending confirmations when a new conflicting setting change is planned.
- Supports text-driven latest pending apply/reject commands.

## Next Step
- Finish Phase 1 practical stabilization:
  - pending confirmation planner rules
  - deterministic parser coverage for common settings phrases
  - confirmation UX consistency
  - provider failure visibility
- Then move to:
  - MCP remote transport hardening
  - richer multi-step planning
