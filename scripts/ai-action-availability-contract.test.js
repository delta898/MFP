const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared capability readiness blocks only explicit unavailability and reuses safe status', () => {
  const shared = read('ui/scripts/shared/capability-readiness.js');
  const legacyReadiness = read('ui/scripts/foundation/readiness.js');

  assert.match(shared, /if \(value === false\) return 'unavailable'/);
  assert.match(shared, /return 'unknown'/);
  assert.match(shared, /fetchJson\('\/api\/v1\/config\/status'\)/);
  assert.match(shared, /AI_TEXT: 'ai\.text'/);
  assert.match(shared, /AI_IMAGE: 'ai\.image'/);
  assert.match(shared, /CONTENT_SHEET: 'content\.sheet'/);
  assert.match(shared, /PUBLISH_NAVER: 'publish\.naver'/);
  assert.match(shared, /settings-next-ai-text-form/);
  assert.doesNotMatch(shared, /api_key|API Key|credential/i);
  assert.doesNotMatch(legacyReadiness, /if \(!uiConfigReady && !uiConfigPopupShown\)/);
});

test('all Blog Beta manuscript modes gate only AI image generation actions', () => {
  const view = read('ui/partials/views/blog-next.html');
  const drafts = read('ui/scripts/features/blog-next/draft-inputs.js');
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const service = read('src/ui-api/services/content.service.js');

  assert.match(view, /id="blog-next-ai-image-readiness"/);
  assert.match(drafts, /data-manuscript-image-ai-readiness/);
  assert.match(drafts, /data-manuscript-image-action="generate"/);
  assert.match(drafts, /ensureUiCapabilityReady\('ai\.image'\)/);
  assert.match(drafts, /빈 이미지 .*안전하게 임시 저장/);
  assert.match(execution, /image-mode'\)\?\.value === 'generate'/);
  assert.match(service, /AI_IMAGE_MODEL_REQUIRED/);
  assert.doesNotMatch(drafts, /data-manuscript-image-picker[^\n]*disabled title="AI 이미지 모델/);
});

test('quick-create generation honors the shared AI gate with recovery UI', () => {
  const view = read('ui/partials/views/blog-next.html');
  const flow = read('ui/scripts/features/blog-next/quick-flow-ui.js');
  const navigation = read('ui/scripts/foundation/navigation.js');

  assert.match(view, /id="blog-next-ai-readiness"/);
  assert.match(view, /id="blog-next-ai-settings-btn"/);
  assert.match(flow, /isAiTextBlocked\(\)/);
  assert.match(flow, /syncBlogNextAiReadinessNotice\(\)/);
  assert.match(flow, /goToAiWritingModelSettings\(\)/);
  assert.match(navigation, /refreshUiCapabilityReadiness\(\)/);
  assert.doesNotMatch(flow, /uiAiTextReady === false/);
});

test('Blog Beta gates storage and publishing by their exact capabilities', () => {
  const view = read('ui/partials/views/blog-next.html');
  const draftModes = read('ui/partials/views/blog-next/quick-draft-modes.html');
  const settings = read('ui/partials/views/blog-next/publish-settings.html');
  const flow = read('ui/scripts/features/blog-next/quick-flow-ui.js');
  const queue = read('ui/scripts/features/blog-next/quick-queue.js');
  const execution = read('ui/scripts/features/blog-next/draft-execution.js');
  const shell = read('ui/scripts/features/blog-next/shell.js');

  assert.match(view, /id="blog-next-sheet-readiness"/);
  assert.doesNotMatch(settings, /blog-next-publish-readiness/);
  assert.match(view, /data-blog-next-publish-readiness="ai"/);
  assert.match(draftModes, /data-blog-next-publish-readiness="folder"/);
  assert.match(draftModes, /data-blog-next-publish-readiness="paste"/);
  assert.equal((`${view}\n${draftModes}`.match(/data-blog-next-publish-settings-btn=/g) || []).length, 3);
  assert.match(flow, /isUiCapabilityUnavailable\('content\.sheet'\)/);
  assert.match(flow, /ensureUiCapabilityReady\('content\.sheet'\)/);
  assert.match(queue, /ensureBlogNextTopicStorageReady\(\)/);
  assert.match(execution, /getUiPublishCapability\(settings\.targets\)/);
  assert.match(execution, /ensureUiCapabilityReady\(capability\)/);
  assert.match(shell, /mountBlogNextPublishSettings\(target\);[\s\S]*syncBlogNextDraftExecutionState\(\)/);
});

test('ShoppingConnect stays enterable and exposes inline capability recovery', () => {
  const view = read('ui/partials/views/shopping.html');
  const navigation = read('ui/scripts/foundation/navigation.js');
  const actions = read('ui/scripts/features/legacy-actions-controllers.js');

  assert.doesNotMatch(view, /id="shopping-readiness-panel"/);
  assert.match(view, /id="shopping-sheet-readiness"/);
  assert.match(view, /id="shopping-ai-readiness"/);
  assert.match(view, /id="shopping-publish-readiness"/);
  assert.match(view, /id="shopping-management-readiness"/);
  assert.match(view, /data-shopping-capability-settings="content\.sheet"/);
  const shoppingBlock = navigation.match(/if \(viewName === 'shopping'\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.doesNotMatch(shoppingBlock, /ensureSheetsPreflightUi/);
  assert.match(actions, /ensureUiCapabilityReady\('content\.sheet'\)/);
  assert.match(actions, /getUiPublishCapability\(payload\.targets\)/);
});

test('keyword title recommendation conforms to the shared AI gate', () => {
  const lifecycle = read('ui/scripts/features/discovery/keyword-modal.js');

  assert.match(lifecycle, /refreshAiTextReadiness\(\)/);
  assert.match(lifecycle, /keywordModalState\.aiConfigured === false/);
  assert.match(lifecycle, /keyword-ai-settings-btn/);
});
