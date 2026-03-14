# Build / Self-Update Parity Plan

## Goal
- Make GitHub Actions release builds produce the same self-update metadata quality as `build.sh`.
- Keep the updater working in both:
  - GitHub release mode
  - custom `update.json` mode

## Current Gap
- `build.sh` generates and uploads `dist/update.json`.
- `build.sh` derives `details.summary` and `details.highlights` from `CHANGELOG.md`.
- `build.sh` includes per-asset `sha256` and `size`.
- `.github/workflows/build.yml` currently uploads ZIP assets only and depends on GitHub-generated release notes.

## Desired Result
- CI release uploads ZIP assets and `update.json`.
- CI release metadata is derived from `CHANGELOG.md` in the same spirit as local build output.
- `update.json` contains:
  - `tag_name`
  - `published_at`
  - `prerelease`
  - `body`
  - `details.summary`
  - `details.highlights`
  - per-asset `name`
  - per-asset `browser_download_url`
  - per-asset `sha256`
  - per-asset `size`

## Scope
- Update `.github/workflows/build.yml`
- Keep `build.sh` behavior as reference
- Do not change updater protocol unless required

## Non-Goals
- Release process redesign
- Version bumping
- Publishing to additional channels

## Validation
- Confirm workflow now generates `update.json`
- Confirm uploaded ZIP names still match updater platform selection rules
- Confirm metadata shape matches what `src/updater.js` expects
