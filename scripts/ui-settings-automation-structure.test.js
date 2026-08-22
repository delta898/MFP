const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'ui', 'scripts');
const contracts = {
  'features/settings/sns-runtime.js': ['loadSettingsSnsRuntimeStatus'],
  'features/settings/major-form.js': ['applySettingsMajorToForm'],
  'features/settings/ai-models.js': ['runSettingsAiModelTest'],
  'features/settings/save-lifecycle.js': ['loadSettingsMajor'],
  'features/settings/google-auth.js': ['startGoogleOauth'],
  'features/settings/platform-auth.js': ['loadNaverSessionStatus'],
  'features/automation/blog.js': ['loadBlogAutoSettings'],
  'features/automation/shopping.js': ['loadShoppingAutoSettings']
};

test('settings and automation controllers have explicit owners', () => {
  const all = Object.entries(contracts).map(([file, names]) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    names.forEach((name) => assert.match(source, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`)));
    return source;
  }).join('\n');
  Object.values(contracts).flat().forEach((name) => {
    assert.equal(Array.from(all.matchAll(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g'))).length, 1);
  });
});
