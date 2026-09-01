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
    assert.match(betaView, /data-blog-next-tab="queue">글감 관리/);
    assert.match(betaView, /data-blog-next-tab="automation"/);
    assert.doesNotMatch(betaView, /\bid="blog-tab-/);
    assert.doesNotMatch(betaScript, /\.blog-tab-btn|\.blog-tab-panel|quick-save-btn|blog-table-body/);
});

test('Blog Beta quick shell preserves all three existing input concepts', () => {
    const betaView = read('ui/partials/views/blog-next.html');

    assert.match(betaView, /data-blog-next-input-mode="ai"[^>]*>바로 생성/);
    assert.match(betaView, /data-blog-next-input-mode="folder"[^>]*>원고 폴더/);
    assert.match(betaView, /data-blog-next-input-mode="paste"[^>]*>원고 붙여넣기/);
    assert.doesNotMatch(betaView, /기존 블로그 기능은 그대로 유지됩니다/);
});

test('Blog Beta keeps trend and management headers compact', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const usabilityCss = read('ui/styles/features/continuous-publishing-usability.css');
    const betaCss = read('ui/styles/features/continuous-publishing-interactions.css');
    const trendScript = read('ui/scripts/features/blog-next/trend-posting.js');

    assert.doesNotMatch(betaView, /네이버 트렌드에서 글감 찾기/);
    assert.match(betaView, /class="trend-posting-head blog-next-trend-head"/);
    assert.match(betaCss, /\.blog-next-trend-head\s*{[^}]*justify-content:\s*flex-end;/s);
    assert.match(betaView, /id="blog-next-trend-refresh"[^>]*aria-label="최신 데이터 새로고침"/);
    assert.match(betaCss, /\.blog-next-trend-refresh\.is-loading span/);
    assert.match(trendScript, /loadBlogNextTrendMeta\(\{ force: true \}\)/);
    assert.match(trendScript, /이미 최신 데이터입니다/);
    assert.match(trendScript, /selectedCategories/);
    assert.match(trendScript, /preservedDates/);
    assert.match(betaView, /class="blog-next-management-actions"[\s\S]*?id="blog-next-queue-refresh"/);
    assert.match(usabilityCss, /\.blog-next-management-actions\s*{[^}]*margin-inline-start:\s*auto;/s);
});

test('Blog Beta shell does not call data, AI, or publishing APIs during Stage 1', () => {
    const betaScript = read('ui/scripts/features/blog-next/shell.js');

    assert.doesNotMatch(betaScript, /fetchJson|postJson|fetch\s*\(|publish|appendGoogleSheet|generate/i);
});

test('Blog Beta Stage 2 exposes AI-free topic capture and the Topics-backed queue', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const quickQueueScript = read('ui/scripts/features/blog-next/quick-queue.js');
    const publishIndex = betaView.indexOf('id="blog-next-publish-now"');
    const enqueueIndex = betaView.indexOf('id="blog-next-enqueue-topic"');
    const saveIndex = betaView.indexOf('id="blog-next-save-topic"');
    const clearIndex = betaView.indexOf('id="blog-next-clear-topic"');

    assert.match(betaView, /id="blog-next-save-topic"[^>]*>글감 보관/);
    assert.match(betaView, /id="blog-next-enqueue-topic"[^>]*>발행 대기열에 추가/);
    assert.match(betaView, /class="primary" id="blog-next-publish-now"[^>]*>바로 포스팅/);
    assert.match(betaView, /class="ghost blog-next-clear-action" id="blog-next-clear-topic"[^>]*>내용 지우기/);
    assert.equal(publishIndex < enqueueIndex && enqueueIndex < saveIndex && saveIndex < clearIndex, true);
    assert.match(betaView, /id="blog-next-queue-list"/);
    assert.match(betaView, /id="blog-next-saved-list"/);
    assert.match(quickQueueScript, /\/api\/v1\/continuous-publishing\/topics/);
    assert.match(quickQueueScript, /\/api\/v1\/continuous-publishing\/queue/);
    assert.doesNotMatch(quickQueueScript, /quick-publish|quick-preview|generateContent|publishBlog|reserveQuota/i);
});

