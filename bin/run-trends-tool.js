#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const TOOL_MAP = {
    api: path.join('apps', 'trends', 'trends-api', 'src', 'server.js'),
    collector: path.join('apps', 'trends', 'trends-collector', 'bin', 'collect.js')
};

function resolveToolScript(toolName) {
    const scriptRelativePath = TOOL_MAP[String(toolName || '').trim()];
    if (!scriptRelativePath) {
        throw new Error(`unknown trends tool: ${toolName}`);
    }
    return path.resolve(__dirname, '..', scriptRelativePath);
}

function runTool(toolName) {
    const scriptPath = resolveToolScript(toolName);
    const repoRoot = path.resolve(__dirname, '..');
    const child = spawn(process.execPath, [scriptPath], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit'
    });

    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code ?? 0);
    });

    child.on('error', (error) => {
        console.error(`❌ failed to start trends ${toolName}: ${error.message}`);
        process.exit(1);
    });
}

if (require.main === module) {
    runTool(process.argv[2]);
}

module.exports = {
    resolveToolScript,
    runTool
};
