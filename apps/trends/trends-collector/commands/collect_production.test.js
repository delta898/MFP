const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.join(__dirname, 'collect_production.sh');

test('non-interactive log uses portable numeric timezone and forwards arguments and status', (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'collector-test-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(path.join(dir, 'npm'), '#!/bin/bash\nprintf "ARG:<%s>\\n" "$@"\nexit 23\n', { mode: 0o755 });
    for (const [tz, offset] of [['Asia/Seoul', '+09:00'], ['Etc/GMT+5', '-05:00']]) {
        const result = spawnSync('bash', [script, '--dry-run', '--date=-1d', 'space arg'], {
            encoding: 'utf8', env: { ...process.env, TZ: tz, PATH: `${dir}:${process.env.PATH}` }
        });
        assert.equal(result.status, 23, result.stderr);
        const [line, ...args] = result.stdout.trim().split('\n');
        assert.match(line, /^\[\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d\] trends-collector started \(production\)$/);
        assert.ok(line.includes(offset), line);
        assert.deepEqual(args, ['ARG:<run>', 'ARG:<trends:collector:production>', 'ARG:<-->', 'ARG:<--dry-run>', 'ARG:<--date=-1d>', 'ARG:<space arg>']);
    }
});

test('help exits without starting the collector or logging startup', () => {
    const result = spawnSync('bash', [script, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /사용법:/);
    assert.doesNotMatch(result.stdout, /trends-collector started/);
});
