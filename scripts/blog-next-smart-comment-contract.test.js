const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Blog Beta exposes Smart Comment as an isolated tab and panel', () => {
    const view = read('ui/partials/views/blog-next.html');
    const shell = read('ui/scripts/features/blog-next/shell.js');
    const app = read('ui/app.js');

    assert.match(view, /data-blog-next-tab="smart-comment"[^>]*>스마트 댓글</);
    assert.match(view, /id="blog-next-panel-smart-comment"/);
    assert.match(view, /id="blog-next-smart-comment-fetch-limit"/);
    assert.match(view, /<option value="3">3개 · 권장<\/option>/);
    assert.doesNotMatch(view, /id="blog-next-smart-comment-tone"/);
    assert.match(view, /후보 글마다 공감형·친근형·담백형 초안을 하나씩 만듭니다/);
    assert.match(view, /id="blog-next-smart-comment-status"[^>]*role="status"/);
    assert.match(view, /id="blog-next-smart-comment-list"[^>]*aria-live="polite"/);
    assert.doesNotMatch(view, /id="blog-next-smart-comment-headless"/);
    assert.match(view, /id="blog-next-smart-comment-diagnostic" hidden/);
    assert.match(view, /class="blog-next-empty-state blog-next-smart-comment-empty ui-empty-state"/);
    assert.doesNotMatch(view, /id="blog-next-smart-comment-model-role"/);
    assert.match(view, /aria-describedby="blog-next-smart-comment-settings-summary"/);
    assert.match(view, /설정 저장[\s\S]*댓글 초안 만들기/);
    assert.match(shell, /'smart-comment'/);
    assert.match(shell, /confirmDiscardUnsavedBlogNextSmartCommentSettings/);
    assert.match(app, /@include scripts\/features\/blog-next\/smart-comment\.js/);
});

test('Smart Comment keeps results on failures and presents friendly progress states', () => {
    const script = read('ui/scripts/features/blog-next/smart-comment.js');

    assert.match(script, /blogNextSmartCommentEnvironment === 'production'/);
    assert.match(script, /AI 사용 한도 대기 중/);
    assert.match(script, /일부 댓글 준비 완료/);
    assert.match(script, /완성된 댓글은 그대로 사용할 수 있습니다/);
    assert.match(script, /기존 댓글은 그대로 유지했습니다/);
    assert.match(script, /excludePostUrls:\s*Array\.from\(blogNextSmartCommentSeenPostUrls\)/);
    assert.match(script, /const originalPostUrl = safeBlogNextSmartCommentUrl\(item\.postUrl\)/);
    assert.match(script, /class="blog-next-smart-comment-title-link"[\s\S]{0,260}네이버 원문 새 창에서 보기/);
    assert.match(script, /const commentUrl = safeBlogNextSmartCommentUrl\(item\.commentUrl \|\| item\.postUrl\)/);
    assert.match(script, /네이버에서 댓글 쓰기/);
    assert.match(script, /이 글의 댓글 다시 만들기/);
    assert.match(script, /BLOG_NEXT_SMART_COMMENT_TONE_LABELS/);
    assert.match(script, /blog-next-smart-comment-tone/);
    assert.match(script, /<p title="\$\{escapeHtml\(normalizedDraft\.text\)\}">/);
    assert.match(script, /blog-next-smart-comment-drafts">\$\{draftRows\}<\/div>[\s\S]{0,420}\$\{postAction\}/);
    assert.doesNotMatch(script, /blog-next-smart-comment-draft-actions">[\s\S]{0,220}\$\{postAction\}/);
    const styles = read('ui/styles/features/blog-next-smart-comment.css');
    assert.match(styles, /grid-template-columns:\s*64px minmax\(0, 1fr\) auto/);
    assert.match(styles, /-webkit-line-clamp:\s*2/);
    assert.match(styles, /\.blog-next-smart-comment-title-link:focus-visible/);
    assert.match(styles, /\.blog-next-smart-comment-status-copy strong\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\)/);
    assert.match(styles, /\.blog-next-smart-comment-card-copy span\s*\{[^}]*font-size:\s*var\(--ui-type-caption-size\)/);
    assert.match(styles, /\.blog-next-smart-comment-heading span\s*\{[^}]*font-weight:\s*var\(--ui-weight-bold\)/);
    assert.match(styles, /\.blog-next-smart-comment-details summary\s*\{[^}]*font-weight:\s*var\(--ui-weight-bold\)/);
    assert.match(styles, /\.blog-next-smart-comment-post-action\s*\{[^}]*font-weight:\s*var\(--ui-weight-bold\)/);
    assert.match(styles, /\.blog-next-smart-comment-tone\s*\{[^}]*font-weight:\s*var\(--ui-weight-bold\)/);
    assert.doesNotMatch(script, /blogNextSmartCommentItems = \[\];[\s\S]{0,220}catch/);
    assert.match(script, /function isBlogNextSmartCommentOperationBusy\(\)/);
    assert.match(script, /saveButton\.setAttribute\('aria-busy', blogNextSmartCommentSaving \? 'true' : 'false'\)/);
    assert.match(script, /form\?\.setAttribute\('aria-busy', disabled \? 'true' : 'false'\)/);
    assert.match(script, /card\.setAttribute\('aria-busy', active \? 'true' : 'false'\)/);
    assert.match(script, /finally \{\s*blogNextSmartCommentRedraftingIndex = null;[\s\S]*setBlogNextSmartCommentRedraftActionsBusy\(false\);/);
});

test('Smart Comment backend defaults to three candidates and rejects overlapping runs', () => {
    const service = read('src/ui-api/services/content.service.js');

    assert.match(service, /fetchLimit:\s*3,/);
    assert.match(service, /NAVER_COMMENT_DRAFT_BUSY/);
    assert.match(service, /RUNTIME_ENVIRONMENT/);
});
