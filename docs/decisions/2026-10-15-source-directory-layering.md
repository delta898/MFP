# Source Directory Layering

- Status: Accepted
- Date: 2026-10-15
- Scope: New BlogGenius source code and deliberate migration of existing code

## Decision

Use top-level directories to show architectural ownership. Group product workflows by Application name, and reusable technical behavior by utility capability:

```text
src/
  host/
  adapters/
    ai/                         # Host-owned provider protocol/authentication adapters
    ui/                         # UI/API request-response and progress presentation adapters
    plugins/                    # Host operation ↔ shared service-port translation
  platform/
  composition/
  services/<domain>/            # Cross-application reusable domain contracts
  applications/<application-name>/ # Application workflows and app-specific domain services
  utilities/<capability>/
packages/plugins/core/<plugin-id>/
```

Blog workflows live under `src/applications/blog/`. Every product follows the same `src/applications/<application-name>/` convention. This directory owns the product's user workflows, workflow coordination, and product-specific domain services and policies; organize below it by real capability or workflow boundaries such as `generation/` and `publishing/`.

`src/adapters/ui/` is an inbound/outbound presentation boundary between UI/API
surfaces and Applications. UI/API callers invoke an Application through its
contract; they do not ask the Application to call back into a UI adapter. The
Application owns workflow decisions and returns channel-neutral results and
structured progress (for example, stage and item counts). A UI adapter translates
those values into UI/API-specific messages or response shapes. It does not own
business sequencing, persistence, or the actual screen rendering. Existing
`src/ui-api/` and `src/ui-runtime/` remain legacy UI/API infrastructure and may
call narrow adapters during gradual migration.

`src/services/<domain>/` is reserved for capabilities/contracts reused across multiple Applications. It is not the place for an application's top-level service layer. Shared media operations, including optional native image-processing module loading, live under `src/utilities/media/`. The Blog Application owns publication choices such as target image format; the media utility performs the requested conversion. Provider/platform Plugins remain independently bounded under `packages/plugins/core/`.

## Ownership rules

- Host owns product bootstrap and routing, not workflows.
- Adapters translate channel or external protocol formats, not business behavior. Host-owned AI provider authentication and transport are adapters. Supabase is the sole source of catalogued AI model availability and metadata; the AI Gateway filters that catalog against its implemented `kind + provider + transport` routes, and Applications resolve user selections from the resulting shared snapshot rather than maintaining a second model inventory.
- UI adapters translate normalized UI/API inputs into Application calls and map Application results or structured progress into channel-specific presentation. The dependency points inward: UI/API adapter → Application. Applications never depend on or call `adapters/ui/`; UI wording and response formatting do not define Application policy.
- Platform owns the shared Plugin contract, discovery/validation rules, lifecycle, and operation dispatch.
- Composition wires concrete Plugins and host dependencies into Applications.
- Services expose reusable cross-application contracts; they do not own product workflows or Plugin IDs.
- Applications own product workflows, orchestration, and app-specific services and policies. The top-level `src/applications/<name>/` is the target home for app-specific behavior such as SNS, Card News, and Blog workflows, split below that boundary by responsibility.
- Plugin adapters are the only Application-facing layer that knows concrete Plugin and operation IDs; UI/API callers use Application/service ports.
- Utilities own reusable technical operations without product-specific policy.
- Plugin packages own a complete implementation of their declared capability and follow the shared manifest contract. They may depend on documented Host contracts for generic facilities, but their core behavior must not delegate back to BlogGenius-private Application or legacy implementations; a wrapper alone does not satisfy Plugin migration.
- Static Widget Plugin packages own their UI, styles, and self-contained behavior. The application owns generic display slots; `src/platform/` validates and discovers widget packages, `src/adapters/ui/` exposes contributions and allowlisted assets, and the generic UI slot host mounts them in sandboxed iframes. Bundled packages live under `packages/plugins/core/<id>/`; user-installed packages live under `<configDir>/plugins/<id>/` and take precedence over bundled packages with the same ID.

## Migration policy

This is the required placement convention for new code. Do not add new Application business logic to legacy top-level product areas such as `src/social/`, `src/card-news/`, or `src/blog-next/`; place new work under `src/applications/<name>/` and connect legacy callers through narrow adapters/composition seams. UI/API message formatting belongs at the UI adapter edge; expose structured progress from the Application and translate it for the relevant surface. Existing areas migrate incrementally in explicitly scoped slices. Before moving files, trace all production callers and classify ownership; move each responsibility to its actual layer rather than copying a legacy folder wholesale into an Application. Update imports, focused tests, and this ownership map in the same slice, then remove the superseded implementation when its production callers have moved and the new path is verified. Keep a compatibility path only for a documented, verified compatibility requirement. Do not create empty or speculative subdirectories. Community native Plugin operation distribution remains future work; the static Widget Plugin contract provides package installation, metadata validation, and iframe isolation without granting host operations or network access.

## Consequences

The hierarchy makes ownership visible in code review and discourages business policy from accumulating in Core, UI runtime, Plugin packages, or generic utilities. Process launch and Electron lifecycle are owned by `src/host/`; the Plugin/Application wiring for Blog Beta lives in `src/composition/blog-beta-runtime.js`. The UI/API server remains a legacy composition path for a later migration slice. Existing product-level directories are legacy placement, not competing To-Be homes; each migration slice should remove the old placement once its callers have moved. The canonical current/target map is maintained in [Platform Kernel, Applications, and Plugins](../architecture/platform-kernel-applications-plugins.md).
