const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Blog Beta shell is isolated from the legacy blog DOM namespace', () => {
    const legacyView = read('ui/partials/views/blog.html');
    const betaView = read('ui/partials/views/blog-next.html');
    const betaScript = read('ui/scripts/features/blog-next/shell.js');

    assert.match(legacyView, /id="view-blog"/);
    assert.match(betaView, /id="view-blog-next"/);
    assert.match(betaView, /data-blog-next-tab="quick"/);
    assert.match(betaView, /data-blog-next-tab="queue"/);
    assert.match(betaView, /data-blog-next-tab="automation"/);
    assert.doesNotMatch(betaView, /\bid="blog-tab-/);
    assert.doesNotMatch(betaScript, /\.blog-tab-btn|\.blog-tab-panel|quick-save-btn|blog-table-body/);
});

test('Blog Beta quick shell preserves all three existing input concepts', () => {
    const betaView = read('ui/partials/views/blog-next.html');

    assert.match(betaView, /data-blog-next-input-mode="ai">바로 생성/);
    assert.match(betaView, /data-blog-next-input-mode="folder">원고 폴더/);
    assert.match(betaView, /data-blog-next-input-mode="paste">원고 붙여넣기/);
    assert.match(betaView, /기존 블로그 기능은 그대로 유지됩니다/);
});

test('Blog Beta shell does not call data, AI, or publishing APIs during Stage 1', () => {
    const betaScript = read('ui/scripts/features/blog-next/shell.js');

    assert.doesNotMatch(betaScript, /fetchJson|postJson|fetch\s*\(|publish|appendGoogleSheet|generate/i);
});

test('Blog Beta Stage 2 exposes AI-free topic capture and the Topics-backed queue', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const quickQueueScript = read('ui/scripts/features/blog-next/quick-queue.js');

    assert.match(betaView, /id="blog-next-save-topic"[^>]*>글감 저장/);
    assert.match(betaView, /id="blog-next-enqueue-topic"[^>]*>발행 대기열에 추가/);
    assert.match(betaView, /id="blog-next-queue-list"/);
    assert.match(quickQueueScript, /\/api\/v1\/continuous-publishing\/topics/);
    assert.match(quickQueueScript, /\/api\/v1\/continuous-publishing\/queue/);
    assert.doesNotMatch(quickQueueScript, /quick-publish|quick-preview|generateContent|publishBlog|reserveQuota/i);
});

test('completed manuscripts publish directly without entering the continuous queue', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const draftInputs = read('ui/scripts/features/blog-next/draft-inputs.js');

    assert.match(betaView, /data-blog-next-draft-publish="folder"/);
    assert.match(betaView, /data-blog-next-draft-publish="paste"/);
    assert.match(betaView, /Queue에 저장하지 않습니다/);
    assert.match(draftInputs, /\/api\/v1\/blog\/local-markdown\/preview/);
    assert.match(draftInputs, /\/api\/v1\/blog\/local-markdown\/publish/);
    assert.doesNotMatch(draftInputs, /continuous-publishing\/(topics|queue|runner)/);
});
