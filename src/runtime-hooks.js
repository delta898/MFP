let runtimeHooks = {
    resolveWritableConfigPath: null,
    buildDefaultConfigTemplate: null,
    syncAutoRunnerWithConfig: null,
    syncShoppingAutoRunnerWithConfig: null,
    resolveNaverAutoCategoryCatalog: null
};

function registerRuntimeHooks(nextHooks = {}) {
    runtimeHooks = {
        ...runtimeHooks,
        ...nextHooks
    };
    return { ...runtimeHooks };
}

function getRuntimeHooks() {
    return { ...runtimeHooks };
}

module.exports = {
    registerRuntimeHooks,
    getRuntimeHooks
};
