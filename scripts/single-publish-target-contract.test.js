const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function assertRadioPair(source, naverId, wordpressId, groupName) {
  assert.match(source, new RegExp(`id="${naverId}"[^>]*name="${groupName}"[^>]*type="radio"`));
  assert.match(source, new RegExp(`id="${wordpressId}"[^>]*name="${groupName}"[^>]*type="radio"`));
}

test('every writing surface presents Naver and WordPress as one exclusive choice', () => {
  const blogNext = read('ui/partials/views/blog-next.html');
  const blogNextDrafts = read('ui/partials/views/blog-next/quick-draft-modes.html');
  const legacyQuick = read('ui/partials/views/blog/quick.html');
  const legacyTopics = read('ui/partials/views/blog/topics.html');
  const legacyAuto = read('ui/partials/views/blog/auto.html');
  const shopping = read('ui/partials/views/shopping.html');
  const overlays = read('ui/partials/overlays.html');

  assertRadioPair(blogNext, 'blog-next-target-naver', 'blog-next-target-wordpress', 'blog-next-publish-target');
  assert.match(blogNextDrafts, /data-draft-field="target-naver" name="blog-next-folder-target" type="radio"/);
  assert.match(blogNextDrafts, /data-draft-field="target-wordpress" name="blog-next-folder-target" type="radio"/);
  assert.match(blogNextDrafts, /data-draft-field="target-naver" name="blog-next-paste-target" type="radio"/);
  assert.match(blogNextDrafts, /data-draft-field="target-wordpress" name="blog-next-paste-target" type="radio"/);
  assertRadioPair(legacyQuick, 'quick-target-naver', 'quick-target-wordpress', 'quick-publish-target');
  assertRadioPair(legacyQuick, 'quick-manuscript-target-naver', 'quick-manuscript-target-wordpress', 'quick-manuscript-target');
  assertRadioPair(legacyQuick, 'quick-pasted-target-naver', 'quick-pasted-target-wordpress', 'quick-pasted-target');
  assertRadioPair(legacyTopics, 'blog-batch-target-naver', 'blog-batch-target-wordpress', 'blog-batch-target');
  assertRadioPair(legacyAuto, 'blog-publish-auto-target-naver', 'blog-publish-auto-target-wordpress', 'blog-auto-target');
  assertRadioPair(shopping, 'shopping-quick-target-naver', 'shopping-quick-target-wordpress', 'shopping-quick-target');
  assertRadioPair(overlays, 'shopping-edit-target-naver', 'shopping-edit-target-wordpress', 'shopping-edit-target');
});

test('single-target UI and API boundaries reject silent multi-platform publishing', () => {
  const draftUi = `${read('ui/scripts/features/blog-next/draft-inputs.js')}\n${read('ui/scripts/features/blog-next/draft-execution.js')}`;
  const topicUi = read('ui/scripts/features/content/blog-topics.js');
  const requestSchema = read('src/internal-api/content-request-schema.js');
  const mcpAdapter = read('src/mcp/prototype-adapter.js');

  assert.match(draftUi, /const targets = \[\]/);
  assert.match(topicUi, /targets\.length !== 1/);
  assert.match(requestSchema, /publish_request\.payload\.platforms\.length !== 1/);
  assert.equal((mcpAdapter.match(/maxItems:\s*1/g) || []).length >= 3, true);
});

test('direct AI writing creates a canonical draft before publishing', () => {
  const html = read('ui/partials/views/blog-next.html');
  const draftUi = `${read('ui/scripts/features/blog-next/draft-inputs.js')}\n${read('ui/scripts/features/blog-next/draft-execution.js')}`;
  const quickQueue = read('ui/scripts/features/blog-next/quick-queue.js');

  assert.match(html, /id="blog-next-publish-now"[^>]*>원고 만들기/);
  assert.match(html, /data-blog-next-draft-preview="ai"/);
  assert.match(html, /data-blog-next-draft-publish="ai"/);
  assert.match(draftUi, /postJson\('\/api\/v1\/blog\/manuscript-drafts\/ai', payload\)/);
  assert.match(draftUi, /renderBlogNextDraftPreview\('ai', preview\)/);
  assert.match(quickQueue, /await generateBlogNextAiDraft\(\)/);
});
