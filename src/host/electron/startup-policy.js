'use strict';

const SAFE_MODE_SWITCH = '--bloggenius-safe-mode';
const STARTUP_PROBE_SWITCH = '--bloggenius-startup-probe';
const SAFE_MODE_ELECTRON_SWITCHES = Object.freeze([
    '--disable-gpu',
    '--no-stdio-init'
]);

function normalizeArgs(args = process.argv.slice(1)) {
    return (Array.isArray(args) ? args : []).map((arg) => String(arg || '')).filter(Boolean);
}

function isSafeMode(args = process.argv.slice(1)) {
    return normalizeArgs(args).some((arg) => arg === SAFE_MODE_SWITCH);
}

function isStartupProbe(args = process.argv.slice(1)) {
    return normalizeArgs(args).some((arg) => arg === STARTUP_PROBE_SWITCH);
}

function isShortLivedCommand(args = process.argv.slice(1)) {
    const values = new Set(normalizeArgs(args));
    return values.has('--version') || values.has('-v') || values.has('--help') || values.has('-h');
}

function appendMissingSwitches(args, switches) {
    const result = normalizeArgs(args);
    const existingNames = new Set(result.map((arg) => arg.split('=', 1)[0]));
    for (const value of switches) {
        const name = String(value).split('=', 1)[0];
        if (!existingNames.has(name)) {
            result.push(value);
            existingNames.add(name);
        }
    }
    return result;
}

function buildSafeModeArgs(args = process.argv.slice(1)) {
    return appendMissingSwitches(args, [SAFE_MODE_SWITCH, ...SAFE_MODE_ELECTRON_SWITCHES]);
}

function shouldRetryInSafeMode({ exitCode, ready, args = [] } = {}) {
    if (ready || isSafeMode(args) || isShortLivedCommand(args)) return false;
    return Number.isInteger(exitCode) && exitCode !== 0;
}

module.exports = {
    SAFE_MODE_SWITCH,
    SAFE_MODE_ELECTRON_SWITCHES,
    STARTUP_PROBE_SWITCH,
    appendMissingSwitches,
    buildSafeModeArgs,
    isSafeMode,
    isStartupProbe,
    isShortLivedCommand,
    shouldRetryInSafeMode
};
