const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202609030000_track_unlimited_plan_usage.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('unlimited usage migration counts only newly committed zero-unit operations', () => {
    assert.match(migration, /new\.state = 'committed'/);
    assert.match(migration, /new\.quota_units = 0/);
    assert.match(migration, /old\.state is distinct from 'committed'/);
    assert.match(migration, /usage_count = coalesce\(usage_count, 0\) \+ 1/);
});

test('unlimited usage migration keeps quota enforcement separate from activity count', () => {
    assert.match(migration, /'usage_limit', -1/);
    assert.match(migration, /'usage_count', v_effective_count/);
    assert.match(migration, /'remaining', -1/);
});

test('effective usage resets its reported count at an expired cycle boundary', () => {
    assert.match(migration, /p_now >= p_reset_date/);
    assert.match(migration, /then 0/);
    assert.match(migration, /effective_license_usage_count/);
});