test('completed manuscripts publish directly without entering the continuous queue', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const draftInputs = read('ui/scripts/features/blog-next/draft-inputs.js');

    assert.match(betaView, /data-blog-next-draft-publish="folder"/);
    assert.match(betaView, /data-blog-next-draft-publish="paste"/);
    assert.doesNotMatch(betaView, /Queue에 저장하지 않습니다/);
    assert.match(betaView, /data-blog-next-input-mode="folder" title="Markdown 원고와 같은 폴더의 이미지를 함께 불러옵니다."/);
    assert.match(betaView, /data-blog-next-input-mode="paste" title="완성된 Markdown 원고를 붙여넣어 바로 포스팅합니다."/);
    assert.doesNotMatch(betaView, /blog-next-draft-heading|blog-next-stage-badge/);
    assert.match(draftInputs, /\/api\/v1\/blog\/local-markdown\/preview/);
    assert.match(draftInputs, /\/api\/v1\/blog\/local-markdown\/publish/);
    assert.match(betaView, /data-draft-preview-body[^>]*><\/div>/);
    assert.match(betaView, /class="local-markdown-image-list" data-draft-preview-images/);
    assert.match(draftInputs, /renderBlogNextDraftBodyHtml/);
    assert.match(draftInputs, /renderInlinePreviewHtml/);
    assert.match(draftInputs, /local-markdown-image-card/);
    assert.match(draftInputs, /URL\.createObjectURL/);
    assert.match(draftInputs, /syncBlogNextDraftExecutionState/);
    assert.match(draftInputs, /renderBlogNextRunnerStatus/);
    assert.doesNotMatch(draftInputs, /continuous-publishing\/(topics|queue|runner)/);
});

test('Blog Beta execution paths share one server-side coordinator without widening to legacy products', () => {
    const routes = read('src/ui-api/routes/legacy-api.routes.js');
    const contentService = read('src/ui-api/services/content.service.js');
    const continuousService = read('src/ui-api/services/continuous-publishing.service.js');

    assert.match(routes, /const blogNextExecutionCoordinator =/);
    assert.equal((routes.match(/blogNextExecutionCoordinator/g) || []).length >= 3, true);
    assert.match(contentService, /source: 'local_markdown'/);
    assert.match(continuousService, /source: 'continuous_runner'/);
    assert.match(contentService, /BLOG_NEXT_EXECUTION_BUSY/);
    assert.doesNotMatch(contentService, /shoppingQuickPublish[\s\S]{0,300}runBlogNextExecution/);
});

test('continuous automation settings own timing but never topic delivery targets', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const automationScript = read('ui/scripts/features/blog-next/automation-settings.js');
    const shellScript = read('ui/scripts/features/blog-next/shell.js');
    const navigationScript = read('ui/scripts/foundation/navigation.js');
    const lifecycleScript = read('ui/scripts/foundation/lifecycle.js');
    const interactionCss = read('ui/styles/features/continuous-publishing-interactions.css');

    assert.match(betaView, /id="blog-next-automation-enabled"/);
    assert.match(betaView, /id="blog-next-automation-start-time"/);
    assert.match(betaView, /id="blog-next-automation-end-time"/);
    assert.match(betaView, /id="blog-next-automation-interval"[^>]*min="10"[^>]*max="360"[^>]*step="1"/);
    assert.match(betaView, />발행 간격</);
    assert.doesNotMatch(betaView, /글 사이 최소 간격/);
    assert.match(betaView, />연속 발행 사용</);
    assert.match(betaView, /id="blog-next-automation-save"[^>]*disabled/);
    assert.doesNotMatch(betaView, /이 기기|기본값은 꺼짐|글감이 정하는 것|연속 발행이 정하는 것|blog-next-runner-card/);
    assert.match(automationScript, /continuous-publishing\/automation\/settings/);
    assert.match(automationScript, /updateBlogNextAutomationDirtyState/);
    assert.match(automationScript, /confirmDiscardUnsavedBlogNextAutomationSettings/);
    assert.match(shellScript, /requestActivateBlogNextTab/);
    assert.match(navigationScript, /confirmDiscardUnsavedBlogNextAutomationSettings/);
    assert.match(lifecycleScript, /blogNextAutomationDirty/);
    assert.match(interactionCss, /#blog-next-automation-save:disabled/);
    assert.doesNotMatch(automationScript, /platforms|post_status|image_mode|naver_category|wordpress_category/);
});

