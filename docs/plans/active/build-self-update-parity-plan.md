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
- Stable portable releases additionally publish platform-fixed alias assets such as `BlogGenius-mac-arm64-latest.zip`.
- Windows releases additionally publish installer assets:
  - versioned: `BlogGenius-Setup-vX.Y.Z-win-x64.exe`
  - stable alias: `BlogGenius-win-x64-latest.exe`
- Non-Windows `-latest.zip` aliases are user-facing convenience links only and must not be treated as updater assets.
- Windows installer assets are user-facing download links only and must not be treated as updater assets.
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
- Add a Windows installer definition for CI packaging
- Keep `build.sh` behavior as reference
- Keep local `build.sh` focused on portable ZIP output; Windows installer generation is CI-only for now
- Mirror stable-only latest alias behavior in both local deploy and GitHub Actions release uploads
- Do not change updater protocol unless required

## Non-Goals
- Release process redesign
- Version bumping
- Publishing to additional channels

## Validation
- Confirm workflow now generates `update.json`
- Confirm uploaded ZIP names still match updater platform selection rules
- Confirm stable non-Windows releases publish `BlogGenius-<platform>-latest.zip` aliases
- Confirm Windows releases publish `BlogGenius-Setup-vX.Y.Z-win-x64.exe`
- Confirm stable Windows releases publish `BlogGenius-win-x64-latest.exe`
- Confirm prereleases do not overwrite stable `-latest` links
- Confirm `update.json` excludes `-latest.zip` alias assets and `.exe` installer assets
- Confirm metadata shape matches what `src/updater.js` expects
