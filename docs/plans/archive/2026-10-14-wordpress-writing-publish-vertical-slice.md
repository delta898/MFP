# WordPress Writing and Publishing Vertical Slice

- Branch: `codex/feat/wordpress-writing-publish-vertical-slice`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`1cdc8061`)
- Status: implemented and verified; merged into parent feature branch

## User need and goal

The new Content Generator and WordPress Publisher plugins and their composing Application currently have isolated tests, but are not connected to BlogGenius's real writing UI. The user wants to validate the new platform structure through a complete path: create a manuscript in the UI, edit it, publish to WordPress through the new plugins, and see/preserve the result.

The goal is a functional first vertical slice whose real product entrypoint uses the shared Plugin Host and an Application to compose the generation and publishing operations.

## Agreed scope

- Use Blog Beta (`view-blog-next`) as the product UI.
- Generate text-only manuscripts through the Content Generator plugin regardless of publication target; allow the user to edit the generated manuscript, then publish through the WordPress Publisher plugin when WordPress is selected.
- Validate one destination end-to-end: WordPress.
- Exclude image generation for this first slice. Start with title and text only; image blocks, local image assets, media upload, and featured media are deferred until their manuscript-to-plugin asset contract is designed.
- Support immediate publishing and draft save. Scheduled publishing is deferred pending explicit timezone/date semantics and validation.
- Preserve product-owned concerns at the Host/UI API boundary: WordPress readiness and credential injection, execution/progress state, cancellation where safely possible, licensing/quota policy, publication history, and successful result snapshots.
- Keep failure behavior explicit: do not mark a failed or ambiguous remote create as published; retain the editable manuscript and avoid losing prior valid results.
- Add focused contract/application/host/UI API tests for the changed path. Browser/UI regression verification is required for the completed user flow. Full unit suite remains subject to the project approval gate before parent merge.

## Explicit non-goals

- Naver publishing or multi-target publishing.
- AI image generation, image upload, asset optimization, featured images, or image placeholder conversion.
- Scheduled/future posts.
- Telegram/MCP routing or notifications.
- Community plugin installation, process isolation, or plugin marketplace behavior.
- Release/version changes, merge into `dev`, push, or deployment.
- Preserving the legacy WordPress publisher implementation solely for compatibility; any retained code must have an intentional owner and transition plan.

## Proposed boundaries and flow

```text
Blog Beta UI
  -> UI API / Host execution boundary
      -> Blog Writing & Publishing Application
          -> Content Generator Plugin: text.generate
          -> WordPress Publisher Plugin: categories.list / posts.create
      -> manuscript history, quota, progress, and publication result storage
```

- The Host is the process-level composition root. One shared Plugin Runtime owns the registered Core Plugins; the product entrypoint must not create a private Host per request.
- The Host injects current WordPress credentials through a narrow provider and checks readiness before any generation/publishing side effects.
- The Application owns the product workflow and transformation between editor manuscript data and plugin inputs. It must remain channel-neutral and must not contain WordPress REST details.
- The WordPress Publisher plugin owns WordPress API operations and their input/output contracts. It does not own manuscript persistence, application quota, or BlogGenius UI state.
- The Content Generator plugin owns provider-neutral text generation. Blog-specific prompt policy/model selection remains behind the Host's injected generation adapter until its contract is deliberately moved.
- The UI remains responsible for interaction and presentation, not publisher orchestration or external API details.

## Implementation stages

1. Reconfirm current source contracts and identify a narrow manuscript representation with no image assets. Decide how generated text becomes an editable draft without bypassing the existing draft lifecycle.
2. Define/adjust Application input, output, errors, cancellation and operation composition contracts. Add focused Application tests before product wiring.
3. Wire the process-level shared Plugin Runtime and live credential/generation dependencies into the UI API composition root. Verify readiness and disabled/missing-plugin behavior.
4. Connect the Blog Beta text-only writing flow to the Application and WordPress publisher operations. Keep draft and immediate publish actions explicit.
5. Persist successful publication history/result snapshots and expose progress, URL, and failures in the existing UI completion flow.
6. Run focused unit/contract tests and relevant browser UI regression checks; update this record with actual outcomes and unresolved risks.

## Decisions and tradeoffs

