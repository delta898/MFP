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
    plugins/                    # Host operation ↔ shared service-port translation
  platform/
  composition/
  services/<domain>/            # Cross-application reusable domain contracts
  applications/<application-name>/ # Application workflows and app-specific domain services
  utilities/<capability>/
packages/plugins/core/<plugin-id>/
```

Blog workflows live under `src/applications/blog/`. Every product follows the same `src/applications/<application-name>/` convention. This directory owns the product's user workflows, workflow coordination, and product-specific domain services and policies; organize below it by real capability or workflow boundaries such as `generation/` and `publishing/`.

`src/services/<domain>/` is reserved for capabilities/contracts reused across multiple Applications. It is not the place for an application's top-level service layer. Shared media operations live under `src/utilities/media/`. The Blog Application owns publication choices such as target image format; the media utility performs the requested conversion. Provider/platform Plugins remain independently bounded under `packages/plugins/core/`.

## Ownership rules

- Host owns product bootstrap and routing, not workflows.
- Adapters translate channel or external protocol formats, not business behavior. Host-owned AI provider authentication and transport are adapters. Supabase is the sole source of catalogued AI model availability and metadata; the AI Gateway filters that catalog against its implemented `kind + provider + transport` routes, and Applications resolve user selections from the resulting shared snapshot rather than maintaining a second model inventory.
- Platform owns the shared Plugin contract, discovery/validation rules, lifecycle, and operation dispatch.
- Composition wires concrete Plugins and host dependencies into Applications.
- Services expose reusable cross-application contracts; they do not own product workflows or Plugin IDs.
- Applications own product workflows, orchestration, and app-specific services and policies. The top-level `src/applications/<name>/` is the target home for existing app-level service areas such as SNS, Card News, and Blog Next behavior, split below that boundary by responsibility.
- Plugin adapters are the only Application-facing layer that knows concrete Plugin and operation IDs; UI/API callers use Application/service ports.
- Utilities own reusable technical operations without product-specific policy.
- Plugin packages own bounded external integration behavior and follow the shared manifest contract.

## Migration policy

This is the required placement convention for new code. Do not add new Application business logic to legacy top-level product areas such as `src/social/`, `src/card-news/`, or `src/blog-next/`; place new work under `src/applications/<name>/` and connect legacy callers through narrow adapters/composition seams. Existing files remain where they are for now. Their migration is deferred to a coordinated, cross-Application migration stage rather than piecemeal directory moves. Migration must classify each file by responsibility: UI/channel entrypoints, external-system adapters, and shared services/utilities move to their corresponding layers instead of being copied wholesale into an Application. Do not create empty or speculative subdirectories. The `community/` Plugin distribution and runtime model remain future work until trust, installation, permissions, and isolation are designed.

## Consequences

The hierarchy makes ownership visible in code review and discourages business policy from accumulating in Core, UI runtime, Plugin packages, or generic utilities. The Plugin/Application wiring for Blog Beta lives in `src/composition/blog-beta-runtime.js`; legacy process/bootstrap and unrelated UI setup remain in `ui-server.js` until Host bootstrap migration is a real, testable slice. Existing product-level directories are a legacy placement, not competing To-Be homes. Their migration is intentionally grouped into a later coordinated stage. The canonical current/target map is maintained in [Platform Kernel, Applications, and Plugins](../architecture/platform-kernel-applications-plugins.md).
