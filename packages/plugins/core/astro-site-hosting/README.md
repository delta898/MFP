# Astro Site Hosting Plugin

The Plugin package owns Astro process execution, build and preview behavior, Cloudflare static-asset deployment, and the Cloudflare SDK adapter. The Plugin creates these implementations itself; the Host does not supply an Astro runtime or deployer.

The Host supplies its credential resolver and the application ports the runtime needs: project/site repositories, template catalog, screenshot capture, and knowledge-collection building. Filesystem, path, process spawning, and HTTP fetch can also be supplied by the Host for controlled execution and tests. Cloudflare-specific calls stay inside this package; the manifest exposes normalized hosting operations.

This is a bundled in-process Core Plugin. Its package can be distributed with a compatible BlogGenius Plugin Host, but the current Site Hosting ports are BlogGenius Host contracts rather than a standalone generic hosting SDK.
