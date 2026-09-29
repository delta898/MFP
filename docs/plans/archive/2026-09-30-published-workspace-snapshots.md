# Published Workspace Snapshots

- Branch: `codex/published-workspace-snapshots`
- Start date: 2026-09-30
- Base/parent branch: `dev`
- Status: Implementation complete; awaiting integration

## User need and goal

Keep user-authored blog content and published results as durable local assets. Draft workspaces and
successful platform publication snapshots have different lifecycles and must not be conflated.

## Agreed scope

- Keep manuscript drafts under the existing `workspace/manuscript-drafts/` area and do not delete all
  drafts at app exit. Preserve the existing expiry-based cleanup policy; restart/resume UI is not part
  of this slice.
- After a platform post succeeds (including platform draft/temporary-save status), persist a snapshot
  under the corresponding `workspace/wp_<site>/` or `workspace/naver_<id>/` area.
- Give each publication snapshot a short shared ID generated from `crypto.randomBytes(6)` encoded as
  unpadded Base64 URL-safe text (8 characters).
- Failed posts do not enter the durable platform archive. Any staging/temp files must be cleaned after
  either success or failure.
- Keep the existing duplicate-publication guard unchanged. A future workflow that lets one draft be
  separately temporary-saved and then published as a second post is a distinct product requirement;
  this slice must not enable or design around that workflow.

## Non-goals

- Do not implement app-data path migration or change the OS-specific locations of `config/`, `data/`,
  `logs/`, or `workspace/`; that remains a separate backlog item.
- Do not add WordPress post updates, Naver draft conversion, draft listing/recovery UI, or change draft
  retention durations.
- Do not create snapshots for failed or merely prepared-but-unpublished content.

## Proposed design and stages

1. Inspect the completed publishing result contract for both Naver and WordPress and identify reliable
   success evidence, platform identity, status, URL/remote ID, and the exact final local source/assets.
2. Add a focused snapshot persistence boundary that stages output outside the durable archive, then
   atomically moves it into the platform workspace only after confirmed publish success.
3. Use a collision-safe 8-character publication ID and filesystem-safe platform identity; preserve the
   original markdown and included image assets so the local copy remains useful independently.
4. Add focused tests for both platforms, temporary-save status metadata, unconfirmed posts, cleanup,
   and collision resistance. Preserve existing duplicate-publication tests and behavior.

## Decisions and tradeoffs

- Platform archive folders contain successful post operations only; draft workspaces remain temporary
  editable work with expiry cleanup.
- Each successful post operation is stored separately; this does not change the app's current
  duplicate-post policy or add post conversion/update behavior.
- The compact ID is shared by the publication's related output files/folder to avoid name collisions
  without exposing the long internal manuscript UUID.
- Migration details for moving existing app-relative data are deferred to a later discussion.

## Progress and verification

- Initial repository inspection confirmed that Blog Beta drafts are stored in
  `workspace/manuscript-drafts/<uuid>/`, and cleanup is expiry-based at startup.
- The publish flow calls `markPublished` only after the platform publisher returns success.
- Added a service boundary that stages selected Markdown/assets and atomically renames a complete
  snapshot into `wp_<host>/` or `naver_<id>/` only after a successful platform result.
- Added an 8-character publication ID, `publication.json` metadata, and stale staging cleanup.
- Connected successful manuscript publishing to local snapshot persistence. Remote publish success is
  preserved if local archival fails, and the UI warns that local saving failed.
- Preserved the current duplicate-publication guard; no draft-to-final-post conversion workflow was
  added.
- Focused verification passed: 66 tests across manuscript draft storage, Blog Beta publish execution,
  and publish result mapping. Existing duplicate-publication checks pass unchanged.
- Browser UI smoke passed with 487 fixture requests; no real AI generation or platform publishing was
  performed by the test.
- `git diff --check` passed.
- Manual check for the user's own development run: publish one Naver post and one WordPress post,
  then confirm each `workspace/naver_<id>/<8-char-id>/` or `workspace/wp_<host>/<8-char-id>/` folder
  contains `contents.md`, included images, and `publication.json`. For temporary save, verify the
  snapshot metadata says `draft`. No manual real-platform publish was run during implementation.

## Final handoff

Implementation is ready for user review. No known functional issue remains in the scoped behavior.
Storage is best-effort after remote success; if the local disk write fails, the UI reports the failure
while keeping the remote publication successful and the draft available under its normal retention.
