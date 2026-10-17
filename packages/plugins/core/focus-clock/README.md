# Focus Clock Widget Plugin

A self-contained static Widget Plugin that displays the local time and provides a 25-minute focus / 5-minute break timer.

The package contributes to `app.header.trailing`. BlogGenius loads its UI in a sandboxed iframe; the widget uses no application API, network, or persistent storage. Timer state and display preferences live only in the widget session.

To install the package independently, copy this directory under `<configDir>/plugins/focus-clock/` and restart BlogGenius. `<configDir>` is BlogGenius' active configuration directory (`CONFIG.PATHS.configDir`). The generic Widget Plugin catalog validates the manifest and exposes only the listed UI assets. A user-installed package with the same ID overrides the bundled copy.
