# Shopping Content Quality Improvement Plan

## Goal
Improve Shopping Connect article quality while keeping the shopping prompt independent from blog prompts. Common writing preferences remain shared, and each shopping item may optionally carry a user instruction that is treated as draft-authoring direction.

## Problems
- Requiring a number in every content block causes the same price, discount, review count, or shipping value to be repeated.
- Instructions that imply personal experience can make the model invent product use or purchase experience.
- A 2,000-character ceiling conflicts with seven to eight blocks of four to five sentences each.
- Strong scarcity and purchase-pressure language can overstate facts that are not present in official product data.
- Search keywords are important, but mechanical repetition reduces readability and trust.
- Noisy source product names can repeat the same brand, model, capacity, or sales modifier and leak that duplication into the generated title.
- Generic landing-page titles such as `네이버 브랜드 커넥트` can replace the actual product identity unless title resolution and final-title validation are independent from deduplication.

## Principles
- Official product data is the only authority for price, discount, shipping, payment, and benefit facts.
- Review data is attributed as user reaction and is never promoted to an official product fact.
- Missing information is omitted rather than inferred.
- Numbers appear only where they help a purchase decision, and the same fact is not repeated across blocks without a clear reason.
- BlogGenius is an assistant that produces a draft. Explicit user instructions take precedence over default editorial style and strategy.
- Without an explicit instruction, the article does not fabricate urgency, ownership, purchase, or use experience.
- When a user explicitly supplies an experience or requests experience-style narration, the draft may reflect it faithfully, but it must not invent additional concrete details beyond the instruction.
- Blog and shopping prompt files remain separate because their data contracts and conversion goals differ.
- Product-name deduplication never removes the requirement that the final title identify the actual product.
- The optional user-entered product name has precedence; otherwise a validated extracted product title is used. If neither is usable, generation stops with an actionable message.

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

### Phase 4: Per-item reference and instruction
- [x] Add an optional `참고/지시 사항` field to quick registration and row editing.
- [x] Add the same visible column to the shopping sheet and mirror it into `options.instruction` for extensible compatibility.
- [x] Resolve `options.instruction` first and fall back to the visible column.
- [x] Pass the instruction through the shared row executor so quick, batch, and automatic publishing behave consistently.
- [x] Give explicit user instructions precedence over default writing style and search/discovery strategy while retaining the JSON and official-product-data contracts.
- [x] Keep anti-fabrication as the default when no instruction exists, and prevent unrequested extra personal details when one does exist.
- [x] Limit the field to 1,000 characters in both UI and server validation.

### Phase 5: Editorial variation (separate sub-feature)
- [x] Select an evidence-based editorial angle from available product facts and review data.
- [x] Choose the angle deterministically from product identity and eligible evidence so retries remain reproducible.
- [x] Vary introductions, section order, headings, and conclusions without random factual invention.
- [x] Avoid forcing a frame whose required evidence is absent, and merge unsupported steps instead of filling them with invented details.
- [x] Let an explicit per-item instruction override the default angle and ordering.
- [x] Keep Naver and WordPress versions of the same product on the same editorial angle while retaining their platform-specific rendering guidance.
- [x] Preserve product identity independently from editorial variation: reject generic service titles and AI titles that omit the resolved core product keyword.

## Configuration Compatibility
- New saves persist `content.writing_style` and `content.writing_strategy` as the common preference.
- Existing `content.blog.*` values remain readable and are mirrored on save during the transition.
- Existing `CONFIG.BLOG_*` keys remain aliases so blog generation and per-post strategy overrides are unchanged.

## Validation
- Prompt contract unit tests must verify fact attribution, conditional anti-fabrication, explicit instruction precedence, selective number usage, and internally consistent volume guidance.
- Existing shopping extraction, title, publishing, and writing preference tests must continue to pass.
- UI verification is performed by the user.
