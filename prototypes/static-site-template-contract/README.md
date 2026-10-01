# Static Site Template Contract Spike

Disposable experiment for a tool-neutral Astro template package. This is not a product API or approved standard.

The package consists of `template.json` plus explicitly listed source files. Consumers should validate the descriptor, validate caller settings against its declared fields, verify each declared file hash, copy the package files, and generate `src/site.config.json`. The Astro fixture reads that generated config. No template code is evaluated by the consumer, and no general template language is introduced.

The hashes detect source-file changes relative to a trusted descriptor. They do not authenticate who published the descriptor or prevent an attacker from replacing both the descriptor and files; signature or trusted catalog distribution is outside this spike.

Run the focused contract checks from the BlogGenius repository root:

```sh
node --test prototypes/static-site-template-contract/contract.test.js
```

The checks use only Node.js built-ins and do not install dependencies, invoke Docker/Amade, contact Cloudflare, or access a network.

Open questions this experiment does not settle: how a released package is distributed, how publisher identity/signatures are trusted, whether settings need localization or richer schemas, how content is attached, and how users edit generated Astro source.
