const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

test('Card News is a top-level source-preview workflow', () => {
    const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
    const navigation = fs.readFileSync(path.join(uiRoot, 'scripts/foundation/navigation.js'), 'utf8');
    const script = fs.readFileSync(path.join(uiRoot, 'scripts/features/card-news/source-preview.js'), 'utf8');

    assert.match(html, /data-view="card-news"[\s\S]*?<span class="nav-label">카드뉴스<sup class="nav-new-badge"/);
    assert.match(html, /id="view-card-news"/);
    assert.match(html, /data-card-news-source-kind="feed_item"[^>]*>내 블로그 글/);
    assert.match(html, /data-card-news-source-kind="url"[^>]*>URL 직접 입력/);
    assert.match(html, /data-card-news-source-kind="manuscript"[^>]*>내용 직접 입력/);
    assert.match(html, /id="card-news-source-actions"[^>]*hidden/);
    assert.match(html, /id="card-news-preview-button"[^>]*>내용 확인</);
    assert.match(html, /class="card-news-preview-card" aria-label="선택한 내용"/);
    assert.match(html, /class="card-news-preview-surface">[\s\S]*id="card-news-preview-badge"[\s\S]*id="card-news-preview-content"/);
    assert.match(html, /class="card-news-preview-meta">[\s\S]*id="card-news-preview-link"[\s\S]*id="card-news-preview-time"/);
    assert.doesNotMatch(html, /<span class="card-news-eyebrow">확인<\/span>/);
    assert.doesNotMatch(html, /플랫폼을 선택해 공개된 글을 확인하세요/);
    assert.match(html, /id="card-news-platform-tabs"[^>]*hidden/);
    assert.match(html, /id="card-news-source-refresh"[^>]*aria-label="블로그 글 새로고침"/);
    assert.doesNotMatch(html, /id="card-news-create-project"/);
    assert.doesNotMatch(html, /id="card-news-project-list"/);
    assert.match(navigation, /viewName === 'card-news'[\s\S]*initCardNewsView\(\)/);
    assert.match(script, /\/api\/v1\/card-news\/sources/);
    assert.match(script, /\/api\/v1\/card-news\/source-preview/);
    assert.doesNotMatch(script, /\/api\/v1\/card-news\/projects/);
    assert.match(html, /id="card-news-generation-panel"[^>]*hidden/);
    assert.match(html, /id="card-news-slide-count"/);
    assert.match(html, /id="card-news-aspect-ratio"/);
    assert.match(html, /id="card-news-style"/);
    assert.match(html, /id="card-news-include-korean-text"/);
    assert.match(html, /id="card-news-compose-button"[^>]*>카드 구성만 만들기</);
    assert.match(html, /id="card-news-generate-button"[^>]*>이미지까지 만들기</);
    assert.match(html, /id="card-news-result-panel"[^>]*hidden/);
    assert.match(script, /\/api\/v1\/card-news\/generations/);
    assert.match(script, /image_mode: imageMode/);
    assert.match(script, /data-card-news-prompt-copy/);
    assert.match(script, /navigator\.clipboard\.writeText\(prompt\)/);
    assert.match(script, /card-news-result-image-empty/);
    assert.match(html, /id="card-news-regenerate"[^>]*>구성 다시 만들기</);
    assert.match(script, /구성을 다시 만들면 현재 이미지가 초기화됩니다\. 계속할까요\?/);
    assert.match(script, /generateCardNews\(\{ imageMode: 'prompt_only' \}\)/);
    assert.match(html, /id="card-news-bulk-image-action"[^>]*>이미지 모두 만들기</);
    assert.match(script, /빈 이미지 모두 만들기/);
    assert.match(script, /이미지 모두 다시 만들기/);
    assert.match(script, /data-card-news-image-action/);
    assert.match(script, /이미지 생성 기능은 다음 단계에서 연결할 예정입니다/);
    assert.doesNotMatch(script, /sameVariation/);
    assert.match(script, /const sources = cardNewsViewState\.configuredSources;[\s\S]*sources\.length < 2/);
    assert.match(script, /CARD_NEWS_PLATFORM_STORAGE_KEY/);
    assert.match(script, /void previewCardNewsSource\(cardNewsViewState\.articles\[cardNewsViewState\.selectedArticleIndex\]\)/);
    assert.match(script, /previewCache: new Map\(\)/);
    assert.match(script, /requestId !== cardNewsViewState\.previewRequestId/);
    assert.doesNotMatch(script, /setCardNewsStatus\('내용을 확인했습니다\.'/);
});

test('Card News preview uses fetched page text for a fuller, non-RSS preview', () => {
    const sourceService = fs.readFileSync(path.join(repoRoot, 'src/card-news/source-service.js'), 'utf8');
    assert.match(sourceService, /document\?\.text \|\| document\?\.excerpt \|\| source\.preview_text/);
    assert.match(sourceService, /CARD_NEWS_PREVIEW_TEXT_LIMIT = 1400/);
    assert.match(sourceService, /(?:더 읽기\|read more)/);
});

test('Card News source and preview cards keep equal desktop height', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    assert.match(css, /\.card-news-layout\s*\{[^}]*align-items:\s*stretch/);
    assert.doesNotMatch(css, /\.card-news-source-panel\s*\{[^}]*min-height/);
    assert.match(css, /\.card-news-source-card,[\s\S]*?\.card-news-preview-card\s*\{[^}]*min-height:\s*560px/);
    assert.match(css, /\.card-news-preview-surface\s*\{[^}]*flex:\s*1[^}]*min-height:\s*532px/);
    assert.match(css, /\.card-news-preview-meta\s*\{[^}]*margin-top:\s*auto/);
});

test('Card News view claims its parent width on the first layout pass', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    assert.match(css, /#view-card-news\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/);
});

test('Card News empty and confirmed source states are mutually exclusive', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    assert.match(css, /\.card-news-preview-empty\[hidden\],[\s\S]*?\.card-news-preview-content\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/);
});

test('Card News preserves the last valid preview when a later request fails', () => {
    const script = fs.readFileSync(path.join(uiRoot, 'scripts/features/card-news/source-preview.js'), 'utf8');
    assert.match(script, /cardNewsViewState\.preview = snapshot/);
    assert.match(script, /if \(cardNewsViewState\.preview\)[\s\S]*이전 미리보기/);
    assert.doesNotMatch(script, /catch \(error\)[\s\S]{0,220}cardNewsViewState\.preview = null/);
});

test('Card News preserves the last valid generated set when a later request fails', () => {
    const script = fs.readFileSync(path.join(uiRoot, 'scripts/features/card-news/source-preview.js'), 'utf8');
    assert.match(script, /cardNewsViewState\.generation = generation/);
    assert.doesNotMatch(script, /catch \(error\)[\s\S]{0,260}cardNewsViewState\.generation = null/);
});
