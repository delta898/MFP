const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('writing settings exposes a minimal profile surface', () => {
    const settings = read('ui/partials/views/settings.html');
    const writing = read('ui/partials/views/settings/writing.html');
    const naverBlog = read('ui/partials/views/settings/naver-blog.html');

    assert.match(settings, /data-settings-tab="writing"/);
    assert.match(settings, /@include settings\/writing\.html/);
    assert.match(writing, /name="settings-writing-profile-kind" value="default"/);
    assert.match(writing, /name="settings-writing-profile-kind" value="custom"/);
    assert.match(writing, /<strong>기본 프로필<\/strong>/);
    assert.match(writing, /나만의 문체와 구성 설정/);
    assert.doesNotMatch(writing, /문체와 구성을 나에게 맞게 설정/);
    assert.doesNotMatch(writing, /제품 기본 프로필/);
    assert.equal((writing.match(/data-writing-custom-detail/g) || []).length, 2);
    assert.equal((writing.match(/data-writing-custom-only/g) || []).length, 2);
    assert.doesNotMatch(writing, /settings-writing-setup-method/);
    assert.match(writing, /<section id="settings-writing-reference-section"/);
    assert.doesNotMatch(writing, /<details id="settings-writing-reference-section"/);
    assert.match(writing, /참고 글로 자동 설정/);
    assert.match(writing, /참고할 글을 붙여넣거나 URL을 입력해 주세요/);
    assert.doesNotMatch(writing, /자료 없음/);
    assert.doesNotMatch(writing, /분석하면 아래 설정을 자동으로 채웁니다/);
    assert.doesNotMatch(writing, /분석 후에도 원하는 대로 바꿀 수 있습니다/);
    assert.match(writing, /참고 글 분석하기/);
    assert.equal((writing.match(/AI 설정의 글쓰기 모델/g) || []).length, 2);
    assert.match(writing, /참고 글 자동 설정 AI 도움말/);
    assert.match(writing, /AI 적용 미리 보기 모델 도움말/);
    assert.equal((writing.match(/data-writing-reference-url data-writing-reference-field/g) || []).length, 1);
    assert.match(writing, /id="settings-writing-reference-text-counter"/);
    assert.match(writing, /rows="8" maxlength="12000"/);
    assert.match(writing, /id="settings-writing-common-instruction"/);
    assert.match(writing, /id="settings-writing-common-instruction-counter"/);
    assert.match(writing, /rows="5" maxlength="500"/);
    assert.match(writing, /추가 작성 원칙/);
    assert.match(writing, /<h3>글쓰기 방식<\/h3><p>블로그와 쇼핑 글에 함께 적용됩니다\.<\/p>/);
    assert.doesNotMatch(writing, /<h3>문체<\/h3>/);
    assert.match(writing, /글쓰기 방식[\s\S]*settings-blog-writing-strategy-search[\s\S]*표현 방식[\s\S]*추가 작성 원칙[\s\S]*<h3>블로그 글 구성<\/h3>/);
    assert.match(writing, /name="settings-blog-writing-strategy" value="search" data-writing-profile-field/);
    assert.match(writing, /name="settings-blog-writing-strategy" value="discovery" data-writing-profile-field/);
    assert.doesNotMatch(writing, /프로필과 별개인 전역 전략/);
    assert.doesNotMatch(writing, /id="settings-writing-blog-instruction"/);
    assert.doesNotMatch(writing, /id="settings-writing-shopping-instruction"/);
    assert.doesNotMatch(writing, /id="settings-writing-blog-narrator"/);
    assert.doesNotMatch(writing, /id="settings-writing-blog-headings"/);
    assert.doesNotMatch(writing, /id="settings-writing-blog-author-context"/);
    assert.doesNotMatch(writing, /id="settings-writing-density"/);
    assert.match(writing, /id="settings-writing-reference-analyze"/);
    assert.match(writing, /블로그 URL/);
    assert.match(writing, /https:\/\/ 참고 블로그 URL/);
    assert.doesNotMatch(writing, /참고 블로그 URL [23]/);
    assert.doesNotMatch(writing, /id="settings-writing-profile-save"/);
    assert.doesNotMatch(writing, /수동 실행/);
    assert.doesNotMatch(writing, /설정은 자동으로 저장되지 않습니다/);
    assert.doesNotMatch(writing, /글쓰기 탭을 열면 프로필을 불러옵니다/);
    assert.match(writing, /id="settings-writing-preview-generate"/);
    assert.match(writing, /<label id="settings-writing-preview-topic-field">주제/);
    assert.match(writing, />미리 보기 생성<\/button>/);
    assert.doesNotMatch(writing, /settings-writing-preview-fixture-note/);
    assert.match(writing, /400~600자 샘플/);
    assert.doesNotMatch(writing, /종류와 주제를 정한 뒤/);
    assert.doesNotMatch(naverBlog, /settings-blog-writing-strategy/);
    assert.doesNotMatch(naverBlog, /콘텐츠 문체/);
});

