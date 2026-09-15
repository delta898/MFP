'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    parseArgs,
    resolveElectronUserData,
    buildPlan,
    validateDevelopmentDatabase,
    buildDevelopmentResetSql,
    removeTargets
} = require('./clear-dev-state');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-clear-test-'));
    const repoRoot = path.join(root, 'repo');
    const homeDir = path.join(root, 'home');
    const userDataDir = path.join(homeDir, 'Library', 'Application Support', 'blog-genius');
    fs.mkdirSync(path.join(repoRoot, 'config'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'workspace', 'manuscript-drafts'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'BlogGenius', 'crashes'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'config', 'config.json.sample'), '{}');
    fs.writeFileSync(path.join(repoRoot, 'config', 'config.json'), '{}');
    fs.writeFileSync(path.join(repoRoot, 'config', 'config.json.bak'), 'user backup');
    fs.writeFileSync(path.join(repoRoot, 'config', 'config.json.bak2'), 'user backup');
    fs.writeFileSync(path.join(repoRoot, 'config', 'license.development.key'), 'dev-license');
    fs.writeFileSync(path.join(repoRoot, 'data', 'memory.sqlite3'), 'data');
    fs.writeFileSync(path.join(repoRoot, 'workspace', 'manuscript-drafts', 'draft.md'), 'draft');
    fs.writeFileSync(path.join(repoRoot, 'workspace', 'my-notes.md'), 'user file');
    fs.writeFileSync(path.join(userDataDir, 'config', 'license.development.key'), 'dev-license');
    fs.writeFileSync(path.join(userDataDir, 'config', 'config.json'), '{}');
    fs.writeFileSync(path.join(userDataDir, 'config', 'config.json.bak'), 'user backup');
    fs.writeFileSync(path.join(userDataDir, 'BlogGenius', 'crashes', 'dump'), 'crash');
    return { root, repoRoot, homeDir, userDataDir };
}

