# Content Writing Profile Boundary

## Status

Accepted on 2026-08-26.

## Context

Writing variation was previously controlled mainly by search/discovery strategy and two legacy style axes. Users needed persistent control over composition, tone, length and reference style, while ordinary blog and shopping generation have different factuality, output and image contracts.

Allowing users to edit a system prompt or passing one unrestricted profile into every generator would couple preferences to safety contracts and leak blog-only assumptions into shopping content. Re-fetching style URLs during every generation would also make writing dependent on remote availability and repeatedly expose raw reference material to the writing model.

## Decision

BlogGenius uses one selected global profile with a versioned product default and one full custom snapshot.

The stored profile is projected through a content-kind allowlist:

- ordinary blog receives common and blog capabilities;
- shopping receives common and shopping capabilities.

System output, factuality, safety and image contracts remain code-owned and stronger than all profile values. Per-post instructions are stronger than direct profile preferences for that post. Direct profile fields are stronger than analyzed reference-style traits.

Style source text and public blog URLs are analyzed separately into an allowlisted fingerprint. Ordinary generation receives only a current successful fingerprint, never the raw source. Preview accepts an unsaved draft and reuses the same normalization, projection and prompt components without persisting the draft or its synthetic fixture.

The writing profile is persisted separately from the general settings document so reference lifecycle, atomic recovery and future profile-store expansion remain isolated.

## Consequences

- Blog and shopping can share voice without sharing incompatible structure or evidence.
- Default updates do not silently alter an existing custom snapshot.
- A user can return to the default without losing custom data.
- Reference URL outages do not block later generation.
- Prompt composition and precedence can be tested at explicit boundaries.
- New content kinds must define their own projection and adapter rather than consuming raw profile state.
- Multi-profile selection, memory-based variation and the three-state image policy remain separate future decisions.

