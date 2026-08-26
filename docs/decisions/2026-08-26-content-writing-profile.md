# Content Writing Profile Boundary

## Status

Accepted on 2026-08-26.

## Context

Writing variation was previously controlled mainly by search/discovery strategy and two legacy style axes. Users needed persistent control over composition, tone, length and reference style, while ordinary blog and shopping generation have different factuality, output and image contracts.

Allowing users to edit a system prompt or passing one unrestricted profile into every generator would couple preferences to safety contracts and leak blog-only assumptions into shopping content. Re-fetching style URLs during every generation would also make writing dependent on remote availability and repeatedly expose raw reference material to the writing model.

## Decision

BlogGenius uses one selected global profile with a versioned product default and one full custom snapshot. They remain separate profile identities.

The default profile permits only three persisted user overrides: writing strategy, expression mode and speech level. Its tone, instructions, references, length, structure and image plan always come from the current product default. The custom profile owns a complete snapshot and exposes the broader editing surface. This keeps the default understandable while preserving a clean path to multiple named custom profiles later.

Search/discovery writing strategy is part of that profile at `common.writing_strategy`, not a separate global setting. Reference analysis does not infer this purpose; the user chooses it explicitly. Per-post strategy overrides remain temporary and do not mutate the selected profile.

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
- Blog and shopping inherit one profile strategy while blog posts may still override it individually.
- The primary UI exposes one global additional writing principle; channel-specific global fields stay internal for compatibility.
- Narrator, author context, information density and heading density no longer require user decisions in the primary UI.
- Default updates do not silently alter an existing custom snapshot.
- Default updates continue to improve its hidden system-owned values while retaining the user's three explicit default overrides.
- A user can return to the default without losing custom data.
- Reference URL outages do not block generation from an already saved final profile.
- Prompt composition and precedence can be tested at explicit boundaries.
- New content kinds must define their own projection and adapter rather than consuming raw profile state.
- Multi-profile selection, memory-based variation and the three-state image policy remain separate future decisions.
