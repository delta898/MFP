# Blog Body Length Contract Development

- Branch: `feature/blog-body-length-contract`
- Base/parent branch: `feature/continuous-publishing-main`
- Start date: 2026-09-01
- Status: Complete; ready for parent integration

## User need and goal

Generated posts appear shorter after writing profiles were introduced. The user expects the selected body-length range to measure reader-visible prose only, excluding every `[[IMAGE_N ...]]` block and its image-generation prompt. Heading and image-area expectations also need to be explicit and consistent per profile.

The goal is to define one measurable blog body-length contract, align profile settings and prompt composition with it, and verify generated manuscripts without conflating prose with image metadata.

## Current findings

- The product default uses the `standard` length preset: approximately 1,500–1,800 characters including spaces.
- Automatic image planning maps short/standard/long to 3/4/5 recommended image areas.
- Image blocks live inside the generated `content` string, but the length instruction does not say to exclude them.
- Runtime validates sequential image indexes but does not measure reader-visible prose length or correct an undersized result.
- Documentation describes short/standard/long H2 guides as 3, 4–5 and 5–6, while the active prompt only supplies qualitative sparse/balanced/dense wording and omits those numeric ranges.
- Default heading density is `balanced`. A custom profile retains heading density internally and reference analysis may update it, but the current settings UI does not expose a direct heading-density control.

## Initial questions considered

- Define the exact character-count normalization rule for reader-visible blog prose.
- Decide how far generation may deviate from the selected range before correction is required.
- Restore explicit H2 guidance for each length preset and define how sparse/balanced/dense selects within it.
- Decide whether heading density should become a visible custom-profile setting.
- Align image-area recommendations with length presets without letting prompt metadata consume prose length.
- Add focused unit and generation-contract tests before integration.

## Explicit non-goals

- Do not change shopping-content length rules without separate agreement.
- Do not change AI providers, model selection, usage accounting or publishing behavior.
- Do not call paid models or publish content as part of automated verification without explicit approval.

## Approved decisions

- Reader-visible text—including opening, heading text, section prose and ending—counts toward the selected character range. Image blocks and Markdown syntax markers do not count.
- Character ranges remain space-inclusive guidance to the model; no post-generation measurement, warning, retry or correction is added.
- Short, standard and long guide the model to 3, 4–5 and 5–6 H2 sections respectively. Existing internal heading density selects the lower, balanced or upper side without adding a new UI control.
- Opening and ending are not H2 sections. The opening targets approximately 150–250 characters.
- H2 counts must not be satisfied with thin one- or two-sentence sections; every section needs explanation plus interpretation or practical information.
- The resolved image-area count is communicated as an exact writing instruction. Runtime continues to validate syntax/index order only and does not add count correction.

## Approved implementation scope

- Strengthen the active blog output contract with the reader-visible character-count definition.
- Add explicit length-dependent H2 and section-quality guidance to the writing-profile prompt.
- Make the resolved image-plan prompt request the exact block count.
- Strengthen search-oriented SEO guidance: choose one core keyword, preserve an explicit requested title, place the keyword early and distribute approximately 4–5 natural uses across reader-visible content and ending. Use the core or a closely related sub-keyword in one or two H2 headings, and distribute two to four useful related/sub-keywords once or twice in relevant explanations without keyword stuffing.
- Update focused prompt contracts and canonical feature documentation.
- Do not add new settings, post-generation validation, warnings, retries or paid correction calls.

## Progress

- 2026-09-01: Defined reader-visible, space-inclusive length guidance that excludes Markdown syntax and complete image blocks.
- 2026-09-01: Added explicit H2 guides of 3, 4–5 and 5–6 for short, standard and long profiles.
- 2026-09-01: Added a 150–250-character opening target, excluded opening/ending from H2 counts, prohibited thin filler sections and required explanation plus interpretation or practical information.
- 2026-09-01: Changed the resolved image count from an adjustable recommendation to an exact model instruction without adding runtime enforcement.
- 2026-09-01: Strengthened search-oriented SEO composition with one core keyword, early and closing placement, approximately four or five distributed uses, one or two keyword-relevant H2 headings, and two to four related/sub-keywords placed once or twice in relevant sections.
- 2026-09-01: Preserved an explicit requested title and added people-first, anti-keyword-stuffing constraints based on current Google Search guidance.

## Verification and handoff

- `node --test src/content/blog-*.test.js src/content/writing-profile-*.test.js` — 43 tests passed.
- `npm run test:unit` — 1,206 tests passed after aligning the shared Core prompt expectation with the approved exact image-block instruction. The first sandboxed run could not open two loopback test ports; the unrestricted local rerun passed.
- `git diff --check` — passed.

No UI control, post-generation length/count validation, warning, retry or correction call was added. No paid model or publishing action was used. The implementation is ready for integration review on the feature branch.
