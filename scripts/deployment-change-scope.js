'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const BLOGGENIUS_PREFIXES = [
    '.github/workflows/environment-validation.yml',
    '.github/workflows/deploy-trends-web-production.yml',
    '.github/workflows/deploy-trends-web-development.yml',
    '.github/workflows/validate-trends-newsletter-workers.yml',
    'apps/trends/',
    'supabase/',
    'workspace/site-hosting/sites/www-bloggenius-kr/',
    'packages/plugins/core/astro-site-hosting/',
    'scripts/deploy-development-site.js',
    'scripts/deploy-production-trends-site.js',
    'scripts/production-trends-web-targets.js',
    'scripts/newsletter/',
    'scripts/ensure-worker-domain.js',
    'scripts/verify-site-hosting-contract.js',
    'scripts/deployment-change-scope.js',
    'package.json',
    'package-lock.json',
];

const MENTIVENUS_PREFIXES = [
    '.github/workflows/environment-validation.yml',
    '.github/workflows/deploy-trends-web-production.yml',
    'workspace/site-hosting/sites/www-mentivenus-com/',
    'packages/plugins/core/astro-site-hosting/',
    'scripts/deploy-mentivenus-site.js',
    'scripts/ensure-worker-domain.js',
    'scripts/verify-site-hosting-contract.js',
    'scripts/deployment-change-scope.js',
    'package.json',
    'package-lock.json',
];

function matchesPrefix(file, prefix) {
    return prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix;
}

function classifyChangedPaths(paths) {
    const changed = [...new Set(paths.map((file) => file.replaceAll('\\', '/')))];
    return {
        bloggenius: changed.some((file) => BLOGGENIUS_PREFIXES.some((prefix) => matchesPrefix(file, prefix))),
        mentivenus: changed.some((file) => MENTIVENUS_PREFIXES.some((prefix) => matchesPrefix(file, prefix))),
    };
}

function detectScope({ eventName, eventPath, before, sha, mode, operation, cwd = process.cwd() }) {
    if (eventName === 'workflow_dispatch') {
        if (operation === 'deploy-workers') return { bloggenius: true, mentivenus: true };
        if (mode === 'development-drift') {
            return { bloggenius: true, mentivenus: false };
        }
        return { bloggenius: false, mentivenus: false };
    }

    if (eventName !== 'push') return { bloggenius: false, mentivenus: false };

    const pushBefore = before || (eventPath && JSON.parse(fs.readFileSync(eventPath, 'utf8')).before);
    if (!pushBefore || /^0+$/.test(pushBefore)) return { bloggenius: true, mentivenus: true };

    try {
        execFileSync('git', ['cat-file', '-e', `${pushBefore}^{commit}`], { cwd, stdio: 'ignore' });
    } catch {
        return { bloggenius: true, mentivenus: true };
    }

    const output = execFileSync('git', ['diff', '--name-only', pushBefore, sha], {
        cwd,
        encoding: 'utf8',
    });
    return classifyChangedPaths(output.split('\n').filter(Boolean));
}

function writeOutputs(scope, outputPath) {
    const lines = [
        `bloggenius=${scope.bloggenius}`,
        `mentivenus=${scope.mentivenus}`,
        `any=${scope.bloggenius || scope.mentivenus}`,
    ];
    fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

module.exports = { BLOGGENIUS_PREFIXES, MENTIVENUS_PREFIXES, classifyChangedPaths, detectScope };

if (require.main === module) {
    const scope = detectScope({
        eventName: process.env.GITHUB_EVENT_NAME,
        eventPath: process.env.GITHUB_EVENT_PATH,
        before: process.env.GITHUB_EVENT_BEFORE,
        sha: process.env.GITHUB_SHA,
        mode: process.env.WORKFLOW_MODE,
        operation: process.env.WORKFLOW_OPERATION,
    });
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
    writeOutputs(scope, process.env.GITHUB_OUTPUT);
    process.stdout.write(`Deployment scope: BlogGenius=${scope.bloggenius}, MentiVenus=${scope.mentivenus}\n`);
}
