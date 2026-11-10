'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui/partials/views/site-hosting.html'), 'utf8');
const creation = [
    'site-creation-validation.js',
    'site-creation-navigation.js'
].map((file) => fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting', file), 'utf8')).join('\n');
const profile = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/site-profile-fields.js'), 'utf8');
const creationStyles = [
    'site-hosting-create.css',
    'site-hosting-import.css',
    'site-template-details.css'
].map((file) => fs.readFileSync(path.join(root, 'ui/styles/features', file), 'utf8')).join('\n');
const siteHostingStyles = fs.readFileSync(path.join(root, 'ui/styles/features/site-hosting.css'), 'utf8');

test('site creation exposes optional site SEO fields with indexing enabled by default', () => {
    assert.match(html, /id="site-name"[^>]*required/);
    assert.match(html, /id="site-description"[^>]*maxlength="300"/);
    assert.match(html, /id="site-share-image"/);
    assert.match(html, /id="site-favicon"/);
    assert.match(html, /id="site-search-indexing" type="checkbox" checked/);
    assert.match(html, /가로형 권장 \(예: 600×200px\)/);
    assert.match(html, /권장 1200×630px/);
    assert.match(html, /정사각형 512×512px 권장/);
    assert.equal((html.match(/PNG, JPG, WebP · 3MB 이하/g) || []).length, 6);
    assert.doesNotMatch(html, /PNG, JPG, WebP · 1MB 이하/);
    assert.match(profile, /SITE_PROFILE_IMAGE_MAX_BYTES = 3 \* 1024 \* 1024/);
    assert.doesNotMatch(html, /글에는 적용되지 않음|검색 제외 신호를 보냅니다/);
    assert.match(creation, /search_engine_indexing: document\.getElementById\('site-search-indexing'\)\?\.checked !== false/);
    assert.doesNotMatch(creation, /search_indexing:/);
});

test('template-declared Vault and publication settings render after shared Site settings', () => {
    const sharedSettings = html.indexOf('<div class="site-profile-fields">');
    const navigation = html.indexOf('id="site-navigation-fields"');
    const setupInputs = html.indexOf('id="site-template-setup-inputs"');
    assert.ok(sharedSettings >= 0 && navigation > sharedSettings && setupInputs > navigation);
    assert.match(creation, /item\?\.type === 'frontmatter_match' && item\?\.purpose === 'publication_filter'/);
    assert.match(creation, /value="all" data-site-setup-id=.*data-site-setup-mode/);
    assert.match(creation, /value="frontmatter" data-site-setup-id=.*data-site-setup-mode/);
    assert.match(creation, /data-site-setup-field="field"/);
    assert.match(creation, /data-site-setup-field="value"/);
    assert.match(creation, /data-site-setup-field="field"[^>]*\$\{mode === 'all' \? 'disabled' : ''\}/);
    assert.match(creation, /data-site-setup-field="value"[^>]*\$\{mode === 'all' \? 'disabled' : ''\}/);
    assert.match(creation, /placeholder="예: is_public"/);
    assert.match(creation, /placeholder="예: true"/);
    assert.match(creation, /setupInputs\[item\.id\] = \{ mode: 'all' \}/);
    assert.match(creation, /site-template-match-fields/);
    assert.match(creationStyles, /\.site-publication-mode-options input\[type="radio"\][\s\S]*?width: 1rem;[\s\S]*?min-height: 1rem;/);
    assert.match(creationStyles, /\.site-publication-mode-options \{[\s\S]*?gap: var\(--ui-space-1\);/);
    assert.match(creation, /siteHostingCreateSetupInputs\[inputId\] = String\(result\?\.path \|\| ''\)/);
    assert.match(creation, /site-template-setup-input-path\$\{selectedPath \? ' is-selected' : ''\}/);
    assert.match(creation, /\.\.\.\(Object\.keys\(setupInputs\)\.length \? \{ setup_inputs: setupInputs \} : \{\}\)/);
    const picker = fs.readFileSync(path.join(root, 'src/applications/site-hosting/application/site-service.js'), 'utf8');
    assert.ok(picker.indexOf('await nativeDialog.showOpenDialog') < picker.indexOf('await templates.prepare?.(templateId)'));
});

test('template cards switch the picker to an inline detail view with curated metadata', () => {
    assert.match(creation, /data-site-template-details="\$\{siteHostingEscapeHtml\(template\.id\)\}"/);
    assert.match(creation, /aria-label="\$\{siteHostingEscapeHtml\(template\.name\)\} 크게 보기"/);
    assert.match(creation, /siteHostingOpenTemplateDetails\(templateDetails\.dataset\.siteTemplateDetails\)/);
    assert.match(creation, /siteHostingCloseTemplateDetails\(\)/);
    assert.match(creation, /siteHostingCreateMode === 'create'[\s\S]*siteHostingCloseTemplateDetails\(\)/);
    assert.match(creation, /grid\.hidden = true;[\s\S]*details\.hidden = false/);
    assert.match(creation, /details\.hidden = true;[\s\S]*grid\.hidden = false/);
    assert.match(creation, /<dt>계열<\/dt>/);
    assert.match(creation, /<dt>작성자<\/dt>/);
    assert.match(creation, /<dt>버전<\/dt>/);
    assert.match(creation, /지원 기능/);
    assert.match(creation, /Digital Garden Vault 연결/);
    assert.match(creation, /noopener noreferrer/);
    assert.match(creationStyles, /\.site-template-card-zoom/);
    assert.match(creationStyles, /\.site-template-detail-view/);
    assert.match(creationStyles, /\.site-template-detail-metadata/);
    const view = fs.readFileSync(path.join(root, 'ui/partials/views/site-hosting.html'), 'utf8');
    assert.match(view, /id="site-template-detail-view"/);
    assert.match(view, /id="site-template-detail-close"[\s\S]*aria-label="템플릿 상세 정보 닫기"/);
    assert.doesNotMatch(view, /템플릿 목록/);
    assert.doesNotMatch(view, /id="site-template-details"/);
    assert.doesNotMatch(creation, /site-create-preview-dialog[\s\S]{0,300}site-template-details/);
});

test('Garden preview displays the Vault conversion summary when available', () => {
    const runtime = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/project-management.js'), 'utf8');
    assert.match(creation, /공개 노트 \$\{collection\.published_note_count\}개/);
    assert.match(creation, /제외 \$\{collection\.excluded_note_count\}개/);
    assert.match(creation, /첨부 \$\{collection\.copied_resource_count\}개/);
    assert.match(creation, /미해결 링크 \$\{collection\.unresolved_link_count\}개/);
    assert.match(creation, /누락 첨부 \$\{collection\.missing_resource_count\}개/);
    assert.match(runtime, /공개 \$\{collection\.published_note_count\}개/);
    assert.match(runtime, /확인 필요 링크 \$\{collection\.unresolved_link_count \+ collection\.missing_resource_count\}개/);
});

test('site cards own operation messages and template checks refresh on entry and on demand', () => {
    const runtime = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/project-management.js'), 'utf8');
    const domains = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/domains.js'), 'utf8');
    const card = runtime.slice(runtime.indexOf('function siteHostingSiteCard('), runtime.indexOf('function siteHostingSiteMessage('));
    assert.doesNotMatch(html, /id="site-hosting-feedback"/);
    assert.ok(card.indexOf('siteHostingSiteAddresses(site, domainConnect, hasDeploymentAddress, operation)') < card.indexOf('data-site-message=')
        && card.indexOf('data-site-message=') < card.indexOf('site-hosting-site-card-footer'));
    assert.match(card, /domainConnectOpen \? siteHostingSiteDomainConnectPanel\(site, domainConnect\) : siteHostingSiteAddresses\(site, domainConnect, hasDeploymentAddress, operation\)/);
    assert.match(runtime, /siteHostingSetSiteOperation\(siteId, 'success', '주소를 복사했습니다\.'/);
    assert.match(runtime, /data-site-template-refresh/);
    assert.match(runtime, /siteHostingCheckTemplateUpdates\('', false\)/);
    assert.match(runtime, /siteHostingCheckTemplateUpdates\(siteHostingSelectedProject\?\.id \|\| '', true\)/);
    assert.match(runtime, /await fetchJson\('\/api\/v1\/site-hosting\/templates'\)/);
    assert.match(runtime, /data-site-domain-disconnect=/);
    assert.match(runtime, /data-site-worker-disconnect=/);
    assert.match(runtime, /data-tooltip="기본 연결 해지"/);
    assert.match(runtime, /function siteHostingWorkerDisconnectIsDisabled\(site, operation = null/);
    assert.match(runtime, /managed_by_app !== true[\s\S]*?worker_account_id[\s\S]*?worker_created_on[\s\S]*?operation\?\.phase === 'running'/);
    assert.match(runtime, /workerDisconnect\.disabled = siteHostingWorkerDisconnectIsDisabled\(site, operation\)/);
    assert.match(domains, /async function siteHostingDisconnectWorker/);
    assert.match(domains, /기본 연결 해지 전에 연결 도메인을 먼저 해지해 주세요\./);
    assert.match(domains, /Worker 소유권과 도메인 상태를 확인한 뒤 기본 연결을 해지하고 있습니다/);
    assert.match(domains, /로컬 사이트 파일과 설정은 유지됩니다/);
    assert.match(runtime, /siteHostingUnlinkIcon\(\)/);
    assert.match(runtime, /data-site-address-tools-toggle/);
    assert.match(runtime, /siteHostingAddressTools\('domain'/);
    assert.match(runtime, /data-tooltip="도메인 연결 해지"/);
    assert.match(runtime, /data-tooltip="연결 도메인 복사"/);
    assert.match(runtime, /data-tooltip="연결 도메인 열기"/);
    assert.match(runtime, /<span class="site-hosting-address-label">기본 연결<\/span>/);
    assert.match(runtime, /siteHostingUnlinkIcon\(\)[\s\S]*?siteHostingCopyIcon\(\)[\s\S]*?siteHostingExternalLinkIcon\(\)/);
    const addressRenderer = runtime.slice(runtime.indexOf('function siteHostingSiteAddresses('), runtime.indexOf('function siteHostingAddressTools('));
    const workerActions = addressRenderer.slice(addressRenderer.indexOf('const workerActions'), addressRenderer.indexOf('const domainActions'));
    const domainActions = addressRenderer.slice(addressRenderer.indexOf('const domainActions'), addressRenderer.indexOf('return `<div class="site-hosting-site-addresses"'));
    for (const [platform, actions, disconnectLabel, copyLabel, openLabel] of [
        ['worker', workerActions, '기본 연결 해지', '기본 주소 복사', '기본 주소 열기'],
        ['domain', domainActions, '도메인 연결 해지', '연결 도메인 복사', '연결 도메인 열기']
    ]) {
        assert.ok(actions.indexOf(disconnectLabel) < actions.indexOf(copyLabel)
            && actions.indexOf(copyLabel) < actions.indexOf(openLabel), `${platform} address actions should be disconnect, copy, open`);
    }
    assert.doesNotMatch(runtime, /workerAddress/);
    assert.match(workerActions, /const workerActions = workerHref[\s\S]*?siteHostingAddressTools\('worker'[\s\S]*?: ''/);
    assert.match(addressRenderer, /workerHref \? '' : '<span class="site-hosting-address-empty">배포 후 연결됩니다\.<\/span>'/);
    assert.match(runtime, /content\.addEventListener\('pointerover'/);
    assert.match(runtime, /content\.addEventListener\('keydown'/);
    assert.match(runtime, /aria-expanded="false"/);
    assert.match(siteHostingStyles, /\.site-hosting-address-tools\.is-open \.site-hosting-address-reveal/);
    assert.match(siteHostingStyles, /\.site-hosting-site-addresses \{[\s\S]*?height: 4\.75rem;[\s\S]*?padding: var\(--ui-space-1\) var\(--ui-space-3\);/);
    assert.match(siteHostingStyles, /\.site-hosting-site-address-area \{\s*height: 4\.75rem;/);
    assert.match(domains, /showUiConfirm\([\s\S]*?title: '도메인 연결 해지'/);
    assert.match(domains, /custom-domain-disconnect`/);
    assert.match(domains, /기본 주소와 Worker는 유지됩니다/);
});

test('empty Site project explains that the user can create the first Site', () => {
    const runtime = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/project-management.js'), 'utf8');
    assert.match(runtime, /siteCount === 0 \? '<p class="site-hosting-empty-hint">아직 사이트가 없습니다\. 사이트 추가를 눌러 첫 사이트를 만들어 주세요\.<\/p>'/);
});

test('site creation footer places guarded cancel on the left and preview/create on the right', () => {
    const cancel = html.indexOf('data-site-create-cancel');
    const preview = html.indexOf('data-site-create-preview');
    const create = html.indexOf('사이트 만들기</button>', preview);
    assert.ok(cancel >= 0 && cancel < preview && preview < create);
    assert.match(html, /id="site-create-cancel-dialog"/);
    assert.match(html, /value="stay">계속 작성/);
    assert.match(html, /value="confirm">취소하고 닫기/);
    assert.match(creation, /siteHostingRequestCreateCancel/);
    assert.match(creation, /siteHostingCreateFormSnapshot\(\) !== siteHostingCreateInitialSnapshot/);
    assert.match(creation, /confirmation\.returnValue === 'confirm'/);
});

test('site profile image helpers are isolated for reuse by future site settings', () => {
    assert.match(profile, /function siteHostingReadProfileImage/);
    assert.match(profile, /function siteHostingSetProfileImagePreview/);
    assert.match(creation, /siteHostingReadProfileImage\(input\.files\[0\], field\.label\)/);
});

test('site settings reuse the creation preview without exposing template selection', () => {
    const runtime = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/project-management.js'), 'utf8');
    assert.match(runtime, /siteHostingOpenSiteSettingsDialog\(siteSettings\.dataset\.siteSettings\)/);
    assert.match(creation, /async function siteHostingOpenSiteSettingsDialog\(siteId\)/);
    assert.match(creation, /is-site-settings-mode/);
    assert.match(creation, /설정을 바꾸고 미리보기에서 확인한 뒤 반영하세요/);
    assert.match(creation, /변경사항 반영/);
    assert.match(creation, /const settingsUnchanged = siteHostingCreateMode === 'settings'/);
    assert.match(creation, /submit\.disabled = !siteHostingCreateRequirementsMet\(\) \|\| settingsUnchanged/);
    assert.match(html, /id="site-settings-current-preview"/);
    assert.match(html, /id="site-settings-current-preview-image"/);
    assert.match(html, /id="site-settings-template-summary"[\s\S]*id="site-settings-template-name"[\s\S]*id="site-settings-template-family"[\s\S]*id="site-settings-template-version"/);
    assert.match(creation, /site\.screenshot_url\s*\|\| `\/api\/v1\/site-hosting\/projects/);
    assert.match(creation, /currentTemplate\.name \|\| site\.template_name/);
    assert.match(creation, /currentTemplate\.family_name \|\| '—'/);
    assert.match(creation, /currentTemplate\.version \|\| '—'/);
    assert.match(creationStyles, /\.site-settings-template-summary/);
    assert.match(creationStyles, /#site-create-dialog\.is-site-settings-mode \.site-create-workspace \{\s*grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, 0\.95fr\)/);
    assert.match(creationStyles, /#site-create-dialog\.is-site-settings-mode #site-template-grid \{\s*display: none/);
});

test('site deletion uses a compact confirmation, locks the card while running, and offers archive path copy', () => {
    const runtime = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/project-management.js'), 'utf8');
    assert.match(runtime, /data-site-delete="\$\{siteId\}"/);
    assert.match(runtime, /siteHostingSiteOperationIsRunning\(site\.project_id, site\.id\) \? 'disabled data-operation-disabled="true"'/);
    assert.match(runtime, /async function siteHostingDeleteSite/);
    assert.match(runtime, /\/delete-plan/);
    assert.match(runtime, /\/delete`/);
    assert.match(runtime, /confirmed: true, plan_id: plan\.id/);
    assert.match(runtime, /connectionSummary[\s\S]*로컬 파일은 영구 삭제하지 않고 보관합니다/);
    assert.match(runtime, /step\.kind === 'archive'/);
    assert.match(runtime, /\$\{archiveStep\.label\}/);
    assert.match(runtime, /삭제 중 · 연결 정리 및 파일 보관/);
    assert.match(runtime, /lockAllActions: true/);
    assert.match(runtime, /ui-spinner ui-spinner-accent/);
    assert.match(runtime, /function siteHostingSyncSiteCardOperationState/);
    assert.match(runtime, /function siteHostingNeedsCloudflareSettings/);
    assert.match(runtime, /function siteHostingOpenCloudflareSettings[\s\S]*navigateToSettingsNextTarget\('core', 'settings-next-cloudflare-card', 'hosting'\)/);
    assert.match(runtime, /data-site-cloudflare-settings/);
    const accountSelection = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/cloudflare-account-selection.js'), 'utf8');
    assert.match(accountSelection, /CLOUDFLARE_CONNECTION_REQUIRED/);
    const domains = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/domains.js'), 'utf8');
    assert.match(runtime, /siteHostingNeedsCloudflareSettings\(operation\)[\s\S]*data-site-cloudflare-settings/);
    assert.doesNotMatch(domains, /<p data-state="error" role="alert">/);
    assert.match(domains, /siteHostingSetSiteOperation\(siteId, 'error', state\.message/);
    assert.match(domains, /siteHostingSetSiteOperation\(siteId, 'error', state\.message, \{ code: error\.code \|\| error\.apiCode \|\| '' \}\)/);
    assert.match(domains, /siteHostingSetSiteOperation\(siteId, 'error', state\.message[\s\S]*?siteHostingDomainConnectStates\.delete\(key\)/);
    assert.match(runtime, /content\.querySelectorAll\('\.site-hosting-site-card'\)\.forEach/);
    assert.match(runtime, /data-site-card-id="\$\{siteId\}"/);
    assert.match(runtime, /tertiaryText: '경로 복사'/);
    assert.match(runtime, /navigator\.clipboard\.writeText/);
    assert.match(runtime, /보관 위치/);
    assert.match(runtime, /보관 경로를 복사했습니다/);
    assert.match(runtime, /siteHostingSites = siteHostingSites.filter\(\(item\) => item.id !== siteId\)/);
    assert.match(siteHostingStyles, /\.site-hosting-operation-status[\s\S]*?display: inline-flex;[\s\S]*?align-items: center/);
    assert.match(siteHostingStyles, /\.site-hosting-site-card\[aria-busy="true"\] \.site-hosting-site-preview,[\s\S]*?opacity: \.55;/);
});
