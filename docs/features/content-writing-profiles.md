# Content Writing Profiles

## Scope

BlogGenius has one global writing-profile selection shared by ordinary blog and shopping generation. The user can choose either the versioned product default or one complete custom snapshot. Multi-profile, category-specific and per-account selection are not part of the current feature.

The profile stores repeatable writing preferences. It does not replace the subject, product facts, per-post references or per-post instructions.

## Profile Model

The schema separates common voice from content-kind capabilities.

- `common.voice`: conversational/written expression, polite/plain speech, tone and information density
- `common.style_instruction`: expression guidance shared by blog and shopping
- `channels.blog`: length, structure, narrator presence, image-area count, author context, blog instruction and analyzed style fingerprint
- `channels.shopping`: product-default mode and shopping instruction

The product default is loaded from `src/config/default_content_writing_profile.json`. A custom profile is stored as a complete snapshot in `config/writing_profile.json` with its `based_on_default_version`. Selecting the default preserves the custom snapshot and its reference analysis; deleting reference material is a separate explicit operation.

Missing or corrupt profile storage fails safely to the product default without overwriting the damaged file. Legacy expression and speech settings are migrated as a custom profile only when they differ from the current product default.

## Content-kind Projection

Generation receives an allowlisted projection, not the raw stored document.

- Blog receives `common + channels.blog`.
- Shopping receives `common + channels.shopping`.

Consequently, blog length, structure, narrator, author context, image plan and style fingerprint cannot enter the shopping prompt. Shopping instructions cannot enter the ordinary blog prompt. Common voice affects shopping expression but never becomes product evidence or permission to invent experience.

## Precedence

The effective order is:

1. system output, safety, factuality and image-syntax contracts;
2. explicit instruction and factual inputs for the current post;
3. direct fields and instructions in the selected profile;
4. an analyzed blog style fingerprint.

A per-post instruction can change the selected strategy, writing direction or image-area count for that post, but it cannot mutate the global profile or override system safety contracts. Direct profile choices such as conversational/written and polite/plain remain stronger than an inferred reference style.

## Blog Generation

`buildBlogGenerationPrompt` combines the shared output contract, exactly one search/discovery strategy, the blog profile projection, the resolved image plan and the current post input. Naver and WordPress both call this composer through `Core.generateContent`.

Length presets are:

| Preset | Target | H2 guide | Automatic image areas |
| --- | ---: | ---: | ---: |
| `short` | 900–1,200 characters | 3 | 3 |
| `standard` | 1,500–1,800 characters | 4–5 | 4 |
| `long` | 2,200–2,800 characters | 5–6 | 5 |

The image resolver selects an explicit per-post or Sheet count first, then a fixed profile count, then the length mapping. It requires an exact sequential set of `[[IMAGE_N ...]]` blocks. Actual image generation remains a workflow option independent from the presence of these prompt blocks. The planned three-state image policy is a separate follow-up.

## Shopping Generation

Shopping keeps its independent product facts, reviews, anti-fabrication rules, output blocks and product/FTC/CTA image policy. The selected common voice, common style instruction and shopping instruction are adapted into this contract. Product-specific instructions override global writing preferences only for that product and cannot create unsupported price, delivery, review or personal-experience claims.

Quick, batch and automatic shopping all converge on `ShoppingManager.buildPostFromShortUrl`.

## Style References

Blog style references are separate from per-post factual `reference_urls`.

- Input is one bounded sample text and up to three public HTTPS blog URLs.
- URL fetching rejects credentials, private/loopback/link-local destinations, unsafe redirects, non-HTML and oversized responses.
- The Chat Model produces an allowlisted structural and voice fingerprint.
- Raw text and fetched pages are never passed to ordinary generation.
- Failed or stale analysis may preserve the previous fingerprint for display, but only a current `analyzed` result is applied.
- Reference analysis never infers gender, age, occupation or other persona attributes.

The fingerprint applies only to blog projection and remains lower priority than direct profile fields.

## Preview

The Writing settings screen offers an explicit AI preview button. It sends the unsaved draft profile without persisting it.

- Blog uses a fixed or user-entered neutral topic.
- Shopping uses one fixed synthetic product fixture with bounded price, delivery and review facts.
- Both return an outline and a server-validated 400–600-character sample.
- The same normalizer, kind projection, strategy adapter and prompt components used by generation are reused.
- A malformed or incorrectly sized model result gets one bounded format-repair attempt.
- Preview failure never changes the stored profile or runtime effective profile.

## API and Ownership

- `GET|PUT /api/v1/settings/writing-profile`
- `POST /api/v1/settings/writing-profile/use-default`
- `POST /api/v1/settings/writing-profile/references/analyze`
- `DELETE /api/v1/settings/writing-profile/references`
- `POST /api/v1/settings/writing-profile/preview`

Primary code owners:

- `src/content/writing-profile.js`: schema, defaults, normalization and validation
- `src/content/writing-profile-repository.js`: selection, migration and atomic persistence
- `src/content/writing-profile-projection.js`: blog/shopping capability allowlists
- `src/content/blog-generation-prompt.js`: ordinary blog composition
- `src/content/shopping-writing-profile-prompt.js`: shopping profile adapter
- `src/content/style-reference-*`: safe reference fetching and fingerprint analysis
- `src/content/writing-profile-preview.js`: draft preview composition and validation
- Settings service/controller/routes: API boundary and runtime activation

