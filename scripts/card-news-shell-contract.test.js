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
    const script = [
        'scripts/features/card-news/source-preview.js',
        'scripts/features/card-news/management.js',
        'scripts/features/card-news/source-manager.js'
    ].map((file) => fs.readFileSync(path.join(uiRoot, file), 'utf8')).join('\n');
    const httpServerRuntime = fs.readFileSync(path.join(repoRoot, 'src/ui-runtime/http-server-runtime.js'), 'utf8');

    assert.match(html, /data-view="card-news"[\s\S]*?<span class="nav-label">카드뉴스<sup class="nav-new-badge"/);
    assert.match(html, /id="view-card-news"/);
    assert.doesNotMatch(html, /id="view-card-news"[^>]*data-style-scope/);
    assert.doesNotMatch(html, /card-news-stage-badge|준비 단계/);
    assert.match(html, /class="card-news-workspace-tabs ui-segmented-tabs"/);
    assert.match(html, /class="ui-segmented-tab active"[^>]*id="card-news-workspace-tab-create"[^>]*aria-controls="card-news-create-workspace"[^>]*tabindex="0"/);
    assert.match(html, /id="card-news-workspace-tab-managed"[^>]*aria-controls="card-news-managed-workspace"[^>]*tabindex="-1"/);
    assert.match(html, /data-card-news-source-kind="feed_item"[^>]*>피드에서 선택/);
    assert.match(html, /data-card-news-source-kind="url"[^>]*>URL 직접 입력/);
    assert.match(html, /data-card-news-source-kind="manuscript"[^>]*>내용 직접 입력/);
    assert.match(html, /id="card-news-source-actions"[^>]*hidden/);
    assert.match(html, /id="card-news-preview-button"[^>]*>내용 확인</);
    assert.match(html, /class="card-news-preview-card ui-workflow-card" aria-label="선택한 내용"/);
    assert.match(html, /class="card-news-preview-surface">[\s\S]*id="card-news-preview-badge"[\s\S]*id="card-news-preview-content"/);
    assert.match(html, /class="card-news-preview-meta">[\s\S]*id="card-news-preview-link"[\s\S]*id="card-news-preview-time"/);
    assert.doesNotMatch(html, /<span class="card-news-eyebrow">확인<\/span>/);
    assert.doesNotMatch(html, /플랫폼을 선택해 공개된 글을 확인하세요/);
    assert.match(html, /id="card-news-platform-tabs"[^>]*hidden/);
    assert.match(html, /id="card-news-source-refresh" class="ui-refresh-action-icon"[^>]*aria-label="피드 새로고침"/);
    assert.match(html, /data-card-news-workspace="create">새 카드뉴스/);
    assert.match(html, /data-card-news-workspace="managed">만든 카드뉴스/);
    assert.doesNotMatch(html, /card-news-include-published|card-news-published-toggle/);
    assert.doesNotMatch(script, /includePublished|card-news-include-published/);
    assert.match(script, /발행한 카드뉴스는 만든 카드뉴스에서 확인할 수 있습니다/);
    assert.match(html, /data-card-news-managed-filter="발행 완료"/);
    assert.match(html, /id="card-news-zip-select"[^>]*>ZIP 가져오기</);
    assert.match(html, /id="card-news-zip-file"[^>]*accept="\.zip/);
    assert.match(html, /id="card-news-zip-panel"[^>]*hidden/);
    assert.match(script, /\/api\/v1\/card-news\/zip\/preview/);
    assert.match(script, /\/api\/v1\/card-news\/zip\/import/);
    assert.match(script, /image_mode === 'imported'/);
    assert.match(script, /\/api\/v1\/card-news\/managed/);
    assert.match(script, /\/api\/v1\/card-news\/generations\/\$\{encodeURIComponent\(generationId\)\}/);
    assert.match(script, /로컬 결과 없음/);
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
    assert.match(html, /id="card-news-additional-request"[^>]*maxlength="500"/);
    assert.match(script, /additional_request: document\.getElementById\('card-news-additional-request'\)/);
    assert.match(html, /id="card-news-compose-button"[^>]*>카드 구성만 만들기</);
    assert.match(html, /id="card-news-generate-button"[^>]*>이미지까지 만들기</);
    assert.match(script, /compose\?\.classList\.toggle\('is-loading', generating && imageMode === 'prompt_only'\)/);
    assert.match(script, /status\.setAttribute\('aria-busy', String\(state === 'loading'\)\)/);
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
    assert.match(script, /\/api\/v1\/card-news\/images\/generate/);
    assert.match(script, /data-card-news-local-image/);
    assert.match(script, /\/api\/v1\/card-news\/images\/import/);
    assert.match(html, /id="card-news-export-all"[^>]*>전체 이미지 받기</);
    assert.match(script, /\/api\/v1\/card-news\/exports\/\$\{encodeURIComponent\(generation\.id\)\}\.zip/);
    assert.match(html, /id="card-news-publish-open"[^>]*hidden>SNS 발행</);
    assert.match(html, /id="card-news-publishing-title">SNS 발행</);
    assert.match(html, /id="card-news-publishing-panel"[^>]*hidden/);
    assert.match(script, /\/api\/v1\/card-news\/publishing\/config\?generation_id=/);
    assert.match(script, /\/api\/v1\/card-news\/publishing\/publish/);
    assert.match(script, /카드 이미지를 Buffer에 전달하려면 설정에서 Google 계정을 연결/);
    assert.doesNotMatch(script, /카드 이미지를 Buffer에 전달하려면[^\n]*WordPress/);
    assert.match(html, /class="card-news-drive-notice"[^>]*>[^<]*Google Drive[^<]*공개 링크[^<]*자동 삭제/);
    assert.match(script, /완성된 카드 \$\{generation\.cards\?\.length \|\| 0\}장을 선택한/);
    assert.match(script, /config\.default_text/);
    assert.match(script, /outcome === 'completed'[\s\S]*?'발행 완료'/);
    assert.match(script, /outcome === 'partial' \? '실패 채널 다시 시도'/);
    assert.match(script, /button\?\.classList\.toggle\('is-loading', publishing\)/);
    assert.match(script, /button\?\.setAttribute\('aria-busy', String\(publishing\)\)/);
    assert.match(script, /data-card-news-image-working/);
    assert.match(script, /새 이미지 만드는 중…/);
    assert.match(script, /#card-news-regenerate, #card-news-bulk-image-action, \[data-card-news-image-action\], \[data-card-news-local-image\]/);
    assert.match(script, /card-news-result-panel'\)\?\.setAttribute\('aria-busy', String\(working\)\)/);
    assert.match(script, /rememberCardNewsScrollPosition/);
    assert.match(navigation, /currentViewName === 'card-news'[\s\S]*rememberCardNewsScrollPosition/);
    assert.match(navigation, /viewName === 'card-news'[\s\S]*restoreCardNewsScrollPosition/);
    assert.match(httpServerRuntime, /pathname === '\/api\/v1\/card-news\/images\/import'[\s\S]{0,180}15 \* 1024 \* 1024/);
    assert.match(httpServerRuntime, /pathname === '\/api\/v1\/card-news\/zip\/preview'[\s\S]{0,180}55 \* 1024 \* 1024/);
    assert.doesNotMatch(script, /이미지 생성 기능은 다음 단계에서 연결할 예정입니다/);
    assert.doesNotMatch(script, /sameVariation/);
    assert.match(script, /const sources = cardNewsViewState\.configuredSources;[\s\S]*sources\.length < 2/);
    assert.match(script, /CARD_NEWS_PLATFORM_STORAGE_KEY/);
    assert.match(script, /selector: '\[data-card-news-workspace\]'[\s\S]*handleUiTabNavigationKeydown|handleUiTabNavigationKeydown[\s\S]*selector: '\[data-card-news-workspace\]'/);
    assert.match(script, /selector: '\[data-card-news-managed-filter\]'[\s\S]*handleUiTabNavigationKeydown|handleUiTabNavigationKeydown[\s\S]*selector: '\[data-card-news-managed-filter\]'/);
    assert.match(script, /selector: '\[data-card-news-source-kind\]'[\s\S]*handleUiTabNavigationKeydown|handleUiTabNavigationKeydown[\s\S]*selector: '\[data-card-news-source-kind\]'/);
    assert.match(script, /void previewCardNewsSource\(cardNewsViewState\.articles\[cardNewsViewState\.selectedArticleIndex\]\)/);
    assert.match(script, /previewCache: new Map\(\)/);
    assert.match(script, /requestId !== cardNewsViewState\.previewRequestId/);
    assert.doesNotMatch(script, /setCardNewsStatus\('내용을 확인했습니다\.'/);
});

test('Card News owns a focused source manager without coupling source changes to generation', () => {
    const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
    const cardNewsHtml = fs.readFileSync(path.join(uiRoot, 'partials/views/card-news.html'), 'utf8');
    const app = fs.readFileSync(path.join(uiRoot, 'app.js'), 'utf8');
    const cardNewsScript = fs.readFileSync(path.join(uiRoot, 'scripts/features/card-news/source-preview.js'), 'utf8');
    const sourceManager = fs.readFileSync(path.join(uiRoot, 'scripts/features/card-news/source-manager.js'), 'utf8');

    assert.match(html, /id="card-news-source-manage"[^>]*>소스 관리</);
    assert.match(html, /id="card-news-source-manager"[^>]*aria-labelledby="card-news-source-manager-title"/);
    assert.doesNotMatch(cardNewsHtml, /id="card-news-source-manager-close"/);
    assert.match(html, /id="card-news-source-manager-cancel"[^>]*>취소<\/button>/);
    assert.match(html, /data-card-news-builtin-source[^>]*> 네이버/);
    assert.match(html, /data-card-news-builtin-source[^>]*> WordPress/);
    assert.match(html, /id="card-news-source-add"[^>]*>RSS 추가</);
    assert.match(html, /HTTPS RSS를 최대 3개까지 추가/);
    assert.match(app, /card-news\/source-manager\.js/);
    assert.match(sourceManager, /CARD_NEWS_CUSTOM_SOURCE_LIMIT = 3/);
    assert.match(sourceManager, /\/api\/v1\/settings\/card-news-sources/);
    assert.match(sourceManager, /markCardNewsSourcesStale\(\)[\s\S]*loadCardNewsSources\(\)/);
    assert.match(sourceManager, /class="ui-icon-action ui-danger-icon-action"[^>]*data-card-news-source-remove[^>]*aria-label="RSS 삭제"[^>]*title="RSS 삭제"/);
    assert.doesNotMatch(sourceManager, /card-news\/(?:generations|publishing)|generateCardNews|publishCardNews/);
    assert.match(cardNewsScript, /sourcesStale:\s*true/);
    assert.match(cardNewsScript, /function markCardNewsSourcesStale/);
    assert.match(cardNewsScript, /cardNewsViewState\.sourcesStale[\s\S]*loadCardNewsSources/);
});

test('Card News preview uses fetched page text for a fuller, non-RSS preview', () => {
    const sourceService = fs.readFileSync(path.join(repoRoot, 'src/card-news/source-service.js'), 'utf8');
    assert.match(sourceService, /document\?\.text \|\| document\?\.excerpt \|\| source\.preview_text/);
    assert.match(sourceService, /CARD_NEWS_PREVIEW_TEXT_LIMIT = 1400/);
    assert.match(sourceService, /(?:더 읽기\|read more)/);
});

test('Card News source and preview cards stretch together without fixed legacy heights', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    const sourcePreviewCss = css.split('.card-news-generation-panel')[0];
    assert.match(css, /\.card-news-layout\s*\{[^}]*align-items:\s*stretch/);
    assert.doesNotMatch(css, /\.card-news-source-panel\s*\{[^}]*min-height/);
    assert.doesNotMatch(css, /min-height:\s*(?:532|560)px/);
    assert.match(css, /\.card-news-preview-surface\s*\{[^}]*flex:\s*1[^}]*min-height:\s*100%/);
    assert.match(css, /\.card-news-preview-meta\s*\{[^}]*margin-top:\s*auto/);
    assert.doesNotMatch(sourcePreviewCss, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

test('Card News source manager is viewport-centered with bounded overflow', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    assert.match(css, /\.card-news-source-manager\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*margin:\s*auto/);
    assert.match(css, /\.card-news-source-manager\s*\{[^}]*max-height:\s*calc\(100vh/);
    assert.match(css, /\.card-news-source-manager\s*\{[^}]*overflow:\s*auto/);
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
