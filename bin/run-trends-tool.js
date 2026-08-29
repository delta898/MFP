#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const TOOL_MAP = {
    collector: path.join('apps', 'trends', 'trends-collector', 'bin', 'collect.js')
};

function resolveToolScript(toolName) {
    const scriptRelativePath = TOOL_MAP[String(toolName || '').trim()];
    if (!scriptRelativePath) {
        throw new Error(`unknown trends tool: ${toolName}`);
    }
    return path.resolve(__dirname, '..', scriptRelativePath);
}

function parseToolLauncherArgs(argv = process.argv.slice(2)) {
    const toolName = String(argv[0] || '').trim();
    let environment = '';
    const extraArgs = [];
    for (let index = 1; index < argv.length; index += 1) {
        const argument = String(argv[index] || '').trim();
        if (argument === '--environment') {
            environment = String(argv[index + 1] || '').trim();
            if (!environment) throw new Error('--environment requires a value');
            index += 1;
            continue;
        }
        if (argument.startsWith('--environment=')) {
            environment = argument.slice('--environment='.length).trim();
            if (!environment) throw new Error('--environment requires a value');
            continue;
        }
        extraArgs.push(argv[index]);
    }
    return { toolName, environment, extraArgs };
}

function runTool(toolName, extraArgs = process.argv.slice(2), options = {}) {
    const scriptPath = resolveToolScript(toolName);
    const repoRoot = path.resolve(__dirname, '..');
    const environment = String(options.environment || '').trim();
    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
        cwd: repoRoot,
        env: {
            ...process.env,
            ...(environment ? { TRENDS_ENV: environment } : {})
        },
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
    try {
        const parsed = parseToolLauncherArgs(process.argv.slice(2));
        runTool(parsed.toolName, parsed.extraArgs, { environment: parsed.environment });
    } catch (error) {
        console.error(`❌ failed to start trends tool: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    parseToolLauncherArgs,
    resolveToolScript,
    runTool
};
