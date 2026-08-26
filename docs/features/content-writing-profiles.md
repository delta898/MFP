# Content Writing Profiles

## Scope

BlogGenius has one global writing-profile selection shared by ordinary blog and shopping generation. The user can choose either the versioned product default with three bounded overrides or one complete custom snapshot. Multi-profile, category-specific and per-account selection are not part of the current feature.

The profile stores repeatable writing preferences. It does not replace the subject, product facts, per-post references or per-post instructions.

## Profile Model

The schema stores one final profile and keeps optional reference-analysis data separate from content-kind capabilities.

- `common.writing_strategy`: final search/discovery purpose shared by blog and shopping
- `common.voice`: final conversational/written expression, polite/plain speech, tone and density
- `common.style_instruction`: one optional writing principle shared by blog and shopping
- `channels.blog`: length, structure, narrator presence, image-area count, author context, blog instruction and analyzed style fingerprint
- `channels.shopping`: product-default mode and shopping instruction

The default-profile UI exposes only the choices expected to vary by user: search/discovery strategy, conversational/written expression and polite/plain speech. Tone, additional writing principle, reference analysis, blog length, flow and image-area count stay on the product defaults and are not shown. The custom-profile UI exposes the full minimal editing surface, including those settings and the optional `참고 글로 자동 설정` tool. There is no direct/reference mode. Author context and channel-specific global instructions remain empty; one-off requirements belong to the post-level instruction.

The product default is loaded from `src/config/default_content_writing_profile.json`. Storage keeps `default_profile_overrides` containing exactly `writing_strategy`, `writing_mode` and `speech_level`; all other default-profile values continue to follow the current versioned product default. A custom profile is stored separately as a complete snapshot in `config/writing_profile.json` with its `based_on_default_version`. Switching either way preserves both sets of values, so future named profiles can extend the custom side without changing default semantics.

Missing or corrupt profile storage fails safely to the product default without overwriting the damaged file. When no profile file exists, the previously supported expression, speech and global strategy settings seed the three default overrides once. Because this feature has not shipped yet, intermediate development schemas are not supported or migrated.

## Content-kind Projection

Generation receives an allowlisted projection, not the raw stored document.

- Blog receives `common + channels.blog`.
- Shopping receives `common + channels.shopping`.

Consequently, blog length, structure, narrator, author context, image plan and the fingerprint's blog-structure traits cannot enter the shopping prompt. Shopping instructions cannot enter the ordinary blog prompt. The final common voice—whether entered directly or filled by analysis—affects both content kinds but never becomes product evidence or permission to invent experience.

## Precedence

The effective order is:

1. system output, safety, factuality and image-syntax contracts;
2. explicit instruction and factual inputs for the current post;
3. selected profile strategy, composition, length and global writing principle;
4. allowlisted supplementary rhythm and vocabulary traits from the analyzed reference, when present.

A per-post instruction can change the selected strategy, writing direction or image-area count for that post, but it cannot mutate the global profile or override system safety contracts. Reference analysis first fills the final voice, length and composition fields; the user may then edit them. Generation reads those final fields directly and never resolves a conflict between source text and visible settings.

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

Shopping keeps its independent product facts, reviews, anti-fabrication rules, output blocks and product/FTC/CTA image policy. The resolved common voice and single global writing principle are adapted into this contract. Product-specific instructions override global writing preferences only for that product and cannot create unsupported price, delivery, review or personal-experience claims.

Quick, batch and automatic shopping all converge on `ShoppingManager.buildPostFromShortUrl`.

## Style References

Profile reference input is separate from per-post factual `reference_urls`.

- Input is exactly one method: one bounded pasted text or one public HTTPS blog URL.
- URL fetching rejects credentials, private/loopback/link-local destinations, unsafe redirects, non-HTML and oversized responses.
- The configured Writing Model produces an allowlisted structural and voice fingerprint.
- Raw text and fetched pages are never passed to ordinary generation.
- Failed or stale analysis may preserve the previous fingerprint for display, but only a current result with an analyzed source is applied.
- Reference analysis never infers gender, age, occupation or other persona attributes.

The analyzer returns allowlisted recommendations for voice, length, opening, development, ending and heading density. The UI copies them into the ordinary editable profile fields. Fine-grained rhythm, vocabulary and avoid-list traits remain blog-only supplements and may not override the final visible settings. Deleting the optional reference removes its source and supplementary traits while retaining the already filled final settings.

## Preview

The Writing settings screen offers an explicit AI preview button. It sends the unsaved draft profile without persisting it.

- Blog uses a fixed or user-entered neutral topic.
- Shopping uses one fixed synthetic product fixture with bounded price, delivery and review facts.
- Both target a 400–600-character sample. Short samples are shown as returned, while long samples are trimmed to at most 600 characters with a sentence boundary preferred. Length alone never triggers another model call; only malformed JSON, a missing outline or an empty sample is repaired.
- The sample uses two or three short paragraphs separated by blank lines. Blog preview shows one representative image block in the real multiline manuscript syntax instead of forcing the full article's image count into a short sample.
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
