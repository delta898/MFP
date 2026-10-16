# Site Hosting template test fixture

This minimal Astro package is test-only. Production templates are fetched from the Amade GitHub catalog and cached in the user's workspace. The catalog's remote-fetch, checksum, and cache behavior is covered by `src/site-hosting/github-site-template-catalog.test.js`; this fixture keeps repository and runtime unit tests deterministic without depending on GitHub availability.
