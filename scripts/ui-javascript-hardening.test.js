const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

function composedScript() {
    return createJsCompositionRuntime({ fs, path }).composeJsFile({ uiRoot }).js;
}

test('composed UI script has no duplicate top-level function declarations', () => {
    const names = Array.from(
        composedScript().matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
        (match) => match[1]
    );
    const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
    assert.deepEqual(duplicates, []);
});

test('blog collection status targets the rendered result element', () => {
    const source = fs.readFileSync(path.join(uiRoot, 'scripts/features/automation/blog-collect-ui.js'), 'utf8');
    assert.match(source, /getElementById\('blog-collect-trends-result'\)/);
    assert.doesNotMatch(source, /getElementById\('blog-collect-result'\)/);
});

test('legacy action binding remains bounded until lifecycle extraction', () => {
    const filePath = path.join(uiRoot, 'scripts/features/legacy-actions-controllers.js');
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').length - 1;
    assert.equal(lines <= 2600, true, `legacy action binding has ${lines} lines`);
});

test('UI lifecycle has one bootstrap and one binding registration path', () => {
    const source = fs.readFileSync(path.join(uiRoot, 'scripts/foundation/lifecycle.js'), 'utf8');
    assert.equal(Array.from(source.matchAll(/addEventListener\('DOMContentLoaded'/g)).length, 1);
    assert.equal(Array.from(source.matchAll(/\bbindActions\(\)/g)).length, 1);
    assert.equal(Array.from(source.matchAll(/\binitGlobalPublishSettingsSync\(\)/g)).length, 1);
});

test('successful keyword title recommendations focus and reveal the result section', () => {
    const source = fs.readFileSync(path.join(uiRoot, 'scripts/foundation/lifecycle.js'), 'utf8');
    const styles = fs.readFileSync(path.join(uiRoot, 'styles/features/discovery-modal.css'), 'utf8');

    assert.match(source, /id="keyword-title-results" class="keyword-title-results" tabindex="-1" aria-labelledby="keyword-title-results-heading"/);
    assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/);
    assert.match(source, /target\.scrollIntoView\(\{ behavior: reduceMotion \? 'auto' : 'smooth', block: 'start' \}\)/);
    assert.match(source, /shouldFocusTitleResults = keywordModalState\.titles\.length > 0/);
    assert.match(source, /if \(shouldFocusTitleResults\) focusKeywordTitleResults\(\)/);
    assert.match(styles, /\.keyword-title-results\s*\{[\s\S]*scroll-margin-top: 18px;[\s\S]*outline: none;/);
    assert.match(styles, /\.keyword-title-results:focus-visible\s*\{[\s\S]*outline: 2px solid/);
});

test('quick title recommendations use the selected writing strategy', () => {
    const source = fs.readFileSync(path.join(uiRoot, 'scripts/foundation/lifecycle.js'), 'utf8');

    assert.match(source, /const getQuickTitleMode = \(\) => quickDiscoveryInputTarget === 'blogNext'/);
    assert.match(source, /blog-next-writing-strategy/);
    assert.match(source, /getSelectedSettingsRadioValue\('quick-writing-strategy', currentBlogWritingStrategy\)/);
    assert.match(source, /postJson\('\/api\/v1\/keywords\/suggest-titles',[\s\S]*title_mode: getQuickTitleMode\(\)/);
});
