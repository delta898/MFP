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
  platform/
  composition/
  applications/<application-name>/
  utilities/<capability>/
packages/plugins/core/<plugin-id>/
```

Blog workflows live under `src/applications/blog/`. Other products follow the same `src/applications/<application-name>/` convention. Shared media operations live under `src/utilities/media/`. The Blog Application owns publication choices such as target image format; the media utility performs the requested conversion. Provider/platform Plugins remain independently bounded under `packages/plugins/core/`.

## Ownership rules

- Host owns product bootstrap and routing, not workflows.
- Adapters translate channel or external protocol formats, not business behavior. Host-owned AI provider authentication and transport are adapters; model availability/selection remains Application policy.
- Platform owns the shared Plugin contract, discovery/validation rules, lifecycle, and operation dispatch.
- Composition wires concrete Plugins and host dependencies into Applications.
- Applications own product workflows and policies.
- Utilities own reusable technical operations without product-specific policy.
- Plugin packages own bounded external integration behavior and follow the shared manifest contract.

## Migration policy

This is the required placement convention for new code. Existing directories and callers are not moved for appearance alone. Migrate a legacy slice when its boundary is deliberately changed, keep the new responsibility in its target layer, and bridge old callers through a narrow adapter/composition seam. Do not create empty or speculative subdirectories. The `community/` Plugin distribution and runtime model remain future work until trust, installation, permissions, and isolation are designed.

## Consequences

The hierarchy makes ownership visible in code review and discourages business policy from accumulating in Core, UI runtime, Plugin packages, or generic utilities. The Plugin/Application wiring for Blog Beta lives in `src/composition/blog-beta-runtime.js`; legacy process/bootstrap and unrelated UI setup remain in `ui-server.js` until Host bootstrap migration is a real, testable slice. The canonical current/target map is maintained in [Platform Kernel, Applications, and Plugins](../architecture/platform-kernel-applications-plugins.md).
