'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui/partials/views/site-hosting.html'), 'utf8');
const creation = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/site-creation-navigation.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/site-profile-fields.js'), 'utf8');
const creationStyles = fs.readFileSync(path.join(root, 'ui/styles/features/site-hosting-create.css'), 'utf8');

test('site creation exposes optional site SEO fields with indexing enabled by default', () => {
    assert.match(html, /id="site-name"[^>]*required/);
    assert.match(html, /id="site-description"[^>]*maxlength="300"/);
    assert.match(html, /id="site-share-image"/);
    assert.match(html, /id="site-favicon"/);
    assert.match(html, /id="site-search-indexing" type="checkbox" checked/);
    assert.match(html, /가로형 권장 \(예: 600×200px\)/);
    assert.match(html, /권장 1200×630px/);
    assert.match(html, /정사각형 512×512px 권장/);
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
    const picker = fs.readFileSync(path.join(root, 'src/ui-api/services/site-hosting-site.service.js'), 'utf8');
    assert.ok(picker.indexOf('await nativeDialog.showOpenDialog') < picker.indexOf('await templates.prepare?.(templateId)'));
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
    const card = runtime.slice(runtime.indexOf('function siteHostingSiteCard('), runtime.indexOf('function siteHostingSiteMessage('));
    assert.doesNotMatch(html, /id="site-hosting-feedback"/);
    assert.ok(card.indexOf('siteHostingSiteAddresses(site, domainConnect)') < card.indexOf('data-site-message=')
        && card.indexOf('data-site-message=') < card.indexOf('site-hosting-site-card-footer'));
    assert.match(runtime, /siteHostingSetSiteOperation\(siteId, 'success', '주소를 복사했습니다\.'/);
    assert.match(runtime, /data-site-template-refresh/);
    assert.match(runtime, /siteHostingCheckTemplateUpdates\('', false\)/);
    assert.match(runtime, /siteHostingCheckTemplateUpdates\(siteHostingSelectedProject\?\.id \|\| '', true\)/);
    assert.match(runtime, /await fetchJson\('\/api\/v1\/site-hosting\/templates'\)/);
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
    assert.match(creation, /submit\.disabled = !siteHostingCreateRequirementsMet\(\) \|\| settingsUnchanged \|\| previewRequired/);
    assert.match(html, /id="site-settings-current-preview"/);
    assert.match(html, /id="site-settings-current-preview-image"/);
    assert.match(creation, /site\.screenshot_url\s*\|\| `\/api\/v1\/site-hosting\/projects/);
    assert.match(creationStyles, /#site-create-dialog\.is-site-settings-mode \.site-create-workspace \{\s*grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, 0\.95fr\)/);
    assert.match(creationStyles, /#site-create-dialog\.is-site-settings-mode #site-template-grid \{\s*display: none/);
});
