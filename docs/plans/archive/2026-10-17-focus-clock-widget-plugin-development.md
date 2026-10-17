# Independent Widget Plugin Development

## Branch and status

- Branch: `codex/feat/focus-clock-widget-plugin`
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Start date: 2026-10-17
- Status: implementation and automated validation complete; merged into the parent feature branch

## User need and goal

The Focus Clock should be an independently installable widget. The application provides a stable display slot; installing the widget package makes its interface and behavior available in that slot without adding clock-specific code to the application.

## Scope

- Define and implement a manifest for static Widget Plugin contributions.
- Discover bundled and user-installed widget packages at application startup.
- Expose a generic slot list and a package-asset endpoint through the UI adapter.
- Mount one widget instance into the active application slot using a sandboxed iframe.
- Move the clock display, preferences, timer behavior, styles, and completion feedback into the Focus Clock package.
- Replace application-specific clock markup with generic slot declarations and remove Focus Clock-specific Application, operation, adapter, and route code.
- Update the architecture and directory ownership documentation.

## Explicit non-goals

- Arbitrary native Plugin operations, user credentials, or network access from Widget Plugins.
- A graphical package marketplace or in-app installer/update/rollback UI. Independent static packages are installed under the user plugin directory and discovered on app startup.
- Changes to clock appearance or timer features unrelated to package ownership.
- Commit, merge, push, or release.

## Design

- A Widget Plugin is a static package described by `package.json#bloggeniusWidget`: package ID, display metadata, widget slot, HTML entry point, and an explicit allowlist of package assets.
- The host catalog reads only package metadata. Bundled packages live in `packages/plugins/core/`; user-installed Widget Plugins live in `<configDir>/plugins/` and override bundled packages with the same ID.
- The application declares stable slot names such as `app.header.trailing`. A generic renderer discovers contributions and mounts the active view's widget in a sandboxed iframe (`allow-scripts`, without same-origin or top-navigation access). One iframe is moved between active views so session-only widget state survives navigation.
- Plugin assets are served only when named by the validated package manifest and resolved inside the package directory. The iframe receives a restrictive content security policy and no implicit application API access.
- Invalid packages are skipped with a warning so malformed metadata does not prevent the UI server from starting. App-owned controls may sit beside the widget slot; global publishing status remains an app feature.
- The Focus Clock is self-contained in its package: wall clock, timer transitions, presentation preferences, sound, and completion feedback stay in the widget runtime. State remains in memory for the lifetime of its iframe/app session; no persistence is introduced.
- Widget popovers use the generic host expanded-state contract. A fixed-size in-flow shell reserves the widget's manifest height; when open, the host raises that shell and expands its iframe over following page content, then restores the iframe and stacking order on close or outside interaction. This keeps the slot's layout height unchanged while preserving the widget's iframe and interaction context.

## Decisions and tradeoffs

- User approved an independent Widget Plugin model: the application supplies only slots; a plugin supplies its own UI and behavior.
- Widget UI is sandboxed rather than loaded into the trusted app renderer. This supports independent static packages without giving them the application's DOM or JavaScript globals.
- Widget packages are discovered from bundled and user-data directories at startup. A visual installer and hot reload are deferred; installation means placing a validated package in the plugin directory and restarting the app.
- This static Widget Plugin contract is distinct from native Core Plugin operations. Network/API capabilities are intentionally absent in this first contract; a future capability bridge needs its own explicit permissions and review.

## Affected boundaries

- `src/platform/`: Widget manifest validation and package catalog.
- `src/adapters/ui/`: widget discovery and static asset HTTP routes.
- `src/ui-runtime/` and shared UI foundation: generic slot mounting.
- `packages/plugins/core/focus-clock/`: complete Focus Clock widget package.
- `ui/partials/` and `ui/styles/`: app-owned slot declarations and removal of clock-specific presentation.
- `docs/architecture/` and `docs/decisions/`: stable ownership and package installation contract.

## Progress and verification

