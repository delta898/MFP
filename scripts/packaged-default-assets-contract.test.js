'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('release packaging embeds only safe first-run defaults outside the mutable config directory', () => {
    const workflow = read('.github/workflows/build.yml');
    assert.match(workflow, /--extra-resource=["']?config[/\\]config[.]json[.]sample/);
    assert.match(workflow, /--extra-resource=["']?config[/\\]images/);
    assert.match(workflow, /[/|]config[/|]Videos/);
    assert.doesNotMatch(workflow, /mkdir -p ["']?\$\{ROOT_OUT\}[/\\]config/);
    assert.doesNotMatch(workflow, /cp config[/\\]config[.]json[.]sample ["']?\$\{ROOT_OUT\}[/\\]config/);
    assert.doesNotMatch(workflow, /\$\{ROOT_OUT\}[/\\]data/);
});
test('config loading falls back to packaged resources and initializes default images', () => {
    const paths = read('src/host/configuration/runtime-paths.js');
    const configStore = read('src/host/configuration/user-config-store.js');

    assert.match(paths, /configJsonSampleFromResources:\s*packagedAssets[.]configSample/);
    assert.match(paths, /configImagesFromResources:\s*packagedAssets[.]imagesDir/);
    assert.match(configStore, /copyMissingDefaultImages\(\{/);
});