test('safe timer UI exposes a development-only 30 second test without multi-device lease controls', () => {
    const html = read('ui/partials/views/blog-next.html');
    const script = read('ui/scripts/features/blog-next/automation-settings.js');
    const css = read('ui/styles/features/continuous-publishing-interactions.css');
    assert.match(html, /id="blog-next-automation-test"/);
    assert.match(css, /\.blog-next-queue-actions button:disabled/);
    assert.match(css, /#blog-next-automation-test:disabled/);
    assert.match(html, />30초 테스트</);
    assert.match(script, /\/api\/v1\/continuous-publishing\/automation\/test/);
    assert.match(script, /runtime\.environment === 'development'/);
    assert.doesNotMatch(html, /claim|lease/i);
});

test('Stage 8 distinguishes saved ideas, keeps queue editing in context, and reuses recommendation surfaces', () => {
    const html = read('ui/partials/views/blog-next.html');
    const queueScript = read('ui/scripts/features/blog-next/quick-queue.js');
    const discoveryScript = read('ui/scripts/features/discovery/quick-discovery.js');

    assert.match(html, /id="blog-next-saved-count"/);
    assert.match(html, /id="blog-next-queue-count"/);
    assert.match(html, /id="blog-next-editor-modal"/);
    assert.match(html, /data-blog-next-management-tab="ready">발행 대기열/);
    assert.match(html, /data-blog-next-management-tab="saved">보관한 글감/);
    assert.doesNotMatch(html, /blog-next-status-flow|blog-next-management-description/);
    assert.doesNotMatch(html, /blog-next-reset-defaults|설정 초기화/);
    assert.doesNotMatch(html, /AI 호출 없이 글감 등록|글감 보관은 아이디어만 있어도 가능합니다/);
    assert.match(html, /id="blog-next-topic-recommend"/);
    assert.match(html, /id="blog-next-keyword-recommend"/);
    assert.match(html, /id="blog-next-title-recommend"/);
    assert.match(queueScript, /moveBlogNextTopicFormToQueueEditor/);
    assert.match(queueScript, /copy\.dataset\.blogNextEdit/);
    assert.doesNotMatch(queueScript, /primaryAction\.textContent = '수정'/);
    assert.match(queueScript, /blogNextRunNow/);
    assert.doesNotMatch(queueScript, /blog-next-queue-status/);
    assert.match(queueScript, /\/api\/v1\/continuous-publishing\/topics\/delete/);
    assert.match(queueScript, /blog_next_topic_defaults_v1/);
    assert.match(queueScript, /localStorage\.setItem/);
    assert.doesNotMatch(queueScript, /activateBlogNextTab\('quick'\)/);
    assert.match(discoveryScript, /blogNext: Object\.freeze/);
    assert.match(discoveryScript, /getQuickDiscoveryInputElement/);
});

test('Stage 8 aligns posting language and external-reference controls with the existing blog flow', () => {
    const html = read('ui/partials/views/blog-next.html');
    const css = read('ui/styles/features/continuous-publishing-usability.css');

    assert.match(html, /포스팅 대상/);
    assert.match(html, /포스팅 옵션/);
    assert.match(html, /<option value="publish">즉시 발행<\/option>/);
    assert.match(html, /<option value="draft">임시 저장<\/option>/);
    assert.match(html, /<option value="schedule">예약 발행<\/option>/);
    assert.match(html, /id="blog-next-external-reference"[^>]*checked> 외부 참고 사용/);
    assert.doesNotMatch(html, /관련 자료 자동 검색/);
    assert.equal((html.match(/class="tooltip-container"/g) || []).length >= 5, true);
    assert.match(css, /\.blog-next-input-action-row button\s*\{[^}]*inline-size:\s*156px;/s);
});

test('Stage 9 exposes adjacent queue movement without drag, lease, or synthetic order fields', () => {
    const queueScript = read('ui/scripts/features/blog-next/quick-queue.js');
    const routeSource = read('src/ui-api/routes/continuous-publishing.routes.js');
    const orderSource = read('src/continuous-publishing/queue-order.js');

    assert.match(queueScript, /dataset\.blogNextQueueMove/);
    assert.match(queueScript, /symbol: '↑'/);
    assert.match(queueScript, /symbol: '↓'/);
    assert.match(queueScript, /\/api\/v1\/continuous-publishing\/queue\/reorder/);
    assert.match(routeSource, /\/api\/v1\/continuous-publishing\/queue\/reorder/);
    assert.match(orderSource, /moveDimension/);
    assert.doesNotMatch(orderSource, /claim|lease|order[_-](?:id|column)|drag/i);
});

test('Stage 10 keeps trend discovery manual and hands one selection to quick writing', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const trendScript = read('ui/scripts/features/blog-next/trend-posting.js');
    const quickQueueScript = read('ui/scripts/features/blog-next/quick-queue.js');

    assert.match(betaView, /data-blog-next-tab="trend-posting">트렌드 포스팅/);
    assert.match(betaView, /id="blog-next-panel-trend-posting"/);
    assert.match(trendScript, /data-blog-next-trend-select/);
    assert.match(trendScript, /data-blog-next-trend-save/);
    assert.match(trendScript, /\/api\/v1\/trend-posting\/topics/);
    assert.match(betaView, /id="blog-next-publish-now"[^>]*>바로 포스팅/);
    assert.match(trendScript, /\/api\/v1\/trend-posting\/meta/);
    assert.match(trendScript, /\/api\/v1\/trend-posting\/keywords/);
    assert.match(trendScript, /activateBlogNextTab\('quick'\)/);
    assert.match(trendScript, /blog-next-subject/);
    assert.doesNotMatch(trendScript, /continuous-publishing\/topics|runner\/start|quick-publish/);
    assert.match(quickQueueScript, /action === 'publish-now' \? 'enqueue'/);
    assert.match(quickQueueScript, /editing\s*\? '\/api\/v1\/continuous-publishing\/topics\/update'/);
    assert.match(quickQueueScript, /startBlogNextRunner\(\{ rowIndex: Number\(data\.rowIndex\) \}\)/);
});

