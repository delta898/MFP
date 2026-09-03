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
    assert.ok(packageJson.pkg.scripts.includes('src/config/**/*.js'));
});
test('config loading falls back to packaged resources and initializes default images', () => {
    const loader = read('src/config-loader.js');

    assert.match(loader, /configJsonSampleFromResources:\s*PACKAGED_DEFAULT_ASSETS[.]configSample/);
    assert.match(loader, /configImagesFromResources:\s*PACKAGED_DEFAULT_ASSETS[.]imagesDir/);
    assert.match(loader, /copyMissingDefaultImages\(\{/);
});
