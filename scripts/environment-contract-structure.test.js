'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    ENVIRONMENT_SCHEMA_VERSION,
    ENVIRONMENT_NAMES
} = require('../src/environment/contract');
const runtimeManifest = require('../src/environment/manifest');

const REPO_ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function collectFiles(relativeDirectory, predicate) {
    const root = path.join(REPO_ROOT, relativeDirectory);
    const results = [];

    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(target);
            if (entry.isFile() && predicate(target)) {
                results.push(path.relative(REPO_ROOT, target).split(path.sep).join('/'));
            }
        }
    }

    visit(root);
    return results.sort();
}

test('environment manifest has all canonical profiles and contains no secret values', () => {
    const manifest = readJson('supabase/environment-manifest.json');
    assert.equal(manifest.schema_version, ENVIRONMENT_SCHEMA_VERSION);
    assert.equal(manifest.environment_variable, 'BLOGGENIUS_ENV');
    assert.deepEqual(Object.keys(manifest.profiles).sort(), [...ENVIRONMENT_NAMES].sort());

    for (const environment of ENVIRONMENT_NAMES) {
        const profile = manifest.profiles[environment];
        assert.equal(typeof profile.supabase_url_source, 'string');
        assert.equal(typeof profile.supabase_publishable_key_source, 'string');
        assert.equal('supabase_url' in profile, false);
        assert.equal('supabase_publishable_key' in profile, false);
        assert.equal('service_role_key' in profile, false);
        assert.equal('secret_key' in profile, false);
    }

    assert.equal(manifest.profiles.local.allows_destructive_database_operations, true);
    assert.equal(manifest.profiles.development.allows_live_publish, false);
    assert.equal(manifest.profiles.production.allows_destructive_database_operations, false);
});

test('runtime and deployment manifests share environment names and source contracts', () => {
    const deploymentManifest = readJson('supabase/environment-manifest.json');
    assert.equal(runtimeManifest.schema_version, deploymentManifest.schema_version);
    assert.equal(runtimeManifest.environment_variable, deploymentManifest.environment_variable);
    assert.deepEqual(Object.keys(runtimeManifest.profiles), Object.keys(deploymentManifest.profiles));

    for (const environment of ENVIRONMENT_NAMES) {
        const runtimeProfile = runtimeManifest.profiles[environment];
        const deploymentProfile = deploymentManifest.profiles[environment];
        for (const field of [
            'project_name',
            'project_name_source',
            'project_ref',
            'project_ref_source',
            'supabase_url_source',
            'supabase_publishable_key_source',
            'allows_destructive_database_operations',
            'allows_live_publish',
            'allows_live_payment',
            'allows_live_notifications'
        ]) {
            if (Array.isArray(runtimeProfile[field]) || Array.isArray(deploymentProfile[field])) {
                assert.deepEqual(runtimeProfile[field], deploymentProfile[field], `${environment}.${field}`);
            } else {
                assert.equal(runtimeProfile[field], deploymentProfile[field], `${environment}.${field}`);
            }
        }
    }
});

test('Supabase SQL inventory covers every committed SQL asset exactly once', () => {
    const inventory = readJson('supabase/inventory.json');
    const actual = collectFiles('supabase', (file) => file.endsWith('.sql'));
    const inventoried = inventory.database_assets.map((asset) => asset.path).sort();

    assert.deepEqual(inventoried, actual);
    assert.equal(new Set(inventoried).size, inventoried.length);
    assert.ok(inventory.database_assets.every((asset) => asset.classification));
});

test('local Supabase owns one canonical migration and seed structure', () => {
    const packageJson = readJson('package.json');
    const migrations = collectFiles('supabase/migrations', (file) => file.endsWith('.sql'));
    const rootSqlDirectory = path.join(REPO_ROOT, 'sql');
    const legacyTrendsSqlDirectory = path.join(REPO_ROOT, 'apps/trends/trends-api/sql');

    assert.equal(fs.existsSync(rootSqlDirectory), false);
    assert.equal(fs.existsSync(legacyTrendsSqlDirectory), false);
    assert.ok(migrations.length > 0);
    assert.deepEqual(migrations, [...migrations].sort());
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'supabase/seed.sql')), true);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'supabase/tests/local_baseline.sql')), true);
    assert.match(packageJson.scripts['env:local:reset'], /database-reset/);
    assert.match(packageJson.scripts['env:local:reset'], /supabase db reset --local/);
    assert.match(packageJson.scripts['env:local:reset'], /reset-local-license-file[.]js/);
    assert.match(packageJson.scripts['env:local:verify'], /local_baseline\.sql/);
});

test('Edge Function inventory covers every function entrypoint and shared module', () => {
    const inventory = readJson('supabase/inventory.json');
    const functionFiles = collectFiles(
        'supabase/functions',
        (file) => file.endsWith('.ts')
    );
    const inventoried = [
        ...inventory.edge_functions,
        ...inventory.shared_edge_modules
    ].sort();

    assert.deepEqual(inventoried, functionFiles);
    assert.equal(new Set(inventoried).size, inventoried.length);
});

test('Supabase JavaScript client inventory covers every non-test client owner', () => {
    const inventory = readJson('supabase/inventory.json');
    const clientOwners = [
        ...collectFiles('src', (file) => file.endsWith('.js') && !file.endsWith('.test.js')),
        ...collectFiles('apps', (file) => file.endsWith('.js') && !file.endsWith('.test.js'))
    ].filter((relativePath) => {
        const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
        return source.includes("require('@supabase/supabase-js')")
            || source.includes('require("@supabase/supabase-js")');
    }).sort();
    const inventoried = [
        ...inventory.desktop_consumers,
        ...inventory.operator_service_consumers
    ].sort();

    assert.deepEqual(inventoried, clientOwners);
});

