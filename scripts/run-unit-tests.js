#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_ROOTS = Object.freeze(['apps', 'bin', 'scripts', 'shared', 'src']);

function collectUnitTestFiles(repoRoot, roots = DEFAULT_ROOTS) {
    const files = [];

    function visit(targetPath) {
        if (!fs.existsSync(targetPath)) return;
        const entries = fs.readdirSync(targetPath, { withFileTypes: true })
            .sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const entryPath = path.join(targetPath, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
            } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
                files.push(path.relative(repoRoot, entryPath));
            }
        }
    }

    for (const root of roots) visit(path.join(repoRoot, root));
    return files.sort((left, right) => left.localeCompare(right));
}

function runUnitTests(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const testFiles = collectUnitTestFiles(repoRoot, options.roots || DEFAULT_ROOTS);
    if (testFiles.length === 0) {
        process.stderr.write('No unit test files were found.\n');
        return 1;
    }

    process.stdout.write(`Running ${testFiles.length} unit test files.\n`);
    const result = spawnSync(process.execPath, ['--test', ...testFiles], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit'
    });
    if (result.error) {
        process.stderr.write(`${result.error.message}\n`);
        return 1;
    }
    return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
    process.exitCode = runUnitTests();
}

module.exports = {
    DEFAULT_ROOTS,
    collectUnitTestFiles,
    runUnitTests
};
