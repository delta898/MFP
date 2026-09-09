const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('legacy Settings and independent Settings Beta coexist in navigation and views', () => {
    const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;

    assert.match(html, /class="nav-btn" data-view="settings"/);
    assert.match(html, /class="nav-btn" data-view="settings-next"/);
    assert.match(html, /id="view-settings"/);
    assert.match(html, /id="view-settings-next"/);
    assert.match(html, /설정 Beta<sup class="nav-new-badge"/);
});

test('Settings Beta exposes the agreed top IA and core connection submenus as accessible tabs', () => {
    const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({
        uiRoot,
        entryFile: 'partials/views/settings-next.html'
    }).html;
    const topTabs = Array.from(
        html.matchAll(/data-settings-next-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g),
        (match) => [match[1], match[2]]
    );
    const coreTabs = Array.from(
        html.matchAll(/data-settings-next-core-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g),
        (match) => [match[1], match[2]]
    );

    assert.deepEqual(topTabs, [
        ['core', '기본 연결'],
        ['ai', 'AI'],
        ['writing', '글쓰기'],
        ['extras', '부가 서비스'],
        ['app', '앱']
    ]);
    assert.deepEqual(coreTabs, [
        ['content', '콘텐츠 공간'],
        ['publishing', '블로그 발행 채널']
    ]);
    const appTabs = Array.from(
        html.matchAll(/data-settings-next-app-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g),
        (match) => [match[1], match[2]]
    );
    assert.deepEqual(appTabs, [
        ['external', '외부 연결'],
        ['input', '입력 환경'],
        ['general', '일반']
    ]);
    assert.equal((html.match(/role="tab"/g) || []).length, 13);
    assert.equal((html.match(/aria-controls="settings-next-/g) || []).length, 13);
    assert.match(html, /class="settings-next-tabs ui-top-tabs"/);
    assert.equal((html.match(/settings-next-tab ui-top-tab/g) || []).length, 5);
    assert.match(html, /class="settings-next-local-nav ui-segmented-tabs"/);
    assert.equal((html.match(/settings-next-local-tab ui-segmented-tab/g) || []).length, 8);
    assert.doesNotMatch(html, /settings-next-tab-publishing|settings-next-panel-publishing/);
    assert.match(html, /id="settings-next-panel-app"[\s\S]*?aria-label="앱 설정"/);
    assert.doesNotMatch(html, /settings-next-app-panel-notifications|settings-next-app-notification-form/);
    assert.match(html, /<h2>앱 운영 설정<\/h2>/);
    assert.match(html, /data-settings-next-external-scope="telegram"/);
    assert.match(html, /id="settings-next-telegram-inbound-enabled"/);
    assert.match(html, /data-settings-next-external-scope="mcp"/);
    assert.match(html, /id="settings-next-mcp-remote-token"[^>]*type="password"/);
    assert.match(html, /id="settings-next-app-input-form"/);
    assert.match(html, /id="settings-next-typing-speed"/);
    assert.match(html, /id="settings-next-typing-sample-output"/);
    assert.doesNotMatch(html, /settings-next-typing-sample-test/);
    assert.match(html, /id="settings-next-app-general-form"/);
    assert.match(html, /id="settings-next-listen-host"/);
    assert.match(html, /id="settings-next-listen-port"/);
    assert.match(html, /data-settings-next-update-action="check"/);
    assert.match(html, /data-settings-next-update-action="force"/);
    assert.match(html, /id="settings-next-telegram-delivery-enabled"[^>]*data-settings-next-delivery-toggle="telegram"/);
    assert.match(html, /id="settings-next-slack-delivery-enabled"[^>]*data-settings-next-delivery-toggle="slack"/);
    assert.match(html, /class="page-clock-widget"[\s\S]*?data-clock-display/);
    assert.match(
        html,
        /settings-next-panel-lead[\s\S]*?settings-next-local-nav-row[\s\S]*?settings-next-core-panel-content/
    );
    assert.match(html, /id="settings-next-google-sheet-url"/);
    assert.match(html, /id="settings-next-content-status"[^>]*>확인 필요/);
    assert.match(html, /id="settings-next-naver-id"/);
    assert.match(html, /id="settings-next-wordpress-url"/);
    assert.match(html, /id="settings-next-wordpress-password-visibility"[^>]*aria-label="새 애플리케이션 비밀번호 표시"/);
    assert.match(html, /id="settings-next-wordpress-password-hint"/);
    assert.match(html, /aria-label="블로그 발행 채널 준비 상태"/);
    assert.match(html, /settings-next-naver-readiness/);
    assert.match(html, /settings-next-wordpress-readiness/);
    assert.equal((html.match(/data-settings-card-target=/g) || []).length, 14);
    assert.match(html, /data-settings-card-target="settings-next-naver-form"/);
    assert.match(html, /data-settings-card-target="settings-next-wordpress-form"/);
    assert.doesNotMatch(html, /settings-next-ai-local-tab/);
    assert.match(html, /settings-next-ai-text-form/);
    assert.match(html, /settings-next-ai-image-form/);
    assert.match(html, /settings-next-ai-chat-form/);
    assert.doesNotMatch(html, /settings-next-writing-local-tab/);
    assert.match(html, /id="settings-next-writing-form"/);
    assert.match(html, /data-settings-card-target="settings-next-writing-voice-card"/);
    assert.match(html, /data-settings-card-target="settings-next-writing-structure-card"/);
    assert.match(html, /data-settings-card-target="settings-next-writing-image-card"/);
    assert.match(html, /class="ui-settings-shortcut-card"[^>]*data-settings-card-target="settings-next-writing-reference-card"/);
    assert.match(html, /class="ui-settings-shortcut-card"[^>]*data-settings-card-target="settings-next-writing-preview-card"/);
    assert.match(html, /class="ui-settings-field-grid settings-next-writing-field-grid--three"/);
    assert.doesNotMatch(html, /settings-writing-profile-kind|settings-next-writing-strategy/);
    assert.match(html, /글 작성 전략은 실제 글을 쓸 때 선택합니다/);
    assert.match(html, /data-settings-next-extras-tab="social">SNS 배포/);
    assert.match(html, /data-settings-next-extras-tab="messaging">메시지·알림/);
    assert.match(html, /data-settings-next-extras-tab="links">링크 단축/);
    assert.match(html, /data-settings-next-optional-scope="buffer"/);
    assert.match(html, /data-settings-next-optional-scope="telegram"/);
    assert.match(html, /data-settings-next-optional-scope="slack"/);
    assert.match(html, /data-settings-next-optional-scope="bitly"/);
    assert.doesNotMatch(html, /settings-next-buffer-organization|settings-next-buffer-channels/);
    assert.doesNotMatch(html, /settings-next-telegram-enabled|settings-next-slack-enabled/);
    const secrets = read('ui/scripts/foundation/settings-secrets.js');
    const optionalServices = read('ui/scripts/features/settings-next/optional-services.js');
    const externalConnections = read('ui/scripts/features/settings-next/external-connections.js');
    const appGeneral = read('ui/scripts/features/settings-next/app-general.js');
    const appInput = read('ui/scripts/features/settings-next/app-input.js');
    const settingsCardStyles = read('ui/styles/patterns/settings-card.css');
    const settingsNextStyles = read('ui/styles/features/settings-next.css');
    assert.match(secrets, /function syncSettingsNextSecretRegistration/);
    assert.match(optionalServices, /syncSettingsNextSecretRegistration/);
    assert.match(externalConnections, /postJson\('\/api\/v1\/settings\/external-connections'/);
    assert.match(externalConnections, /TELEGRAM_INBOUND_ENABLED/);
    assert.match(externalConnections, /MCP_REMOTE_AUTH_TOKEN/);
    assert.match(appInput, /\/api\/v1\/settings\/app-input/);
    assert.match(appInput, /settingsNextRunTypingSample/);
    assert.match(appInput, /repeat >= 3/);
    assert.match(appInput, /settingsNextMarkScopeDirty\('app-input'\)/);
    assert.match(appInput, /'변경됨', 'warning'/);
    assert.match(externalConnections, /settingsNextExternalState\.loaded/);
    assert.match(appGeneral, /postJson\('\/api\/v1\/settings\/app-general'/);
    assert.match(appGeneral, /setUiSettingsCardFooterDetail\('settings-next-app-general-footer-detail'/);
    assert.match(appGeneral, /checkUpdate\(true, force\)/);
    assert.match(read('ui/scripts/foundation/settings-card.js'), /function setUiSettingsCardFooterDetail/);
    assert.match(read('ui/scripts/foundation/settings-card.js'), /element\.dataset\.tone = tone/);
    assert.match(html, /id="settings-next-buffer-footer-detail" class="ui-settings-card-footer-detail" hidden[\s\S]*?class="ui-settings-card-footer-actions"/);
    assert.match(html, /id="settings-next-telegram-footer-detail" class="ui-settings-card-footer-detail" hidden[\s\S]*?class="ui-settings-card-footer-actions"/);
    assert.match(html, /id="settings-next-slack-footer-detail" class="ui-settings-card-footer-detail" hidden[\s\S]*?class="ui-settings-card-footer-actions"/);
    assert.match(html, /id="settings-next-bitly-footer-detail" class="ui-settings-card-footer-detail" hidden[\s\S]*?class="ui-settings-card-footer-actions"/);
    assert.match(settingsCardStyles, /\.ui-settings-card > \.ui-settings-card-heading \+ \*/);
    assert.match(settingsCardStyles, /\.ui-settings-card-footer-detail\[data-tone="danger"\]/);
    assert.match(settingsCardStyles, /--ui-settings-card-heading-body-gap/);
    assert.doesNotMatch(settingsNextStyles, /\.settings-next-ai-card\s*\{\s*gap:/);
});

test('Settings Beta controller applies scoped changes seamlessly and protects pending local changes', () => {
    const script = read('ui/scripts/features/settings-next/shell.js');
    const aiScript = read('ui/scripts/features/settings-next/ai-model-roles.js');
    const writingScript = read('ui/scripts/features/settings-next/writing-defaults.js');
    const optionalServices = read('ui/scripts/features/settings-next/optional-services.js');
    const tabNavigation = read('ui/scripts/foundation/tab-navigation.js');
    const navigation = read('ui/scripts/foundation/navigation.js');
    const lifecycle = read('ui/scripts/foundation/lifecycle.js');
    const composed = createJsCompositionRuntime({ fs, path }).composeJsFile({ uiRoot }).js;

    assert.match(script, /postJson\('\/api\/v1\/settings\/core-connections', \{ scope, values \}\)/);
    assert.doesNotMatch(script, /postJson\('\/api\/v1\/settings\/major'/);
    assert.match(tabNavigation, /ArrowLeft.*ArrowRight.*Home.*End/s);
    assert.match(script, /handleUiTabNavigationKeydown/);
    assert.match(script, /const SETTINGS_NEXT_APP_TABS = Object\.freeze\(\['external', 'input', 'general'\]\)/);
    assert.match(script, /function settingsNextActivateAppTab\(tabName\)/);
    assert.match(script, /selector: '\[data-settings-next-app-tab\]'/);
    assert.match(optionalServices, /function settingsNextOptionalToggleDelivery\(scope, input\)/);
    assert.doesNotMatch(script, /function settingsNextHandleTabKeydown/);
    assert.match(script, /settingsNextHasValidSheetUrl/);
    assert.match(script, /settingsNextBusyScopes\.has\('naver'\)/);
    assert.match(script, /settingsNextBusyScopes\.has\('wordpress'\)/);
    assert.match(script, /button\.hidden = loggedIn && !dirty/);
    assert.match(script, /login\.hidden = valid && !settingsNextDirtyScopes\.has\('naver'\)/);
    assert.match(script, /settingsNextSetScopeFeedback\('naver'/);
    assert.match(script, /settingsNextSetScopeFeedback\('wordpress'/);
    assert.match(script, /입력값은 반영되었습니다/);
    assert.match(script, /아이디는 반영되었습니다/);
    assert.doesNotMatch(script, /저장하고|저장됨|저장되지 않은/);
    assert.doesNotMatch(script, /save-status/);
    assert.match(script, /WORDPRESS_APP_PASSWORD_CONFIGURED/);
    assert.match(script, /비밀번호 등록됨/);
    assert.doesNotMatch(script, /enteredPassword \|\| String\(settingsNextMajorFields\.WORDPRESS_APP_PASSWORD/);
    assert.match(script, /void settingsNextLoadStatuses\(\{ force: true \}\)/);
    assert.doesNotMatch(script, /await settingsNextLoadStatuses\(\{ force: true \}\)/);
    assert.match(script, /connected: state === 'connected'/);
    assert.match(script, /settingsNextSheetVerification/);
    assert.match(script, /'settings-next-content-status'/);
    assert.doesNotMatch(script, /connected: state === 'connected' \|\| state === 'configured'/);
    assert.match(navigation, /confirmDiscardUnsavedSettingsNext/);
    assert.match(lifecycle, /hasPendingSettingsNextChanges/);
    assert.equal((composed.match(/function initSettingsNext\s*\(/g) || []).length, 1);
    assert.match(aiScript, /postJson\('\/api\/v1\/settings\/ai-roles', \{ scope: role, values \}\)/);
    assert.match(aiScript, /postJson\('\/api\/v1\/settings\/ai-roles\/test', \{ scope: role \}\)/);
    assert.doesNotMatch(aiScript, /postJson\('\/api\/v1\/settings\/test-ai-model/);
    assert.match(aiScript, /settings-next-ai-chat-source/);
    assert.doesNotMatch(aiScript, /settings-next-ai-local-tab/);
    assert.match(aiScript, /function settingsNextAiInvalidateVerification\(role\)/);
    assert.match(aiScript, /function settingsNextAiProfile\(role, provider\)/);
    assert.match(aiScript, /function settingsNextAiSetApiKeyPresentation\(role, provider\)/);
    assert.match(aiScript, /settingsNextAiCaptureDraft\(role, event\.target\.dataset\.activeProvider\)/);
    assert.match(aiScript, /role === 'text'[\s\S]*settingsNextAiSyncChatSource\(\)/);
    assert.match(aiScript, /settingsNextMarkScopeDirty\(`ai-\$\{role\}`\)/);
    assert.match(aiScript, /settingsNextClearScopeDirty\(`ai-\$\{role\}`\)/);
    assert.match(script, /'ai-text': '글쓰기 모델'/);
    assert.match(aiScript, /api_key_configured/);
    assert.match(aiScript, /settingsNextAiSetFeedback\(role\)/);
    assert.match(aiScript, /root\.addEventListener\('input', invalidate\)/);
    assert.match(aiScript, /event\.target\.matches\('\[data-ai-field="provider"\]'\)/);
    assert.match(writingScript, /fetchJson\('\/api\/v1\/settings\/writing-profile'\)/);
    assert.match(writingScript, /putJson\('\/api\/v1\/settings\/writing-profile'/);
    assert.match(writingScript, /active_profile: 'custom'/);
    assert.match(writingScript, /const strategy = settingsNextWritingDraft\?\.common\?\.writing_strategy/);
    assert.doesNotMatch(writingScript, /writing_strategy\s*=\s*settingsNextWritingValue/);
    assert.match(writingScript, /settingsNextMarkScopeDirty\('writing'\)/);
    assert.match(writingScript, /settingsNextClearScopeDirty\('writing'\)/);
    assert.match(script, /writing: '글쓰기 기본값'/);
});

test('Settings Beta styling consumes semantic design tokens only', () => {
    const css = read('ui/styles/features/settings-next.css');
    const tabs = read('ui/styles/patterns/tab-navigation.css');
    const cards = read('ui/styles/patterns/settings-card.css');
    const styles = `${tabs}\n${cards}\n${css}`;

    assert.doesNotMatch(styles, /#[0-9a-f]{3,8}|rgba?\(/i);
    assert.doesNotMatch(styles, /!important\b/);
    assert.doesNotMatch(styles, /var\(--(?:brand|surface|text-main|text-muted|line|danger|warning|success)\)/);
    assert.match(tabs, /\.ui-top-tabs/);
    assert.match(tabs, /\.ui-segmented-tabs/);
    assert.match(styles, /var\(--ui-action-primary-soft\)/);
    assert.match(styles, /var\(--ui-focus-ring\)/);
    assert.match(styles, /prefers-reduced-motion/);
});

test('Blog Beta and Settings Beta use the same shared tab patterns', () => {
    const blog = read('ui/partials/views/blog-next.html');
    const settings = read('ui/partials/views/settings-next.html');

    [blog, settings].forEach((html) => {
        assert.match(html, /ui-top-tabs/);
        assert.match(html, /ui-top-tab/);
        assert.match(html, /ui-segmented-tabs/);
        assert.match(html, /ui-segmented-tab/);
    });

    const blogFeatureCss = [
        'ui/styles/features/continuous-publishing.css',
        'ui/styles/features/blog-next-panel-anatomy.css',
        'ui/styles/features/continuous-publishing-usability.css'
    ].map(read).join('\n');
    assert.doesNotMatch(blogFeatureCss, /\.blog-next-tabs\s*\{/);
    assert.doesNotMatch(blogFeatureCss, /\.blog-next-tab-btn\s*\{/);
    assert.doesNotMatch(blogFeatureCss, /\.blog-next-segmented-nav\s*\{/);
    assert.doesNotMatch(blogFeatureCss, /\.blog-next-management-tab\s*\{/);
});

test('Blog Beta and Settings Beta use one shared keyboard tab controller', () => {
    const app = read('ui/app.js');
    const shared = read('ui/scripts/foundation/tab-navigation.js');
    const blogShell = read('ui/scripts/features/blog-next/shell.js');
    const blogQueue = read('ui/scripts/features/blog-next/quick-queue.js');
    const settings = read('ui/scripts/features/settings-next/shell.js');

    assert.match(app, /@include scripts\/foundation\/tab-navigation\.js/);
    assert.match(shared, /function handleUiTabNavigationKeydown/);
    [blogShell, blogQueue, settings].forEach((script) => assert.match(script, /handleUiTabNavigationKeydown/));
    assert.doesNotMatch(blogShell, /function handleBlogNextTabKeydown|function handleBlogNextInputModeKeydown/);
    assert.doesNotMatch(settings, /function settingsNextHandleTabKeydown/);
});

test('Blog Beta and Settings Beta compose the same page clock widget partial', () => {
    const blogSource = read('ui/partials/views/blog-next.html');
    const settingsSource = read('ui/partials/views/settings-next.html');
    const widget = read('ui/partials/views/shared/page-clock-widget.html');
    const clockStyles = read('ui/styles/components/clock.css');
    const dashboardStyles = read('ui/styles/features/dashboard.css');

    assert.match(widget, /class="page-clock-widget"[\s\S]*?data-clock-display/);
    assert.match(blogSource, /@include shared\/page-clock-widget\.html/);
    assert.match(settingsSource, /@include shared\/page-clock-widget\.html/);
    assert.doesNotMatch(blogSource, /<div class="page-clock-widget">/);
    assert.doesNotMatch(settingsSource, /<div class="page-clock-widget">/);
    assert.match(clockStyles, /\.page-clock-widget\s*\{/);
    assert.match(clockStyles, /\.clock-display\s*\{/);
    assert.doesNotMatch(dashboardStyles, /\.page-clock-widget\s*\{/);
    assert.doesNotMatch(dashboardStyles, /(^|\n)\.clock-display\s*\{/);
});

test('Settings Beta cards use one status, one feedback surface, and action-only footers', () => {
    const html = read('ui/partials/views/settings-next.html');
    const actions = read('ui/styles/patterns/actions.css');
    const featureStyles = read('ui/styles/features/settings-next.css');
    const cardStyles = read('ui/styles/patterns/settings-card.css');

    assert.match(actions, /button\.ui-danger-action/);
    assert.match(html, /settings-next-google-disconnect" class="ghost ui-danger-action"/);
    assert.match(html, /settings-next-naver-logout" class="ghost ui-danger-action"/);
    assert.match(html, /settings-next-google-disconnect[\s\S]*settings-next-google-test/);
    assert.match(html, /settings-next-google-status[\s\S]*settings-next-google-detail[\s\S]*settings-next-google-feedback[\s\S]*settings-next-action-row/);
    assert.match(html, /settings-next-naver-status[\s\S]*settings-next-naver-detail[\s\S]*settings-next-naver-feedback[\s\S]*ui-settings-card-footer[\s\S]*settings-next-naver-logout[\s\S]*settings-next-naver-login/);
    assert.match(html, /settings-next-wordpress-status[\s\S]*settings-next-wordpress-feedback[\s\S]*ui-settings-card-footer[\s\S]*settings-next-wordpress-save/);
    assert.equal((html.match(/class="settings-next-completion-group"/g) || []).length, 3);
    assert.equal((html.match(/id="settings-next-(?:google|content|naver|wordpress)-feedback"/g) || []).length, 4);
    assert.doesNotMatch(html, /settings-next-channel-summary/);
    assert.doesNotMatch(html, /settings-next-(?:content|naver|wordpress)-save-status/);
    assert.doesNotMatch(featureStyles, /settings-next-save-status/);
    assert.doesNotMatch(html, />[^<]*저장하고[^<]*<\/button>/);
    assert.doesNotMatch(html, /저장됨/);
    assert.equal((html.match(/class="ui-settings-card(?:\s|")/g) || []).length, 21);
    assert.equal((html.match(/class="ui-settings-readiness-card"/g) || []).length, 9);
    assert.equal((html.match(/class="ui-settings-summary-card"/g) || []).length, 3);
    assert.match(cardStyles, /\.ui-settings-card\s*\{/);
    assert.match(cardStyles, /\.ui-settings-card-footer\s*\{/);
    assert.match(cardStyles, /\.ui-settings-readiness-card\s*\{/);
    assert.match(cardStyles, /\.ui-settings-summary-card/);
    assert.match(cardStyles, /\.ui-settings-shortcut-card/);
    assert.match(featureStyles, /\.settings-next-writing-shortcuts\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(featureStyles, /\.settings-next-writing-field-grid--three\s*\{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(cardStyles, /\.ui-settings-field\s*\{[\s\S]*font-size: var\(--ui-type-label-size\)/);
    assert.match(cardStyles, /\.ui-settings-field small\s*\{/);
    assert.match(cardStyles, /\.ui-settings-field-grid\s*\{/);
    assert.match(cardStyles, /\.ui-settings-choice-group legend\s*\{[\s\S]*font-size: var\(--ui-type-label-size\)/);
    assert.match(cardStyles, /\.ui-settings-choice-group label\s*\{[\s\S]*font-size: var\(--ui-type-label-size\)/);
    assert.match(html, /class="ui-settings-choice-group"><legend>모델 선택<\/legend>/);
    assert.doesNotMatch(featureStyles, /settings-next-ai-source/);
    assert.match(html, /class="ui-settings-field-grid"/);
    assert.doesNotMatch(html, /settings-next-field(?:-grid|-wide)?/);
    assert.doesNotMatch(featureStyles, /\.settings-next-field(?:-grid|-wide)?\b/);
    assert.match(cardStyles, /\.ui-settings-card\s*\{[\s\S]*gap: var\(--ui-space-1\)/);
    assert.match(cardStyles, /\.ui-settings-card-footer\s*\{[\s\S]*margin-block-start: calc\(var\(--ui-space-1\) \* -1\)/);
    assert.doesNotMatch(featureStyles, /\.settings-next-section\s*\{/);
    assert.doesNotMatch(featureStyles, /\.settings-next-readiness-item\s*\{/);
    assert.equal((html.match(/data-settings-next-refresh/g) || []).length, 2);
    assert.equal((html.match(/>새로고침<\/button>/g) || []).length, 2);
    assert.doesNotMatch(html, />상태 새로고침<\/button>/);
    assert.equal((html.match(/aria-busy="false"/g) || []).length, 18);
    assert.match(html, /id="settings-next-load-feedback"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('Settings Beta shows operation loading only on the initiating action', () => {
    const script = read('ui/scripts/features/settings-next/shell.js');
    const styles = read('ui/styles/patterns/settings-card.css');
    const shared = read('ui/scripts/foundation/settings-card.js');
    const app = read('ui/app.js');

    assert.match(script, /button\.textContent = busy \? '연결 확인 중\.\.\.' : '연결 확인'/);
    assert.match(script, /busyAction === 'login' \? '로그인 중\.\.\.' : '로그인'/);
    assert.match(script, /busyAction === 'logout' \? '로그아웃 중\.\.\.' : '로그아웃'/);
    assert.doesNotMatch(script, /SetScopeFeedback\([^\n]*확인 중/);
    assert.doesNotMatch(script, /SetFeedback\('settings-next-wordpress-feedback',\s*'[^']*확인하고 있습니다/);
    assert.doesNotMatch(script, /연결을 확인했습니다\.|로그인했습니다\.|로그아웃했습니다\.|연동 성공/);
    assert.match(styles, /\.ui-settings-card-feedback\s*\{[\s\S]*min-block-size[\s\S]*white-space: nowrap/);
    assert.match(read('ui/scripts/foundation/settings-secrets.js'), /function initOpaqueSettingsSecretToggles/);
    assert.match(app, /@include scripts\/foundation\/settings-card\.js/);
    assert.match(app, /@include scripts\/features\/settings-next\/optional-services\.js/);
    assert.match(shared, /function initUiSettingsCardPattern/);
    assert.match(shared, /data-settings-card-target/);
    assert.match(shared, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    assert.doesNotMatch(script, /function settingsNextJumpToConfiguration/);
});