- The first slice excludes image generation and all image asset handling to validate the lower-level architecture without conflating it with a not-yet-established asset contract. This is an intentional first-slice constraint, not a claim that images are outside the eventual Blog Application.
- The user confirmed a vertical-stack-first approach. No separate UI-only mock or backend-only demo satisfies the goal.
- The user clarified that writing and publishing are independent: text-only generation always uses the Content Generator Plugin, while the selected publisher determines only the later publication route. Image generation remains in the existing Core path until its Plugin contract is implemented.
- Immediate publish and draft save are included; scheduled posts are excluded because date/timezone semantics need explicit treatment.
- Existing product persistence/results are important user-visible responsibilities, but the new architecture may replace the implementation. Reuse is acceptable only where it fits the agreed boundaries.

## Progress and verification

- Initial investigation completed on 2026-10-14. Confirmed current Blog Beta UI uses the legacy `Core.publishToWordPress` path; new plugin/Application pilots are test-only and not wired to the UI runtime.
- Confirmed the current manuscript draft payload contains Markdown and optional image files, while the pilot publisher accepts normalized HTML/text and keyed asset Buffers. This slice excludes image data and therefore needs an explicit text-only projection.
- Added a Blog Writing Application and composition that select Content Generator and WordPress Publisher from the shared process Plugin Runtime.
- Wired text-only Blog Beta manuscript generation through `content-generator.text.generate` independently of publication target. The WordPress path lists categories through `wordpress-publisher.categories.list` and uses `wordpress-publisher.posts.create` for draft save or immediate publish. Existing prompt/profile/reference handling and shared licensing, quota, draft/history, and result paths remain at the product boundary.
- Kept the existing UI unchanged. The current image option is validated server-side for this pilot; generated/published WordPress manuscripts must be text-only, and status must be draft or immediate publish.
- Added operational logs that identify the selected generation route and Core fallback reason, Plugin generation start/completion and response size, WordPress category lookup, WordPress post-create operation start/response, manuscript draft save, and publication start/success/failure. Logs avoid prompt text, credentials, and raw WordPress response bodies.
- Corrected the WordPress failure path so a failed remote result does not call `markPublished` or archive a successful publication snapshot; it returns the still-editable draft and a failed archive result.
- User verified a real WordPress draft was created successfully. Their log showed the publisher Plugin operation, but generation ran through `[Core]`. The route-choice diagnostic was broadened to log every generation request, including missing/non-WordPress targets, so a later run can identify the precise fallback reason.
- Focused verification passed on 2026-10-14: `BLOGGENIUS_ENV=local node --test src/applications/blog-writing.test.js src/content/blog-reference-context.test.js src/ui-api/services/content.service.blog-next-execution.test.js src/ui-runtime/publish-actions-runtime.test.js` (48 passed, 0 failed).
- `node --check` passed for changed runtime/application modules and `git diff --check` passed.
- The user manually confirmed a real text-only generation followed by WordPress draft creation. Their runtime logs showed content-generator.text.generate and wordpress-publisher.posts.create both succeeding.
- Focused automated verification passed; no browser smoke or full unit suite was run. This sub-feature-to-parent merge uses the focused checks; the full unit suite remains a parent-to-dev gate and requires explicit approval.

## Remaining risks and follow-up

- Avoid a duplicate text-generation path: the current draft-generation API uses the quick-publish projection and model/quota settings. The new Application must become the actual generation route for this slice rather than wrapping an already-generated legacy result and calling that plugin use.
- Clarify whether application-level quota is charged for text generation, WordPress draft creation, and immediate publication independently or as one transaction. External WordPress side effects cannot be rolled back reliably.
- Cancellation during `posts.create` can have an ambiguous outcome if the server completes after the client aborts. Do not treat an abort as proof that WordPress did not create the post; verification/reconciliation behavior must be designed and tested.
- Existing Blog Beta publish status and archive snapshots assume a canonical manuscript and target-specific file snapshot. Focused tests verify successful archive and failed publication preservation; the actual product flow still needs manual confirmation against the user's configured WordPress site.
- Blog-specific prompt construction, category selection, and model-selection policies have not yet been moved into the new Application. Keep their ownership explicit during implementation; do not silently copy hidden rules into the Plugin.
- Cancellation during an external WordPress post-create remains potentially ambiguous if the server creates the post after the client aborts; do not interpret cancellation as proof that no remote post was created.
- Manuscript persistence still carries the existing targets setting even though text generation itself is now publication-target-independent. Revisit the editor/draft data model so writing state does not imply a publication destination; this requires a deliberate product-model change beyond the Plugin call contract.

## Final result

Implemented, with focused automated checks passing and the user-confirmed real text-only generation-to-WordPress-draft path. Immediate public publishing, image handling, and scheduled publishing remain outside this slice. No version bump, push, or release is included.
