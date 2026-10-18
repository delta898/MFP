'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('release packaging embeds only safe first-run defaults outside the mutable config directory', () => {
    const workflow = read('.github/workflows/build.yml');
    const buildSh = read('build.sh');
    const buildBat = read('build.bat');
    const packageJson = JSON.parse(read('package.json'));

    for (const source of [workflow, buildSh, buildBat]) {
        assert.match(source, /--extra-resource=["']?config[/\\]config[.]json[.]sample/);
        assert.match(source, /--extra-resource=["']?config[/\\]images/);
    }
    assert.match(workflow, /[/|]config[/|]Videos/);
    assert.ok(packageJson.pkg.scripts.includes('src/host/**/*.js'));
    assert.ok(packageJson.pkg.scripts.includes('packages/plugins/core/**/*.js'));
    assert.ok(packageJson.pkg.assets.includes('packages/plugins/core/**/*'));
    assert.ok(packageJson.pkg.assets.includes('src/content/prompts/blog/*.md'));
    assert.ok(packageJson.pkg.assets.includes('src/content/writing-profile/*.json'));
    assert.ok(packageJson.pkg.assets.includes('src/applications/shopping/generation/prompts/*.md'));
});
test('config loading falls back to packaged resources and initializes default images', () => {
    const paths = read('src/host/configuration/runtime-paths.js');
    const configStore = read('src/host/configuration/user-config-store.js');

    assert.match(paths, /configJsonSampleFromResources:\s*packagedAssets[.]configSample/);
    assert.match(paths, /configImagesFromResources:\s*packagedAssets[.]imagesDir/);
    assert.match(configStore, /copyMissingDefaultImages\(\{/);
});
