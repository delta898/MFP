const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('topic table and editor expose the same three image modes', () => {
    const topics = read('ui/partials/views/blog/topics.html');
    const overlays = read('ui/partials/overlays.html');
    const script = read('ui/scripts/features/content/blog-topics.js');

    assert.match(topics, /data-sort-key="imageMode"[\s\S]*이미지 처리/);
    assert.match(overlays, /id="blog-edit-image-mode"[\s\S]*value="generate"[\s\S]*value="prompt_only"[\s\S]*value="none"/);
    assert.match(script, /class="inline-image-mode"/);
    assert.match(script, />이미지 생성<\/option>/);
    assert.match(script, />프롬프트 포함<\/option>/);
    assert.match(script, />미포함<\/option>/);
    assert.doesNotMatch(overlays, /id="blog-edit-image-required"/);
});

test('automatic blog collection owns a default mode for newly stored topics', () => {
    const autoView = read('ui/partials/views/blog/auto.html');
    const autoScript = read('ui/scripts/features/automation/blog.js');
    const configSample = read('config/config.json.sample');

    assert.match(autoView, /id="blog-publish-auto-image-mode"[\s\S]*value="generate"[\s\S]*value="prompt_only"[\s\S]*value="none"/);
    assert.match(autoScript, /PUBLISH_AUTO_IMAGE_MODE: imageModeEl\?\.value \|\| 'generate'/);
    assert.match(configSample, /"image_mode": "generate"/);
});

test('sheet adapter keeps canonical mode and legacy boolean compatibility', () => {
    const utils = read('src/utils.js');
    const options = read('src/content/publish-sheet-options.js');

    assert.match(utils, /'이미지 처리'/);
    assert.match(utils, /'프롬프트 포함'/);
    assert.match(utils, /formatSheetImageModeValue/);
    assert.match(options, /image_mode/);
    assert.match(options, /legacyGenerate/);
});

test('WYSIWYG manuscript publishing owns images in slots and drafts only for actual unresolved targets', () => {
    const manuscriptView = read('ui/partials/views/blog-next/quick-draft-modes.html');
    const manuscriptScript = `${read('ui/scripts/features/blog-next/draft-inputs.js')}\n${read('ui/scripts/features/blog-next/draft-execution.js')}`;
    const core = read('src/core.js');

    assert.doesNotMatch(manuscriptView, /data-draft-field="image-mode"/);
    assert.match(manuscriptScript, /imageMode: 'prompt_only'/);
    assert.match(manuscriptScript, /missingCount > 0 && settings\.postStatus !== 'draft'/);
    assert.match(manuscriptScript, /if \(changedToDraft\) select\.value = 'draft'/);
    assert.match(manuscriptScript, /selectedStatus === 'draft' \? '임시 저장'/);
    assert.doesNotMatch(core, /if \(options\.imageGeneration === false\) \{\s*hasImageWarnings = true;/);
    assert.doesNotMatch(core, /이미지 미생성 옵션으로 인해 Draft로 강제 전환/);
    assert.match(core, /발행 대상으로 남은 이미지의 누락\/업로드 실패 시 Draft 강제/);
});
