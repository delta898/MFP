# Shopping Content Quality Improvement Plan

## Goal
Improve Shopping Connect article quality without adding new UI controls. The work keeps the shopping prompt independent from blog prompts while sharing only user-facing writing preferences in a later phase.

## Problems
- Requiring a number in every content block causes the same price, discount, review count, or shipping value to be repeated.
- Instructions that imply personal experience can make the model invent product use or purchase experience.
- A 2,000-character ceiling conflicts with seven to eight blocks of four to five sentences each.
- Strong scarcity and purchase-pressure language can overstate facts that are not present in official product data.
- Search keywords are important, but mechanical repetition reduces readability and trust.
- Noisy source product names can repeat the same brand, model, capacity, or sales modifier and leak that duplication into the generated title.

## Principles
- Official product data is the only authority for price, discount, shipping, payment, and benefit facts.
- Review data is attributed as user reaction and is never promoted to an official product fact.
- Missing information is omitted rather than inferred.
- Numbers appear only where they help a purchase decision, and the same fact is not repeated across blocks without a clear reason.
- The article helps the reader decide; it does not fabricate urgency, ownership, purchase, or use experience.
- Blog and shopping prompt files remain separate because their data contracts and conversion goals differ.

## Delivery Phases

### Phase 1: Prompt quality contract
- Resolve conflicting length and block-count requirements.
- Remove mandatory per-block numbers and fabricated personal-experience language.
- Replace aggressive scarcity instructions with evidence-based decision support.
- Keep each product identity keyword once in the title and prefer the model/variant over seller emphasis words.
- Add prompt contract tests for both Naver and WordPress shopping content.

### Phase 2: Shared writing preferences
- [x] Promote writing mode and speech level to a content-wide runtime preference with legacy config fallback.
- [x] Apply the preference to shopping prompt generation without changing the shopping fact contract.
- [x] Preserve blog per-post overrides; shopping uses only the global preference in this release.

### Phase 3: Shopping search/discovery strategy
- [x] Keep the shopping prompt separate from blog strategy prompts.
- [x] Inject a shopping-specific search or discovery strategy block.
- [x] Apply the global strategy to quick, batch, and automatic shopping publishing without adding per-product UI.

## Configuration Compatibility
- New saves persist `content.writing_style` and `content.writing_strategy` as the common preference.
- Existing `content.blog.*` values remain readable and are mirrored on save during the transition.
- Existing `CONFIG.BLOG_*` keys remain aliases so blog generation and per-post strategy overrides are unchanged.

## Validation
- Prompt contract unit tests must verify fact attribution, anti-fabrication rules, selective number usage, and internally consistent volume guidance.
- Existing shopping extraction, title, publishing, and writing preference tests must continue to pass.
- UI verification is performed by the user.
