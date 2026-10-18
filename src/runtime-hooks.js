let runtimeHooks = {
    resolveWritableConfigPath: null,
    buildDefaultConfigTemplate: null,
    syncAutoRunnerWithConfig: null,
    resolveNaverAutoCategoryCatalog: null,
    generateChatText: null
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
