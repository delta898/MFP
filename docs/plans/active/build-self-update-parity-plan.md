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
- GitHub release assets use fixed platform filenames because the tag itself already provides the version namespace.
- Windows releases publish both:
  - `BlogGenius-win-x64.exe` for initial install
  - `BlogGenius-win-x64.zip` for self-update
- macOS/Linux releases publish one fixed portable ZIP per platform:
  - `BlogGenius-mac-arm64.zip`
  - `BlogGenius-mac-intel.zip`
  - `BlogGenius-linux-x64.zip`
- Stable download links rely on GitHub's `releases/latest/download/<fixed-name>` route instead of duplicated `-latest` alias assets.
- Local/custom builds mirror the same fixed filenames inside a versioned directory such as `v0.1.8/BlogGenius-linux-x64.zip`.
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
- Keep `build.sh` aligned with CI asset naming and local custom mirror layout
- Keep local `build.sh` focused on portable ZIP output; Windows installer generation is CI-only for now
- Remove duplicated `-latest` alias assets from both CI and local build output
- Do not change updater protocol unless required

## Non-Goals
- Release process redesign
- Version bumping
- Publishing to additional channels

## Validation
- Confirm workflow now generates `update.json`
- Confirm uploaded ZIP names still match updater platform selection rules
- Confirm GitHub stable links work via:
  - `releases/latest/download/BlogGenius-mac-arm64.zip`
  - `releases/latest/download/BlogGenius-win-x64.exe`
- Confirm Windows releases publish both `BlogGenius-win-x64.exe` and `BlogGenius-win-x64.zip`
- Confirm local/custom build output uses `vX.Y.Z/<fixed-asset-name>` paths in `update.json`
- Confirm `update.json` includes ZIP assets only and excludes `.exe` installer assets
- Confirm metadata shape matches what `src/updater.js` expects
