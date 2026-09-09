# Content Writing Profile Boundary

## Status

Accepted on 2026-08-26. Revised on 2026-09-09 for the Settings Beta single-default model.

## Context

Writing variation was previously controlled mainly by search/discovery strategy and two legacy style axes. Users needed persistent control over composition, tone, length and reference style, while ordinary blog and shopping generation have different factuality, output and image contracts.

Allowing users to edit a system prompt or passing one unrestricted profile into every generator would couple preferences to safety contracts and leak blog-only assumptions into shopping content. Re-fetching style URLs during every generation would also make writing dependent on remote availability and repeatedly expose raw reference material to the writing model.

## Decision

BlogGenius exposes one global `글쓰기 기본값`, not a choice between product and custom profile identities. The user edits one complete snapshot for voice, common instructions, blog length, structure, image plan and analyzed references. The versioned product default is the initial seed and the target of `추천 설정으로 되돌리기`; it is not a second selectable profile in Settings Beta.

The existing profile document and its `default`/`custom` identities remain an internal compatibility boundary while the legacy Settings surface coexists. Settings Beta persists its single writing default as the complete custom snapshot and does not create a second source of truth or parallel schema. Named multi-profile creation remains deferred until repeated switching between reusable bundles is a verified user need.

Search/discovery writing strategy describes the intent of the current writing task, so Settings Beta does not expose or mutate it as a writing-default property. The current schema field at `common.writing_strategy` is preserved for compatibility until Blog Beta adopts the explicit per-writing choice. Reference analysis does not infer or overwrite this purpose.

The stored profile is projected through a content-kind allowlist:

- ordinary blog receives common and blog capabilities;
- shopping receives common and shopping capabilities.

System output, factuality, safety and image contracts remain code-owned and stronger than all profile values. Per-post instructions are stronger than profile preferences for that post.

A custom profile always exposes one editable set of final fields. An optional reference tool accepts one pasted text or one public blog URL, analyzes it and fills those same fields. The user can then edit the analyzed voice, length and composition. There is no direct/reference mode or runtime precedence between two sources.

Reference text or one public blog URL is analyzed into allowlisted profile recommendations and supplementary traits. Ordinary generation receives the final edited profile and only current supplementary traits, never the raw source. Preview accepts an unsaved draft and reuses the same normalization, projection and prompt components without persisting the draft or its synthetic fixture.

Reference analysis and profile preview both use the configured Writing Model. The Settings UI identifies this dependency through compact contextual help rather than adding another model selector.

The writing profile is persisted separately from the general settings document so reference lifecycle, atomic recovery and future profile-store expansion remain isolated.

## Consequences

- Blog and shopping can share voice without sharing incompatible structure or evidence.
- Blog and shopping inherit the shared voice while each writing task owns its strategy selection.
- The primary UI exposes one global additional writing principle; channel-specific global fields stay internal for compatibility.
- Narrator, author context, information density and heading density no longer require user decisions in the primary UI.
- Product-default updates do not silently alter the saved user snapshot.
- A user can explicitly return editable writing values to the current product recommendation without choosing between two profile identities.
- Reference URL outages do not block generation from an already saved final profile.
- Prompt composition and precedence can be tested at explicit boundaries.
- New content kinds must define their own projection and adapter rather than consuming raw profile state.
- Multi-profile selection, task-level strategy UI, memory-based variation and the three-state image policy remain separate decisions. The task-level strategy contract is completed with Blog Beta in the following stage.
