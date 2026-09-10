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
        'scripts/features/card-news/publishing.js',
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
    assert.match(html, /<dialog id="card-news-zip-dialog" class="card-news-zip-dialog ui-transaction-dialog"[^>]*aria-labelledby="card-news-zip-title"/);
    assert.match(html, /id="card-news-zip-form" class="card-news-zip-form ui-transaction-dialog-form" method="dialog"/);
    assert.match(html, /class="card-news-zip-panel-heading ui-transaction-dialog-header"[\s\S]*?<h2 id="card-news-zip-title">ZIP 카드뉴스 가져오기<\/h2>/);
    assert.match(html, /class="card-news-zip-actions ui-transaction-dialog-footer"[\s\S]*?class="ui-transaction-dialog-footer-actions"[\s\S]*?id="card-news-zip-cancel"[\s\S]*?id="card-news-zip-import"/);
    assert.doesNotMatch(html, /id="card-news-zip-close"|id="card-news-zip-panel"/);
    assert.match(script, /\/api\/v1\/card-news\/zip\/preview/);
    assert.match(script, /\/api\/v1\/card-news\/zip\/import/);
    assert.match(script, /typeof dialog\.showModal === 'function'\) dialog\.showModal\(\)/);
    assert.match(script, /card-news-zip-dialog'\)\?\.addEventListener\('cancel'/);
    assert.match(script, /card-news-zip-form'\)\?\.addEventListener\('submit'[\s\S]*?event\.preventDefault\(\)[\s\S]*?importCardNewsZip/);
    assert.match(script, /if \(dialog\?\.open\) dialog\.close\(\)/);
    assert.match(script, /showUiToast\(\{ level: 'error', title: 'ZIP 확인 실패'/);
    assert.match(script, /image_mode === 'imported'/);
    assert.match(script, /\/api\/v1\/card-news\/managed/);
    assert.match(script, /\/api\/v1\/card-news\/generations\/\$\{encodeURIComponent\(generationId\)\}/);
    assert.match(script, /showManagedCardNewsGeneration\(result\)/);
    assert.match(script, /function moveCardNewsSharedWorkflow\(workspace\)/);
    assert.match(script, /cardNewsViewState\.createWorkflowContext = captureCardNewsWorkflowContext\(\)/);
    assert.match(script, /cardNewsViewState\.managedWorkflowContext = captureCardNewsWorkflowContext\(\)/);
    assert.doesNotMatch(script, /restoreCardNewsSourceSnapshot/);
    assert.doesNotMatch(script, /구성 있음/);
    assert.match(script, /const article = cardNewsViewState\.articles\[cardNewsViewState\.selectedArticleIndex\][\s\S]*void previewCardNewsSource\(article\)/);
    assert.match(script, /card-news-entry-status[^\n]*ui-status-badge/);
    assert.match(script, /card-news-managed-status ui-status-badge/);
    assert.match(script, /로컬 결과 없음/);
    assert.match(script, /class="card-news-managed-item card-news-entry-item[^"]*"[\s\S]*role="button"[\s\S]*aria-pressed=/);
    assert.match(script, /item\.addEventListener\('click',[\s\S]*openManagedCardNewsGeneration/);
    assert.doesNotMatch(script, /card-news-managed-actions|cardNewsManagedActionLabel/);
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
    assert.match(html, /class="card-news-generation-field-grid ui-workflow-field-grid"[\s\S]*id="card-news-slide-count"[\s\S]*id="card-news-aspect-ratio"[\s\S]*id="card-news-style"/);
    assert.match(html, /class="card-news-generation-detail-grid ui-workflow-detail-grid"[\s\S]*id="card-news-additional-request"[\s\S]*class="card-news-text-option ui-inline-choice"[\s\S]*id="card-news-include-korean-text"/);
    assert.match(html, /필요한 것만 고르세요\. 글쓰기 AI가 카드 구성을 만들고 이미지 AI가 각 카드를 제작합니다\./);
    assert.doesNotMatch(html, /card-news-model-role-note|ui-workflow-role-note|aria-label="사용 AI 역할"/);
    assert.match(html, /id="card-news-generation-status" class="ui-workflow-feedback" role="status" aria-live="polite" hidden/);
    assert.match(script, /additional_request: document\.getElementById\('card-news-additional-request'\)/);
    assert.match(html, /id="card-news-compose-button"[^>]*>카드 구성만 만들기</);
    assert.match(html, /id="card-news-generate-button"[^>]*>이미지까지 만들기</);
    assert.match(script, /compose\?\.classList\.toggle\('is-loading', generating && imageMode === 'prompt_only'\)/);
    assert.match(script, /status\.setAttribute\('aria-busy', String\(state === 'loading'\)\)/);
    assert.match(script, /#card-news-generation-panel select, #card-news-generation-panel textarea, #card-news-generation-panel input/);
    assert.match(script, /설정이 변경되었습니다\. 다시 만들면 새 설정이 적용됩니다\./);
    assert.match(script, /card-news-additional-request'\)\?\.addEventListener\('input', handleCardNewsGenerationSettingChange\)/);
    assert.match(html, /id="card-news-result-panel"[^>]*hidden/);
    assert.match(html, /class="card-news-eyebrow ui-workflow-eyebrow">카드 작업</);
    assert.match(html, /class="card-news-result-heading ui-workflow-heading">[\s\S]*?<\/div>\s*<div class="card-news-result-actions">/);
    assert.match(script, /\/api\/v1\/card-news\/generations/);
    assert.match(script, /image_mode: imageMode/);
    assert.match(script, /project_id: cardNewsViewState\.projectId \|\| ''/);
    assert.match(html, /id="card-news-create-workflow-slot"[\s\S]*id="card-news-shared-workflow"/);
    assert.match(html, /id="card-news-managed-source" class="card-news-preview-card ui-workflow-card"[\s\S]*id="card-news-managed-workflow-slot"/);
    assert.match(html, /id="card-news-managed-source-links" class="card-news-managed-source-links"/);
    assert.doesNotMatch(script, /class="card-news-managed-links"/);
    assert.match(html, /id="card-news-feed-list" class="card-news-feed-list card-news-entry-list"/);
    assert.match(html, /id="card-news-managed-list" class="card-news-managed-list card-news-entry-list"/);
    assert.equal((html.match(/card-news-panel-toolbar card-news-entry-toolbar/g) || []).length, 2);
    assert.match(html, /id="card-news-managed-workspace"[\s\S]*class="card-news-layout"[\s\S]*class="card-news-managed-list-card card-news-source-card ui-workflow-card"/);
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
    assert.match(script, /data-card-news-local-picker/);
    assert.match(script, /이미지 교체/);
    assert.doesNotMatch(script, /card-news-local-image-trigger/);
    assert.match(script, /\/api\/v1\/card-news\/images\/generate/);
    assert.match(script, /data-card-news-local-image/);
    assert.match(script, /\/api\/v1\/card-news\/images\/import/);
    assert.match(html, /id="card-news-export-all"[^>]*>전체 이미지 받기</);
    assert.match(script, /\/api\/v1\/card-news\/exports\/\$\{encodeURIComponent\(generation\.id\)\}\.zip/);
    assert.match(html, /id="card-news-publish-open"[^>]*hidden>SNS 발행</);
    assert.match(html, /id="card-news-publishing-readiness"[^>]*role="status"[^>]*hidden/);
    assert.match(html, /id="card-news-publishing-panel" class="card-news-publishing-panel ui-workflow-card"[^>]*aria-labelledby="card-news-publishing-title"[^>]*hidden/);
    assert.match(html, /id="card-news-publishing-form" class="card-news-publishing-form"/);
    assert.match(html, />3단계 · 선택</);
    assert.match(html, /id="card-news-publishing-title">SNS에 발행</);
    assert.match(html, /href="https:\/\/m\.blog\.naver\.com\/amadejjs\/223940980574"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(html, /class="card-news-publishing-channel-group ui-selectable-card-group"[\s\S]*id="card-news-publishing-channels" class="card-news-publishing-channels ui-selectable-card-grid"/);
    assert.match(html, /class="card-news-publishing-actions ui-action-row"/);
    assert.doesNotMatch(html, /id="card-news-publishing-close"|id="card-news-buffer-settings"|id="card-news-google-settings"/);
    assert.match(script, /\/api\/v1\/card-news\/publishing\/config\?generation_id=/);
    assert.match(script, /\/api\/v1\/card-news\/publishing\/publish/);
    assert.match(script, /설정 Beta > 기본 연결 > 콘텐츠 공간에서 Google 계정을 먼저 연결/);
    assert.match(script, /설정 Beta > 부가 서비스 > SNS 배포에서 Buffer 연결을 먼저 완료/);
    assert.doesNotMatch(script, /카드 이미지를 Buffer에 전달하려면[^\n]*WordPress/);
    assert.match(html, /class="card-news-drive-notice"[^>]*>[^<]*Google Drive[^<]*자동 삭제/);
    assert.doesNotMatch(html + script, /Bitly로 단축|원문 링크는 발행할 때/);
    assert.match(script, /publishingConfig\?\.max_channels/);
    assert.match(script, /void openCardNewsPublishing\(\{ scroll: false \}\)/);
    assert.match(script, /panel\.hidden = false/);
    assert.doesNotMatch(script, /panel\.showModal\(\)|openCardNewsPublishingSetting|closeCardNewsPublishing/);
    assert.match(script, /완성된 카드 \$\{generation\.cards\?\.length \|\| 0\}장을 선택한/);
    assert.match(script, /config\.default_text/);
    assert.match(script, /outcome === 'completed'[\s\S]*?'발행 완료'/);
    assert.match(script, /outcome === 'partial' \? '실패 채널 다시 시도'/);
    assert.match(script, /button\?\.classList\.toggle\('is-loading', publishing\)/);
    assert.match(script, /button\?\.setAttribute\('aria-busy', String\(publishing\)\)/);
    assert.match(script, /data-card-news-image-working/);
    assert.match(script, /새 이미지 만드는 중…/);
    assert.match(script, /function setCardNewsResultControlsDisabled\(disabled\)/);
    assert.match(script, /#card-news-regenerate, #card-news-bulk-image-action, #card-news-publish-open, \[data-card-news-image-action\], \[data-card-news-local-picker\], \[data-card-news-local-image\]/);
    assert.match(script, /exportAll\?\.classList\.toggle\('is-disabled', disabled\)/);
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
    assert.match(css, /\.card-news-entry-item\s*\{[^}]*height:\s*76px[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*grid-template-areas:[^}]*"title status date"[^}]*"summary summary summary"/s);
    assert.match(css, /\.card-news-entry-item\s*\{[^}]*font:\s*inherit/);
    assert.match(css, /\.card-news-entry-status\s*\{[^}]*grid-area:\s*status/);
    assert.match(css, /\.card-news-entry-title strong\s*\{[^}]*var\(--ui-type-body-size\)[^}]*var\(--ui-weight-bold\)[^}]*var\(--ui-line-height-tight\)/s);
    assert.match(css, /\.card-news-entry-date\s*\{[^}]*var\(--ui-type-caption-size\)[^}]*var\(--ui-weight-regular\)/s);
    assert.doesNotMatch(sourcePreviewCss, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

test('Card News states use shared semantic badge tokens', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/patterns/overview-card.css'), 'utf8');
    const status = fs.readFileSync(path.join(repoRoot, 'src/card-news/management-status.js'), 'utf8');
    assert.match(css, /\.ui-status-badge:is\(\[data-state="pending"\], \[data-state="action"\]\)[^}]*var\(--ui-action-primary-soft\)[^}]*var\(--ui-action-primary-hover\)/s);
    assert.match(status, /label: '작업 중', tone: 'neutral'/);
    assert.match(status, /label: '발행 대기', tone: 'pending'/);
});

test('Card News generation uses shared field, choice, role and feedback patterns without fixed palette values', () => {
    const patternCss = fs.readFileSync(path.join(uiRoot, 'styles/patterns/overview-card.css'), 'utf8');
    const cardNewsCss = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    const responsiveCss = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news-results.css'), 'utf8');
    const generationCss = cardNewsCss.slice(
        cardNewsCss.indexOf('.card-news-generation-controls'),
        cardNewsCss.indexOf('.card-news-result-actions')
    );
    const generationActionsCss = generationCss.match(/\.card-news-generation-actions\s*\{([^}]*)\}/)?.[1] || '';

    assert.match(patternCss, /\.ui-workflow-field-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(patternCss, /\.ui-workflow-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 2fr\) minmax\(0, 1fr\)[^}]*align-items:\s*end/);
    assert.match(patternCss, /\.ui-inline-choice\s*\{[^}]*var\(--ui-border-default\)[^}]*var\(--ui-surface-muted\)/s);
    assert.match(patternCss, /\.ui-workflow-feedback\[data-state="error"\]\s*\{\s*color:\s*var\(--ui-status-danger\)/);
    assert.match(responsiveCss, /@media \(max-width: 1100px\)[\s\S]*\.card-news-generation-field-grid,\s*\.card-news-result-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(patternCss, /@media \(max-width: 720px\)[\s\S]*\.ui-workflow-field-grid,[\s\S]*\.ui-workflow-detail-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    assert.doesNotMatch(generationActionsCss, /border-top|padding-top/);
    assert.doesNotMatch(generationCss, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

test('Card News results use shared sequence and action hierarchy without a fixed palette', () => {
    const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
    const script = fs.readFileSync(path.join(uiRoot, 'scripts/features/card-news/source-preview.js'), 'utf8');
    const patternCss = [
        fs.readFileSync(path.join(uiRoot, 'styles/patterns/actions.css'), 'utf8'),
        fs.readFileSync(path.join(uiRoot, 'styles/patterns/overview-card.css'), 'utf8')
    ].join('\n');
    const resultCss = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news-results.css'), 'utf8');
    const resultSurfaceCss = resultCss.slice(resultCss.indexOf('.card-news-result-grid'));

    assert.match(html, /id="card-news-export-all" class="card-news-export-all ui-button-link secondary"/);
    assert.match(patternCss, /\.ui-button-link\.secondary\s*\{[^}]*var\(--ui-button-secondary-border\)[^}]*var\(--ui-button-secondary-background\)/s);
    assert.match(patternCss, /\.ui-sequence-badge\s*\{[^}]*var\(--ui-surface-emphasis\)[^}]*var\(--ui-text-inverse\)/s);
    assert.match(script, /<span class="ui-sequence-badge">\$\{card\.index\}<\/span>/);
    assert.match(script, /class="\$\{card\.image_url \? 'secondary' : 'primary'\} compact"[^>]*>\$\{card\.image_url \? 'AI 재생성' : 'AI 이미지 만들기'\}/);
    assert.match(script, /class="secondary compact"[^>]*data-card-news-local-picker[^>]*>\$\{card\.image_url \? '이미지 교체' : '＋ 내 이미지 선택'\}/);
    assert.match(script, /class="ui-button-link secondary compact"[^>]*download>받기<\/a>/);
    assert.match(script, /class="ui-text-action compact card-news-prompt-copy"[^>]*data-card-news-prompt-copy[^>]*>복사<\/button>/);
    assert.match(script, /<details class="card-news-prompt-details">\s*<summary>프롬프트 보기<\/summary>/);
    assert.match(patternCss, /\.ui-text-action\.compact\s*\{[^}]*var\(--ui-space-1\)[^}]*var\(--ui-type-caption-size\)/s);
    assert.match(resultSurfaceCss, /\.card-news-prompt-section\s*\{[^}]*border-top:\s*1px solid var\(--ui-border-default\)/s);
    assert.match(script, /bulkImageAction\.classList\.toggle\('primary', imageCount </);
    assert.match(script, /bulkImageAction\.classList\.toggle\('secondary', imageCount ===/);
    assert.match(resultSurfaceCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(resultSurfaceCss, /\.card-news-result-grid\s*\{[^}]*align-items:\s*stretch/s);
    assert.match(resultSurfaceCss, /\.card-news-result-item\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
    assert.match(resultSurfaceCss, /\.card-news-result-copy\s*\{[^}]*flex:\s*1[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
    assert.match(resultSurfaceCss, /\.card-news-prompt-section\s*\{[^}]*margin-top:\s*auto/s);
    assert.match(resultSurfaceCss, /\.card-news-result-image-empty\s*\{[^}]*radial-gradient\([^}]*var\(--ui-text-muted\)/s);
    assert.match(resultSurfaceCss, /\.card-news-media-actions\s*\{[^}]*position:\s*absolute[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap[^}]*background:\s*color-mix\(in srgb, var\(--ui-surface\) 74%, transparent\)[^}]*opacity:\s*0/s);
    assert.match(resultSurfaceCss, /\.card-news-media-actions:not\(\.is-empty\) > button,[\s\S]*> a\s*\{[^}]*flex:\s*1 1 0/s);
    assert.match(resultSurfaceCss, /\.card-news-result-image-wrap:not\(\.is-empty\):hover \.card-news-media-actions,[\s\S]*:focus-within \.card-news-media-actions\s*\{[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/s);
    assert.match(resultSurfaceCss, /\.card-news-media-actions\.is-empty\s*\{[^}]*flex-wrap:\s*wrap[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/s);
    assert.match(resultSurfaceCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.card-news-media-actions:not\(\.is-empty\)\s*\{[^}]*opacity:\s*1/s);
    assert.match(resultSurfaceCss, /@media \(max-width: 1100px\)[\s\S]*\.card-news-result-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(resultSurfaceCss, /#[0-9a-f]{3,8}\b|rgba?\(|linear-gradient/i);
});

test('Card News source manager uses a transaction dialog while publishing stays inline', () => {
    const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
    const css = fs.readFileSync(path.join(uiRoot, 'styles/patterns/transaction-dialog.css'), 'utf8');
    assert.match(html, /id="card-news-source-manager" class="card-news-source-manager ui-transaction-dialog"/);
    assert.match(html, /id="card-news-publishing-panel" class="card-news-publishing-panel ui-workflow-card"/);
    assert.doesNotMatch(html, /id="card-news-publishing-panel" class="[^"]*ui-transaction-dialog/);
    assert.match(css, /\.ui-transaction-dialog\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*margin:\s*auto/s);
    assert.match(css, /\.ui-transaction-dialog\s*\{[^}]*max-height:\s*calc\(100vh[^}]*overflow:\s*auto/s);
    assert.match(css, /\.ui-transaction-dialog-footer\s*\{[^}]*border-top:\s*1px solid var\(--ui-border-default\)/s);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

test('Card News publishing keeps provider state and palette out of feature styling', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news-results.css'), 'utf8');
    const selectionCss = fs.readFileSync(path.join(uiRoot, 'styles/patterns/selection-controls.css'), 'utf8');
    const publishingCss = css.slice(0, css.indexOf('.card-news-result-grid'));
    assert.match(publishingCss, /\.card-news-publishing-panel\s*\{[^}]*margin-top:\s*var\(--ui-space-5\)[^}]*padding:\s*var\(--ui-space-6\)/s);
    assert.match(publishingCss, /\.card-news-publishing-form\s*\{[^}]*gap:\s*var\(--ui-space-5\)/s);
    assert.match(publishingCss, /\.card-news-publishing-result-item\s*\{[^}]*var\(--ui-border-default\)[^}]*var\(--ui-surface-muted\)/s);
    assert.match(selectionCss, /\.ui-selectable-card-group > legend\s*\{[^}]*margin:\s*0 0 var\(--ui-space-3\)/s);
    assert.doesNotMatch(publishingCss, /card-news-publishing-channel-group (?:legend|> legend)/);
    assert.doesNotMatch(publishingCss, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\[data-style/i);
});

test('Card News view claims its parent width on the first layout pass', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    assert.match(css, /#view-card-news\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/);
});

test('Card News empty and confirmed source states are mutually exclusive', () => {
    const css = fs.readFileSync(path.join(uiRoot, 'styles/features/card-news.css'), 'utf8');
    assert.match(css, /\.card-news-preview-empty\[hidden\],[\s\S]*?\.card-news-preview-content\[hidden\]\s*\{[^}]*display:\s*none;/);
    assert.doesNotMatch(css, /!important\b/);
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
