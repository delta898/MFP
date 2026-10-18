# Source Directory Layering Decision

- Status: Accepted
- Date: 2026-10-15
- Scope: BlogGenius source code and staged migration of existing code

## Decision

Organize source by architectural layer, then group each product's application workflows under `src/applications/<name>/`. Keep UI/API presentation, external adapters, shared services/utilities, composition, host lifecycle, and Plugin implementations in their owning layers. A product menu is an Application vertical: its workflows are grouped under its Application even when UI, API, provider, and storage implementations live in other layers.

Move existing code responsibility by responsibility. Trace callers, relocate the behavior to its owning layer, route callers through the new boundary, verify the change, and remove superseded legacy implementations when no production path depends on them. Plugins must own complete capabilities rather than wrap implementation that remains private to the application.

## Rationale

The repository's former top-level folders grew around feature names and historical entry points, so related workflows became scattered and ownership was unclear. Layer-first placement makes dependencies and responsibility visible while allowing product verticals to remain coherent. This is a staged reorganization, not a wholesale folder rename.

## Canonical Rules

The detailed, current ownership map and migration rules are maintained in [Platform Kernel, Applications, and Plugins](../architecture/platform-kernel-applications-plugins.md). This decision records why the convention was adopted; it intentionally does not duplicate the complete directory tree or per-layer rules.
