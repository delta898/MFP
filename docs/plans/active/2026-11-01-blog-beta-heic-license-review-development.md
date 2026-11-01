# Blog Beta HEIC License Review

- Branch: `feature/blog-beta-heic-license-review`
- Start date: 2026-11-01
- Base/parent branch: `main`
- Status: initial license review complete; external legal/patent scope confirmation remains before release

## User need and goal

The user wants Blog Beta's editor to accept HEIC/HEIF through its three image entry paths (editor drag/drop, image-block drag/drop, and the add/import button), with a common import flow converting HEIC/HEIF to JPEG. The user selected `libheif-js` as the first-choice decoder and asked for careful license review on a separate feature branch before proceeding.

## Scope

- Inspect the exact `libheif-js` package version, package contents, upstream components, license texts, and distribution form relevant to the desktop application's packaged web UI.
- Identify obligations and unresolved legal/technical questions for shipping the decoder in the application.
- Record a recommendation and whether implementation can proceed with an acceptable compliance plan.
- If acceptable, continue the agreed HEIC import feature on this branch, subject to any required user decision about material tradeoffs.

## Explicit non-goals

- No version bump, release notes, commit, merge, push, or tag without separate user instruction.
- No unrelated OpenRouter/model work, WordPress work, or image optimization changes.
- No assumption that an MIT/ISC JavaScript wrapper changes the license of bundled native/WASM codec components.

## Proposed design and boundaries

Use one shared Blog Beta browser import pipeline for the three UI entry points. Perform HEIC/HEIF detection and JPEG conversion before the existing manuscript image import API, leaving backend storage contracts to receive supported JPEG bytes. Keep decoder loading lazy and isolate codec processing from UI handlers. Confirm packaging, notices/source availability, and codec license obligations before enabling distribution.

## Decisions and tradeoffs

- User selected `libheif-js` as the first-choice candidate for careful review.
- HEIC/HEIF should convert to JPEG at import time; preserve the existing supported image flow.
- The decoder's LGPL license is not treated as an automatic blocker, nor as automatically obligation-free. Exact packaged components and distribution duties require review.

## Review findings

- The current npm package is `libheif-js` 1.23.5 and declares LGPL-3.0. Its README describes a pure-JavaScript build, a WASM build with a separate runtime `.wasm`, and a `wasm-bundle` build that embeds the WASM binary in JavaScript. The installation script fetches the matching `libheif-emscripten` 1.23.5 build and minifies/bundles it.
- The Emscripten release pins upstream `libheif` 1.23.5. Upstream declares the library LGPL-3.0; its COPYING also contains the GPL-3.0 text as part of LGPL-3.0 and MIT notices for separate sample/wrapper code. The HEVC decoder integration is `libde265`, also declared LGPL by its upstream. These LGPL-covered components remain relevant regardless of the wrapper package name.
- BlogGenius is a proprietary Electron desktop app distributed in platform packages. The CI packager uses `--asar` by default and currently unpacks only Sharp native modules. The UI is served from the packaged app's `ui/` directory. No existing third-party notices UI or LGPL replacement/source delivery mechanism was found in the release path.
- LGPL-3.0 section 4 permits a Combined Work under the app's chosen terms, but requires prominent notices, GPL/LGPL license copies, and either (a) Minimal Corresponding Source plus Corresponding Application Code in a form permitting recombination/relinking with a modified library, or (b) a suitable shared-library mechanism that actually loads a user-replaceable, interface-compatible library at runtime. It also requires allowing modification of the LGPL portion and reverse engineering for debugging those modifications. Thus proprietary app source is not automatically required to be publicly released, but the applicable application code/relinking materials may need to be supplied to recipients depending on the chosen route.
- A separate `.wasm` file alone is not sufficient if its JS loader or host integration is bundled in a way that prevents replacing the LGPL library. A viable technical direction is to ship unmodified JS loader and WASM as separate, replaceable files outside the read-only ASAR payload, make the app load those files from an appropriate user-writable or otherwise replaceable location, and include notices/license texts and complete corresponding sources/build information. This needs implementation and end-to-end replacement verification; no compliance claim is made yet.
- Copyright-license analysis does not resolve HEVC patent rights. Access Advance's current FAQ says downloadable HEVC software generally requires a license but acknowledges exceptions and directs implementers to ask about their specific product. The proposed HEIC image decoder is distributed as part of a desktop application, so the status of the applicable software exception and other patent pools remains unconfirmed. This is the primary external legal question before release.
- Package download popularity or its MIT/other wrappers do not change the codec license or patent status. Registry tarball size was not measured because network access to npm registry is unavailable in this environment. A recent third-party report claims around 1.4 MB for the browser bundle, but that is not a verified release artifact measurement and is not used as a go/no-go basis.

## Recommendation and gate

Keep `libheif-js` as the selected first-choice technical candidate, but do not include it in a release until:

1. Counsel or the relevant patent administrator confirms whether the app's free/paid desktop distribution falls under a HEVC software licensing exception or requires a patent license in target territories.
2. The implementation uses the separate, replaceable library form rather than the embedded `wasm-bundle` form, ships all required LGPL/GPL notices and source/build materials, and demonstrates that a user-supplied interface-compatible modified library is actually loaded.
3. The exact package tarball and decoder build are pinned and audited for all bundled components; release artifacts and user-facing third-party notices are checked.

If the user wants the feature to proceed before item 1 is resolved, get explicit agreement that the patent risk is being accepted; the agent cannot clear that legal risk. The user already authorized branch creation and investigation. Feature coding is held until the external patent scope is decided because it can materially affect licensing cost and distribution.

## Review checklist

- [x] Inspect package metadata and package usage forms.
- [x] Trace pinned libheif version and upstream license; identify libde265 licensing as a separate dependency question to verify against the exact Emscripten asset contents before release.
- [x] Inspect app distribution and ASAR packaging approach.
- [x] Identify LGPL notices/source and replaceability requirements.
- [x] Check HEVC patent licensing separately; found an unresolved product-specific question.
- [ ] Measure exact package tarball and final platform artifact size.
- [ ] Verify all exact bundled component versions and license texts from the release asset.
- [ ] Confirm patent scope for this specific product/distribution and target countries.
- [ ] Implement replaceable external JS/WASM loading and demonstrate user replacement, if approved to proceed.
- [ ] Add common editor import flow, focused tests, notices and engineering docs, after the legal gate is cleared.

## Progress

- Confirmed current checkout was `main` and existing unrelated untracked files were present; these are being preserved.
- Created `feature/blog-beta-heic-license-review` from `main` and this record before implementation.
- No application code, package manifest, or lockfile changed. The current working change is this review record only.

## Verification and handoff

`git diff --check` passed. No product code changed, so no test suite was run. Manual UI acceptance remains the user's responsibility if implementation proceeds. This is a technical licensing-risk assessment, not a legal opinion; product-specific HEVC patent scope remains unresolved and must be cleared before release.