test('writing profile UI uses the dedicated API and joins the global settings save lifecycle', () => {
    const script = read('ui/scripts/features/settings/writing-profile-settings.js');
    assert.match(script, /fetchJson\('\/api\/v1\/settings\/writing-profile'\)/);
    assert.match(script, /putJson\('\/api\/v1\/settings\/writing-profile'/);
    assert.doesNotMatch(script, /renderSettingsWritingSummaries/);
    assert.match(script, /default_profile_overrides/);
    assert.match(script, /getEffectiveSettingsWritingDefaultProfile/);
    assert.match(script, /captureSettingsWritingProfileKind/);
    assert.match(script, /settingsWritingProfileDirty/);
    assert.match(script, /writing-profile\/references\/analyze/);
    assert.doesNotMatch(script, /setup_method/);
    assert.doesNotMatch(script, /저장되지 않은 프로필 변경사항이 있습니다/);
    assert.doesNotMatch(script, /기본 프로필이 적용 중입니다/);
    assert.doesNotMatch(script, /내 프로필이 전체 글 생성에 적용 중입니다/);
    assert.match(script, /syncSettingsWritingReferenceCounter/);
    assert.match(script, /custom\.common\.voice = cloneSettingsWritingProfile\(result\.fingerprint\.surface\)/);
    assert.match(script, /result\.fingerprint\.settings\.length_preset/);
    assert.match(script, /result\.fingerprint\.settings\.opening/);
    assert.match(script, /result\.fingerprint\.settings\.development/);
    assert.match(script, /result\.fingerprint\.settings\.ending/);
    assert.match(script, /current\.common\.writing_strategy = getSelectedSettingsRadioValue/);
    assert.match(script, /이전 분석 결과는 그대로 보존/);
    assert.match(script, /writing-profile\/preview/);
    assert.match(script, /샘플 \$\{result\.sample_length\}자/);
    assert.match(script, /addEventListener\('click', generateSettingsWritingPreview\)/);
    assert.match(script, /clearSettingsWritingPreviewResult/);
    assert.match(script, /AI가 미리보기를 생성하고 있습니다\$\{frames\[frameIndex\]\}/);
    assert.match(script, /button\.textContent = '생성 중…'/);
    assert.match(script, /clearInterval\(settingsWritingPreviewProgressTimer\)/);
    assert.match(script, /고정된 예시 상품으로 미리 보기를 생성합니다/);
    assert.match(script, /topicInput\.disabled = true/);
    assert.match(script, /topicInput\.dataset\.blogTopic/);
    assert.match(script, /if \(result\) result\.hidden = true/);
    assert.match(script, /section\.hidden = !editable/);
    assert.match(script, /field\.hidden = !editable/);
    assert.match(script, /resetButton\.hidden = !editable/);
    assert.match(read('ui/scripts/features/settings/save-lifecycle.js'), /settingsWritingProfileDirty === true/);
    assert.match(read('ui/scripts/features/settings/shopping-images.js'), /await saveSettingsWritingProfile\(\)/);
    assert.match(read('ui/scripts/features/settings/major-form.js'), /if \(!settingsWritingProfileDirty\)/);
    assert.match(read('ui/scripts/features/settings/major-form.js'), /currentBlogWritingStrategy = fields\.BLOG_WRITING_STRATEGY/);
    const styles = read('ui/styles/features/writing-settings.css');
    assert.match(styles, /\.writing-settings-grid > label,[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;/);
    assert.match(styles, /\.writing-settings-section textarea,[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;/);
    assert.match(styles, /button\.is-loading::before/);
    assert.match(styles, /@keyframes writing-preview-spin/);
});

test('individual blog writing screens expose one shared three-state image mode', () => {
    const quick = read('ui/partials/views/blog/quick.html');
    const controllers = read('ui/scripts/features/legacy-actions-controllers.js');
    const preferences = read('ui/scripts/features/publishing/shared-preferences.js');

    for (const id of ['quick-image-mode', 'quick-manuscript-image-mode', 'quick-pasted-image-mode']) {
        assert.match(quick, new RegExp(`<select id="${id}">[\\s\\S]*value="generate"[\\s\\S]*value="prompt_only"[\\s\\S]*value="none"`));
    }
    assert.equal((quick.match(/>이미지 처리</g) || []).length, 3);
    assert.equal((quick.match(/>이미지 생성</g) || []).length, 3);
    assert.equal((quick.match(/>이미지 프롬프트만 포함</g) || []).length, 3);
    assert.equal((quick.match(/>이미지 사용 안 함</g) || []).length, 3);
    assert.match(controllers, /imageMode: \(document\.getElementById\('quick-image-mode'\)\?\.value \|\| 'prompt_only'\)/);
    assert.match(controllers, /imageMode: \(getEl\('imageMode'\)\?\.value \|\| 'prompt_only'\)/);
    assert.match(preferences, /key: 'pub_pref_blog_image_mode'/);
    assert.match(preferences, /default: 'prompt_only'/);
    const publishingStyles = read('ui/styles/features/publishing.css');
    const responsiveStyles = read('ui/styles/layout/responsive.css');
    assert.match(publishingStyles, /\.blog-quick-image-mode select \{[\s\S]*border: 1px solid var\(--line\);[\s\S]*font-size: 13px;/);
    assert.match(publishingStyles, /\.blog-quick-image-mode select:focus \{[\s\S]*box-shadow: 0 0 0 3px var\(--brand-light\);/);
    assert.match(responsiveStyles, /body\.mobile-quick-mode \.blog-quick-image-mode \{[\s\S]*grid-column: 1 \/ -1;/);
});