test('Stage 11 exposes one shared publish status with an explicit status shortcut and no internal row details', () => {
    const betaView = read('ui/partials/views/blog-next.html');
    const runnerScript = read('ui/scripts/features/blog-next/runner.js');
    const publishPreferences = read('ui/scripts/features/publishing/shared-preferences.js');

    assert.match(betaView, /id="blog-next-publish-status"[^>]*role="status"[^>]*hidden/);
    assert.match(betaView, /id="blog-next-publish-status-title"/);
    assert.match(betaView, /id="blog-next-publish-status-manage"[^>]*>글감 관리/);
    assert.match(betaView, /id="blog-next-publish-status-dismiss"[^>]*aria-label="닫기"[^>]*>×/);
    assert.match(betaView, /id="blog-next-runner-headless"[^>]*checked[^>]*> 보이지 않게 실행/);
    assert.match(betaView, /data-blog-next-runner-status-jump[^>]*hidden>상태 보기/);
    assert.equal((betaView.match(/data-blog-next-runner-status-jump/g) || []).length, 1);
    assert.match(
        betaView,
        /class="blog-next-form-result-row">[\s\S]*?id="blog-next-topic-result"[\s\S]*?data-blog-next-runner-status-jump[\s\S]*?<\/div>/
    );
    assert.match(runnerScript, /state === 'completed'/);
    assert.match(runnerScript, /state === 'failed'/);
    assert.match(runnerScript, /state === 'needs_attention'/);
    assert.match(runnerScript, /rawMessage === '다음 글감 한 건을 처리했습니다.'/);
    assert.match(runnerScript, /'글감 처리 완료'/);
    assert.match(runnerScript, /panel\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    assert.doesNotMatch(runnerScript, /\.focus\s*\(/);
    assert.doesNotMatch(runnerScript, /Topics\s*\$\{|showUiToast/);
    assert.match(read('ui/styles/features/continuous-publishing.css'), /\.blog-next-editor-modal \.blog-next-runner-status-jump/);
    assert.match(publishPreferences, /'blog-next-runner-headless'/);
    assert.match(publishPreferences, /'blog-next-folder-headless'/);
    assert.match(publishPreferences, /'blog-next-paste-headless'/);
});

test('release queue shows processing estimates and refreshes when a runner finishes', () => {
    const queueScript = read('ui/scripts/features/blog-next/quick-queue.js');
    const runnerScript = read('ui/scripts/features/blog-next/runner.js');
    const serviceSource = read('src/ui-api/services/continuous-publishing.service.js');
    const queueCss = read('ui/styles/features/continuous-publishing-interactions.css');

    assert.match(queueScript, /processing_estimate_at/);
    assert.match(queueScript, /다음 처리/);
    assert.match(queueScript, /처리 예상/);
    assert.match(serviceSource, /computeQueueRunProjections/);
    assert.match(serviceSource, /basis: 'current_queue_order'/);
    assert.match(runnerScript, /finishedChanged/);
    assert.match(runnerScript, /loadBlogNextQueue\(\{ force: true \}\)/);
    assert.match(runnerScript, /blogNextActiveTab === 'queue'/);
    assert.match(queueScript, /syncBlogNextQueueRunnerState/);
    assert.match(queueScript, /aria-busy/);
    assert.match(queueScript, /queue_runtime_state/);
    assert.match(serviceSource, /queue_runtime_state: 'running'/);
    assert.match(queueCss, /\.blog-next-queue-item\.is-running/);
    assert.match(queueCss, /blog-next-queue-running-indicator/);
});
