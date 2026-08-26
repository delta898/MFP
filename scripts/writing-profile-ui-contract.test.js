const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('writing settings exposes one global profile surface with separated blog and shopping instructions', () => {
    const settings = read('ui/partials/views/settings.html');
    const writing = read('ui/partials/views/settings/writing.html');
    const naverBlog = read('ui/partials/views/settings/naver-blog.html');

    assert.match(settings, /data-settings-tab="writing"/);
    assert.match(settings, /@include settings\/writing\.html/);
    assert.match(writing, /name="settings-writing-profile-kind" value="default"/);
    assert.match(writing, /name="settings-writing-profile-kind" value="custom"/);
    assert.match(writing, /id="settings-writing-common-instruction"/);
    assert.match(writing, /id="settings-writing-blog-instruction"/);
    assert.match(writing, /id="settings-writing-shopping-instruction"/);
    assert.match(writing, /제품 기본 쇼핑 구성 유지/);
    assert.match(writing, /참고 문장과 블로그 URL 분석은 다음 개발 단계에서 활성화/);
    assert.doesNotMatch(naverBlog, /settings-blog-writing-strategy/);
    assert.doesNotMatch(naverBlog, /콘텐츠 문체/);
});

test('writing profile UI uses the dedicated API and renders exact instant blog summaries', () => {
    const script = read('ui/scripts/features/settings/writing-profile-settings.js');
    assert.match(script, /fetchJson\('\/api\/v1\/settings\/writing-profile'\)/);
    assert.match(script, /putJson\('\/api\/v1\/settings\/writing-profile'/);
    assert.match(script, /short: \{ label: '짧게', chars: '900~1,200자', headings: 'H2 3개', images: 3 \}/);
    assert.match(script, /standard: \{ label: '보통', chars: '1,500~1,800자', headings: 'H2 4~5개', images: 4 \}/);
    assert.match(script, /long: \{ label: '길게', chars: '2,200~2,800자', headings: 'H2 5~6개', images: 5 \}/);
    assert.match(script, /el\.disabled = !editable/);
    assert.match(script, /settingsWritingProfileDirty/);
    assert.match(read('ui/scripts/features/settings/major-form.js'), /if \(!settingsWritingProfileDirty\)/);
});
