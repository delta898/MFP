const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('runtime and package manifests use SQLite V2 without shipping Kuzu', () => {
    const packageJson = JSON.parse(read('package.json'));
    const packageLock = read('package-lock.json');
    const store = read('src/memory/store.js');
    const workflow = read('.github/workflows/build.yml');
    const buildSh = read('build.sh');
    const buildBat = read('build.bat');

    assert.equal(packageJson.dependencies?.kuzu, undefined);
    assert.doesNotMatch(packageLock, /node_modules[/\\]kuzu|registry[.]npmjs[.]org[/\\]kuzu/);
    assert.match(store, /SQLiteEventStore/);
    assert.doesNotMatch(store, /KuzuEventStore|loadKuzu/);
    for (const source of [workflow, buildSh, buildBat]) {
        assert.doesNotMatch(source, /node_modules[/\\]kuzu|kuzu-source/);
    }
});

test('retired Kuzu runtime and manual reset entrypoints are absent', () => {
    for (const relativePath of [
        'src/memory/event-store.js',
        'src/memory/recommendation-repository.js',
        'src/kuzu-service.js',
        'scripts/reset_agent_memory_db.sh'
    ]) {
        assert.equal(fs.existsSync(path.join(root, relativePath)), false, relativePath);
    }
});
