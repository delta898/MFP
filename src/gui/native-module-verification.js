'use strict';

const VERIFY_NATIVE_MODULES_ARG = '--verify-native-modules';
const KUZU_SUCCESS_MARKER = 'BlogGenius packaged Kuzu native module loaded';

function isNativeModuleVerificationRequested(argv = process.argv) {
    return Array.isArray(argv) && argv.includes(VERIFY_NATIVE_MODULES_ARG);
}

function verifyPackagedNativeModules(options = {}) {
    const loadKuzu = options.loadKuzu;
    const stdout = options.stdout || process.stdout;
    const stderr = options.stderr || process.stderr;

    try {
        if (typeof loadKuzu !== 'function') throw new Error('Kuzu loader is unavailable');
        loadKuzu();
        stdout.write(`${KUZU_SUCCESS_MARKER}\n`);
        return true;
    } catch (error) {
        stderr.write(`BlogGenius packaged Kuzu native module failed: ${error.message}\n`);
        return false;
    }
}

module.exports = {
    KUZU_SUCCESS_MARKER,
    VERIFY_NATIVE_MODULES_ARG,
    isNativeModuleVerificationRequested,
    verifyPackagedNativeModules
};
