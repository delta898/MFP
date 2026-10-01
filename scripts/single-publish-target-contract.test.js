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
  const blogNextPublishSettings = read('ui/partials/views/blog-next/publish-settings.html');
  const shopping = read('ui/partials/views/shopping.html');
  const overlays = read('ui/partials/overlays.html');

  assertRadioPair(blogNextPublishSettings, 'blog-next-target-naver', 'blog-next-target-wordpress', 'blog-next-publish-target');
  assert.equal((blogNext.match(/@include blog-next\/publish-settings\.html/g) || []).length, 1);
  assert.equal((blogNextDrafts.match(/data-blog-next-publish-settings-slot="(?:folder|paste)"/g) || []).length, 2);
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
  const quickQueue = `${read('ui/scripts/features/blog-next/quick-queue.js')}\n${read('ui/scripts/features/blog-next/queue-management.js')}`;

  assert.match(html, /id="blog-next-publish-now"[^>]*>원고 만들기/);
  assert.match(html, /data-blog-next-draft-preview="ai"/);
  assert.match(html, /data-blog-next-draft-publish="ai"/);
  assert.match(draftUi, /postJson\('\/api\/v1\/blog\/manuscript-drafts\/ai\/operations', payload\)/);
  assert.match(draftUi, /renderBlogNextDraftPreview\('ai', preview\)/);
  assert.match(quickQueue, /\['blog-next-publish-now', 'blog-next-regenerate-draft'\][\s\S]*generateBlogNextAiDraft\(id === 'blog-next-regenerate-draft' \? 'regenerate' : 'create'\)/);
});

test('unconfigured platform hints route to the publish channel tab', () => {
  const readiness = read('ui/scripts/foundation/readiness.js');

  assert.match(readiness, /hint\.title = `\$\{platform === 'naver' \? '네이버' : '워드프레스'\} 설정이 필요합니다\. 클릭하여 \[설정 > 기본 연결 > 블로그 발행 채널\]로 이동합니다\.`/);
  assert.match(readiness, /goToUiCapabilitySettings\(platform === 'naver' \? 'publish\.naver' : 'publish\.wordpress'\)/);
  assert.doesNotMatch(readiness, /설정 > 블로그\] 탭으로 이동합니다/);
});