test('inventory never stores linked project metadata or credential values', () => {
    const inventory = readJson('supabase/inventory.json');
    const serialized = JSON.stringify(inventory);

    assert.equal(serialized.includes('supabase.co'), false);
    assert.equal(serialized.includes('service_role_key'), false);
    assert.equal(serialized.includes('publishable_key_value'), false);
    assert.equal(inventory.linked_project_classification, 'production');
});

test('desktop Supabase clients resolve public connections through one environment boundary', () => {
    const inventory = readJson('supabase/inventory.json');
    for (const relativePath of inventory.desktop_consumers) {
        const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
        assert.match(source, /resolveSupabasePublicConnection/);
        assert.doesNotMatch(source, /config\.LICENSE_CHK_(URL|KEY)/);
        assert.doesNotMatch(source, /CONFIG\.LICENSE_CHK_(URL|KEY)/);
    }
});

test('build environment config is generated, ignored, and validated explicitly', () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    const sample = fs.readFileSync(path.join(REPO_ROOT, 'src/config/secret.js.sample'), 'utf8');
    const workflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/build.yml'), 'utf8');
    const buildSh = fs.readFileSync(path.join(REPO_ROOT, 'build.sh'), 'utf8');
    const buildBat = fs.readFileSync(path.join(REPO_ROOT, 'build.bat'), 'utf8');

    assert.match(gitignore, /^src\/config\/secret\.js$/m);
    assert.match(sample, /BLOGGENIUS_ENV/);
    assert.match(sample, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(sample, /GOOGLE_OAUTH_CLIENT_ID/);
    assert.match(sample, /GOOGLE_OAUTH_CLIENT_SECRET/);
    assert.doesNotMatch(sample, /hocfjolcthvtgfaxjmse/);
    assert.match(workflow, /build-environment-config\.js write/);
    assert.match(workflow, /BLOGGENIUS_BUILD_GOOGLE_OAUTH_CLIENT_ID/);
    assert.match(workflow, /BLOGGENIUS_BUILD_GOOGLE_OAUTH_CLIENT_SECRET/);
    assert.match(workflow, /--target production/);
    assert.doesNotMatch(workflow, /echo "module\.exports/);
    assert.match(buildSh, /build-environment-config\.js validate --target production/);
    assert.match(buildBat, /build-environment-config\.js validate --target production/);
});

test('packaging includes the runtime environment implementation', () => {
    const packageJson = readJson('package.json');
    assert.ok(packageJson.pkg.scripts.includes('src/environment/**/*.js'));
});

test('target-aware deployment workflows are routed through the dry-run preflight boundary', () => {
    const inventory = readJson('supabase/inventory.json');
    const packageJson = readJson('package.json');
    const safety = inventory.deployment_safety;

    assert.equal(safety.policy, 'src/environment/deployment-guard.js');
    assert.equal(safety.preflight_cli, 'scripts/environment-preflight.js');
    assert.equal(safety.hosted_development_plan, 'scripts/hosted-development-plan.js');
    assert.equal(safety.hosted_development_execution_owner, 'supabase_environment_provider');
    assert.equal(safety.execution_mode, 'external_operator_handoff');
    assert.equal(
        packageJson.scripts['env:preflight'],
        'node scripts/environment-preflight.js check'
    );
    assert.equal(fs.existsSync(path.join(REPO_ROOT, safety.policy)), true);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, safety.preflight_cli)), true);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, safety.hosted_development_plan)), true);
});

test('production schema audit keeps only a sanitized report in the repository', () => {
    const inventory = readJson('supabase/inventory.json');
    const audit = inventory.production_schema_audit;
    const report = fs.readFileSync(path.join(REPO_ROOT, audit.sanitized_report), 'utf8');

    assert.equal(audit.raw_schema_committed, false);
    assert.equal(audit.row_data_collected, false);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, audit.analyzer)), true);
    assert.match(report, /COPY` statements \| 0/);
    assert.match(report, /INSERT` statements \| 0/);
    assert.match(report, /public\.licenses/);
    assert.doesNotMatch(report, /hocfjolcthvtgfaxjmse/);
    assert.doesNotMatch(report, /eyJ[A-Za-z0-9_-]{20,}/);
});

test('config loading and diagnostics expose only the resolved environment boundary', () => {
    const configLoader = fs.readFileSync(path.join(REPO_ROOT, 'src/config-loader.js'), 'utf8');
    const systemService = fs.readFileSync(
        path.join(REPO_ROOT, 'src/ui-api/services/system.service.js'),
        'utf8'
    );

    assert.match(configLoader, /resolveRuntimeEnvironmentProfile/);
    assert.match(configLoader, /RUNTIME_ENVIRONMENT_PROFILE: runtimeEnvironmentProfile/);
    assert.doesNotMatch(configLoader, /LICENSE_CHK_URL: internalSecrets\.LICENSE_CHK_URL/);
    assert.doesNotMatch(configLoader, /LICENSE_CHK_KEY: internalSecrets\.LICENSE_CHK_KEY/);
    assert.match(systemService, /toSafeRuntimeEnvironmentDiagnostic/);
    assert.doesNotMatch(systemService, /publishableKey/);
});