- 2026-10-17: Existing provisional implementation inspected. It moved timer transitions into a native operation Plugin, but clock UI, styling, and session behavior remained application-owned, so installing that package alone could not provide a widget.
- 2026-10-17: User approved redesign as an independent Widget Plugin with generic application slots.
- 2026-10-17: Manual UI review found several clock faces rendered without their styling. The shared widget asset CSP had blocked inline styles used by the existing clock-face and progress renderers. Permit inline styles inside the already sandboxed widget document while retaining its opaque origin and the script, network, form, and plugin restrictions. Also ensure a random style change does not pick the currently displayed face.
- 2026-10-17: Follow-up UI review showed the clock-style controller menu stayed clipped to the initial iframe height. Expanding the iframe to the full manifest maximum created too much blank space. A fixed-layer relocation then caused unreliable controller interaction. Keep the iframe in its slot and send the measured menu height through the generic expanded-state contract; the host bounds it by the manifest and restores the default height on close or outside interaction.
- 2026-10-17: Keep menu visibility as an explicit `hidden` state controlled by the widget, with CSS display rules that do not depend on the open-state descendant selector. The menu itself scrolls within a 440px limit; the overlay covers subsequent page content while the reserved slot remains at its default height.
- 2026-10-17: Runtime diagnostics from the user's reproduction confirmed the controller handler ran, the widget requested a 564px overlay, and the host matched the message and applied that exact iframe height. The actual clipping boundary was the widget document's `body { overflow: hidden }`, which kept clipping the absolutely positioned menu even after the iframe grew. Keep viewport clipping on `html` but allow the body overflow so the menu can use the expanded iframe viewport. Remove temporary diagnostics after identifying the cause.
- 2026-10-17: User clarified that opening the controller must not increase the slot/card's layout height. Keep a fixed-height in-flow shell and expand the iframe as an overlay above following content; this preserves the same iframe browsing context and click handling without pushing the page down.
- 2026-10-17: Reproduction showed that switching from the timer tab to the taller clock tab while the menu remained open left the iframe at its initial measured height. Observe menu size changes and resend the expanded height while open so tab changes and conditional controls remain fully visible.
- 2026-10-17: Align clock-style selection with timer-style selection: choosing a clock face updates the display without closing the open controller menu.
- 2026-10-17: Add an explicit separator between the date/season label and the greeting in the clock status row so the two phrases do not run together.
- 2026-10-17: Apply the same explicit separator between the current time and date/season label in timer mode.
- 2026-10-17: Rename the app-owned global publishing status CSS hooks and posting-completion celebration stylesheet/animations so they no longer carry Focus Clock naming.
- Added the `bloggeniusWidget` manifest/catalog, generic contribution and asset routes, sandboxed iframe slot host, and application-owned slot declarations.
- Moved clock presentation, session preferences, timer behavior, styles, and completion feedback into the self-contained package; removed the provisional native operation/Application/adapter/routes.
- Added MIME mappings for the widget catalog's WebP and WOFF/WOFF2 asset types. Empty generic slots collapse until a widget is mounted, and multiple contributions wrap within the slot.
- Updated the architecture and source-layering documents to distinguish static Widget Plugins from native operation Plugins.
- Full unit suite: 2,402 tests; 2,401 passed, 0 failed, 1 platform-specific test skipped.
- UI validation: browser smoke, UI E2E smoke, Blog API smoke, and Settings API smoke all pass. Browser smoke fixture serves the actual bundled Widget Plugin catalog and package assets.
- `git diff --check` passes. The user exercised the clock and timer controls during implementation; final visual acceptance remains with the user.

## Remaining risks and follow-up

- Package directory installation is manual in this stage; a product UI for installing/removing packages is not included.
- The iframe sandbox intentionally prevents API calls. Widgets that need host capabilities require a separately designed permission and message contract.
- Final visual acceptance remains with the user; useful flows are first render, moving the single widget between views, clock/timer controls, and session behavior.
- The global publishing-status shortcut remains outside the sandboxed widget package as an application-owned control beside the generic slot.
