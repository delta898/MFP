# Update Settings UI Plan

## Goal
- Reorganize `설정 > 일반` into clearer sections.
- Add editable update source settings to the UI.
- Move image optimization to `설정 > 블로그` and rename it to `이미지 용량 최적화`.
- Move image optimization config from `automation.image_optimization_enabled` to `publish.image_optimization_enabled`.

## Confirmed Direction
- `system.update_server_type` default: `github`
- `system.update_mirror_repo` default: `delta898/NaverAutoBlog-Releases`
- `system.custom_update_check_url` default: empty string
- `system.update_channel` stays config-only for now and is not editable in UI

## UI Structure

### Settings > General
- 일반 설정
  - `GEMINI_API_KEY`
- Google 계정 연결
  - `GOOGLE_SHEET_URL`
  - Google OAuth status and actions
- 서버 설정
  - `LISTEN_HOST`
  - `LISTEN_PORT`
- 앱 업데이트
  - current version
  - update source selector
  - GitHub repo field or custom update URL field
  - latest version check / force update buttons

### Settings > Blog
- 네이버 블로그
- 워드프레스
- 발행 옵션
  - `이미지 용량 최적화`
  - typing speed
  - typing preview

## Data Changes
- Read/write image optimization at `publish.image_optimization_enabled`
- No backward compatibility migration is required for this change

## Validation
- Save/load of update source settings works
- Save/load of image optimization works from the blog tab
- Existing update actions still use the saved runtime settings
