function createConfigStateManager(deps = {}) {
    const {
        fs,
        path,
        CONFIG,
        resolveWritableConfigPath,
        buildDefaultConfigTemplate,
        syncAutoRunnerWithConfig
    } = deps;

    function ensureStructuredConfig(config = {}) {
        if (!config.automation) config.automation = {};
        if (!config.automation.collect) config.automation.collect = {};
        if (!config.automation.collect.blog) config.automation.collect.blog = {};
        if (!config.automation.collect.blog.trends) config.automation.collect.blog.trends = {};
        if (!config.automation.publish) config.automation.publish = {};
        if (!config.automation.publish.blog) config.automation.publish.blog = {};
        if (!config.notification) config.notification = {};
        if (!config.notification.telegram) config.notification.telegram = {};
        if (!config.ai_settings) config.ai_settings = {};
        if (!config.ai_settings.CHAT_MODEL) config.ai_settings.CHAT_MODEL = {};
        if (!config.knowledge) config.knowledge = {};
        if (!Array.isArray(config.knowledge.providers)) config.knowledge.providers = [];
        if (!config.knowledge.routing || typeof config.knowledge.routing !== 'object' || Array.isArray(config.knowledge.routing)) {
            config.knowledge.routing = {};
        }
        return config;
    }

    function loadStructuredConfig() {
        const writablePath = resolveWritableConfigPath();
        try {
            if (fs.existsSync(writablePath)) {
                return ensureStructuredConfig(JSON.parse(fs.readFileSync(writablePath, 'utf8')));
            }
        } catch (_ignore) { }
        try {
            return ensureStructuredConfig(JSON.parse(buildDefaultConfigTemplate()));
        } catch (_ignore) {
            return ensureStructuredConfig({});
        }
    }

    function saveStructuredConfig(config = {}) {
        const writablePath = resolveWritableConfigPath();
        const normalized = ensureStructuredConfig(config);
        fs.mkdirSync(path.dirname(writablePath), { recursive: true });
        fs.writeFileSync(writablePath, JSON.stringify(normalized, null, 2), 'utf-8');
        return { path: writablePath, config: normalized };
    }

    function applyStructuredConfigToRuntime(config = {}, runtimePatch = {}, options = {}) {
        const normalized = ensureStructuredConfig(config);
        CONFIG.automation = normalized.automation;
        CONFIG.notification = normalized.notification;
        CONFIG.ai_settings = normalized.ai_settings;
        CONFIG.knowledge = normalized.knowledge;
        CONFIG.KNOWLEDGE_PROVIDERS = Array.isArray(normalized.knowledge?.providers) ? normalized.knowledge.providers : [];
        CONFIG.KNOWLEDGE_ROUTING = normalized.knowledge?.routing && typeof normalized.knowledge.routing === 'object' ? normalized.knowledge.routing : {};
        Object.assign(CONFIG, runtimePatch || {});
        CONFIG.CONFIG_READY = true;
        CONFIG.CONFIG_SOURCE_TYPE = 'json';
        CONFIG.CONFIG_SOURCE_PATH = resolveWritableConfigPath();

        if (options.syncAuto === true && typeof syncAutoRunnerWithConfig === 'function') {
            syncAutoRunnerWithConfig();
        }
    }

    function persistAndSync(config = {}, runtimePatch = {}, options = {}) {
        const saved = saveStructuredConfig(config);
        applyStructuredConfigToRuntime(saved.config, runtimePatch, options);
        return saved;
    }

    return {
        ensureStructuredConfig,
        loadStructuredConfig,
        saveStructuredConfig,
        applyStructuredConfigToRuntime,
        persistAndSync
    };
}

module.exports = {
    createConfigStateManager
};