test('partial reset preserves memory, workspace, license and diagnostics', () => {
    const f = fixture();
    try {
        const plan = buildPlan({ mode: 'partial', ...f, platform: 'darwin' });
        assert.ok(plan.targets.includes(path.join(f.repoRoot, 'config', 'config.json')));
        assert.ok(plan.targets.includes(path.join(f.userDataDir, 'config', 'config.json')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'data')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'workspace')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'config', 'config.json.bak')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'config', 'config.json.bak2')));
        assert.ok(!plan.targets.includes(path.join(f.userDataDir, 'config', 'license.development.key')));
        assert.ok(!plan.targets.some((target) => target.includes(`${path.sep}BlogGenius${path.sep}`)));
        assert.ok(!plan.targets.includes(path.join(f.userDataDir, 'logs')));
    } finally {
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('full reset includes local state and license but preserves diagnostics', () => {
    const f = fixture();
    try {
        const plan = buildPlan({ mode: 'full', ...f, platform: 'darwin' });
        assert.ok(plan.targets.includes(path.join(f.repoRoot, 'data')));
        assert.ok(plan.targets.includes(path.join(f.repoRoot, 'workspace', 'manuscript-drafts')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'workspace')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'workspace', 'my-notes.md')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'config', 'config.json.bak')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'config', 'config.json.bak2')));
        assert.ok(plan.targets.includes(path.join(f.userDataDir, 'config', 'config.json')));
        assert.ok(plan.targets.includes(path.join(f.userDataDir, 'config', 'license.development.key')));
        assert.ok(!plan.targets.includes(path.join(f.userDataDir, 'config')));
        assert.ok(!plan.targets.includes(path.join(f.userDataDir, 'config', 'config.json.bak')));
        assert.ok(!plan.targets.some((target) => target.includes(`${path.sep}BlogGenius${path.sep}`)));
        assert.ok(!plan.targets.includes(path.join(f.userDataDir, 'logs')));
        assert.ok(!plan.targets.includes(path.join(f.repoRoot, 'config', 'config.json.sample')));
    } finally {
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('full reset deletes planned app state without deleting user-created files', () => {
    const f = fixture();
    try {
        const plan = buildPlan({ mode: 'full', ...f, platform: 'darwin' });
        removeTargets(plan.targets);
        assert.equal(fs.readFileSync(path.join(f.repoRoot, 'config', 'config.json.bak'), 'utf8'), 'user backup');
        assert.equal(fs.readFileSync(path.join(f.repoRoot, 'config', 'config.json.bak2'), 'utf8'), 'user backup');
        assert.equal(fs.readFileSync(path.join(f.repoRoot, 'workspace', 'my-notes.md'), 'utf8'), 'user file');
        assert.equal(fs.readFileSync(path.join(f.userDataDir, 'config', 'config.json.bak'), 'utf8'), 'user backup');
        assert.equal(fs.readFileSync(path.join(f.userDataDir, 'BlogGenius', 'crashes', 'dump'), 'utf8'), 'crash');
        assert.equal(fs.existsSync(path.join(f.repoRoot, 'data')), false);
        assert.equal(fs.existsSync(path.join(f.repoRoot, 'workspace', 'manuscript-drafts')), false);
    } finally {
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('CLI options keep remote reset exclusive to full mode', () => {
    assert.deepEqual(parseArgs([]), {
        mode: 'partial', apply: false, yes: false, help: false, resetDevelopmentUser: false,
        modeExplicit: false, remoteExplicit: false, actionExplicit: false
    });
    const remote = parseArgs(['--full', '--apply', '--reset-development-user']);
    assert.equal(remote.resetDevelopmentUser, true);
    assert.equal(remote.modeExplicit, true);
    assert.equal(remote.remoteExplicit, true);
    assert.equal(remote.actionExplicit, true);
    assert.equal(parseArgs(['--full', '--reset-development-user', '--local-only']).resetDevelopmentUser, false);
    assert.throws(() => parseArgs(['--reset-development-user']), /--full/);
    assert.throws(() => parseArgs(['--unknown']), /알 수 없는 옵션/);
});

test('development database validation rejects production and mismatched targets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-clear-env-'));
    try {
        const valid = {
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF: 'devref',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://devref.supabase.co',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_DB_URL: 'postgresql://postgres.devref:secret@pooler.supabase.com:5432/postgres'
        };
        assert.equal(validateDevelopmentDatabase(root, valid).projectRef, 'devref');
        assert.throws(() => validateDevelopmentDatabase(root, {
            ...valid,
            BLOGGENIUS_DEVELOPMENT_SUPABASE_URL: 'https://other.supabase.co'
        }), /일치하지 않습니다/);
        fs.writeFileSync(path.join(root, '.env.production'), 'BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF=devref\n');
        assert.throws(() => validateDevelopmentDatabase(root, valid), /Production/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('remote reset SQL is one statement and dry-run is read-only', () => {
    const preview = buildDevelopmentResetSql({ licenseKey: "dev'key", hwid: 'machine' }, false);
    assert.match(preview, /^do \$reset\$/);
    assert.match(preview, /where license_key = 'dev''key'/);
    assert.match(preview, /HWID does not match/);
    assert.match(preview, /matched development user: licenses=%/);
    assert.doesNotMatch(preview, /delete from/i);
    assert.doesNotMatch(preview, /\b(?:begin|commit|rollback);/i);
    assert.doesNotMatch(preview, /truncate/i);
    const applied = buildDevelopmentResetSql({ licenseKey: 'key', hwid: 'machine' }, true);
    assert.match(applied, /delete from public\.licenses where hwid = 'machine'/);
    assert.match(applied, /delete from public\.license_device_states where hwid_hash = '[a-f0-9]{64}'/);
    assert.doesNotMatch(applied, /\b(?:begin|commit|rollback);/i);
});

test('full reset includes both managed and configured workspace paths', () => {
    const f = fixture();
    const customWorkspace = path.join(f.root, 'custom', 'workspace');
    fs.mkdirSync(path.join(customWorkspace, 'card-news'), { recursive: true });
    fs.writeFileSync(path.join(customWorkspace, 'contents.md'), 'user manuscript');
    fs.writeFileSync(path.join(f.repoRoot, 'config', 'config.json'), JSON.stringify({
        general: { workspace_dir: customWorkspace }
    }));
    try {
        const plan = buildPlan({ mode: 'full', ...f, platform: 'darwin' });
        assert.ok(plan.targets.includes(path.join(f.repoRoot, 'workspace', 'manuscript-drafts')));
        assert.ok(plan.targets.includes(path.join(customWorkspace, 'card-news')));
        assert.ok(!plan.targets.includes(customWorkspace));
        assert.ok(!plan.targets.includes(path.join(customWorkspace, 'contents.md')));
    } finally {
        fs.rmSync(f.root, { recursive: true, force: true });
    }
});

test('userData resolution matches Electron platform conventions', () => {
    assert.equal(
        resolveElectronUserData({ platform: 'darwin', homeDir: '/Users/tester' }),
        '/Users/tester/Library/Application Support/blog-genius'
    );
    assert.equal(
        resolveElectronUserData({ platform: 'linux', homeDir: '/home/tester', env: {} }),
        '/home/tester/.config/blog-genius'
    );
});
