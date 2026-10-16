const { getTransportBaseUrl } = require('./transport-registry');
const { describeSupport } = require('../../packages/plugins/core/ai-gateway');

function isSupportedRoute({ kind, provider, transport } = {}) {
    return describeSupport().routes.some((route) => route.kind === kind
        && route.provider === provider && route.transport === transport);
}

const CATALOG_SCHEMA_VERSION = 1;
const MODEL_KINDS = new Set(['text', 'image']);
const MODEL_STATUSES = new Set(['active', 'preview', 'deprecated', 'hidden', 'unavailable']);
const SELECTABLE_STATUSES = new Set(['active', 'preview', 'deprecated']);
const CAPABILITY_KEYS = new Set([
    'temperature',
    'structured_output',
    'image_input',
    'aspect_ratio',
    'image_size',
    'response_format',
    'arbitrary_size',
    'output_format',
    'quality',
    'thinking_levels',
    'reasoning_efforts'
]);

let remoteSnapshot = null;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function compareVersions(left, right) {
    const normalize = (value) => String(value || '')
        .split(/[.-]/)
        .slice(0, 3)
        .map((part) => Number.parseInt(part, 10) || 0);
    const a = normalize(left);
    const b = normalize(right);
    for (let index = 0; index < 3; index += 1) {
        if (a[index] > b[index]) return 1;
        if (a[index] < b[index]) return -1;
    }
    return 0;
}

function sanitizeCapabilities(rawCapabilities) {
    const raw = rawCapabilities && typeof rawCapabilities === 'object' && !Array.isArray(rawCapabilities)
        ? rawCapabilities
        : {};
    const capabilities = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!CAPABILITY_KEYS.has(key)) continue;
        if (typeof value === 'boolean') {
            capabilities[key] = value;
            continue;
        }
        if (Array.isArray(value)) {
            capabilities[key] = value
                .filter((item) => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 20);
        }
    }
    return capabilities;
}

function normalizeRemoteModel(raw, appVersion) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const kind = String(raw.kind || '').trim().toLowerCase();
    const provider = String(raw.provider || '').trim().toLowerCase();
    const transport = String(raw.transport || '').trim();
    const code = String(raw.model_id || raw.code || '').trim();
    const name = String(raw.display_name || raw.name || '').trim();
    const key = String(raw.key || `${provider}:${code}`).trim();
    const status = String(raw.status || 'active').trim().toLowerCase();
    const minimumAppVersion = String(raw.minimum_app_version || '').trim();

    if (!MODEL_KINDS.has(kind) || !provider || !code || !name || !key) return null;
    if (key !== `${provider}:${code}`) return null;
    if (!MODEL_STATUSES.has(status)) return null;
    if (!isSupportedRoute({ kind, provider, transport })) return null;
    if (minimumAppVersion && compareVersions(appVersion, minimumAppVersion) < 0) return null;

    return {
        key,
        kind,
        name,
        code,
        provider,
        transport,
        base_url: getTransportBaseUrl(transport),
        status,
        capabilities: sanitizeCapabilities(raw.capabilities),
        minimum_app_version: minimumAppVersion,
        sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : 1000
    };
}

function normalizeRemoteProvider(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const kind = String(raw.kind || '').trim().toLowerCase();
    const id = String(raw.id || raw.provider || '').trim().toLowerCase();
    const name = String(raw.display_name || raw.name || '').trim();
    const sortOrder = Number(raw.sort_order);
    if (!MODEL_KINDS.has(kind) || !id || !name || !Number.isFinite(sortOrder)) return null;
    if (!describeSupport().routes.some((route) => route.kind === kind && route.provider === id)) return null;
    return {
        kind,
        id,
        name,
        sort_order: sortOrder
    };
}

function validateRemoteCatalog(payload, options = {}) {
    const raw = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const schemaVersion = Number(raw.schema_version);
    if (schemaVersion !== CATALOG_SCHEMA_VERSION) {
        throw new Error(`지원하지 않는 AI model catalog schema_version: ${raw.schema_version || 'missing'}`);
    }
    if (!Array.isArray(raw.models)) {
        throw new Error('AI model catalog models 배열이 필요합니다.');
    }

    const appVersion = String(options.appVersion || '0.0.0');
    const minimumAppVersion = String(raw.minimum_app_version || '').trim();
    if (minimumAppVersion && compareVersions(appVersion, minimumAppVersion) < 0) {
        throw new Error(`AI model catalog는 앱 ${minimumAppVersion} 이상이 필요합니다.`);
    }
    const models = raw.models.map((item) => normalizeRemoteModel(item, appVersion)).filter(Boolean);
    if (raw.models.length > 0 && models.length === 0) {
        throw new Error('호환 가능한 AI model catalog 항목이 없습니다.');
    }

    const unique = new Map();
    for (const model of models) {
        const routeKey = `${model.kind || ''}:${model.key}`;
        if (unique.has(routeKey)) throw new Error(`중복 AI model catalog key: ${model.key}`);
        unique.set(routeKey, model);
    }

    const rawProviders = Array.isArray(raw.providers) ? raw.providers : [];
    const providers = rawProviders.map(normalizeRemoteProvider).filter(Boolean);
    if (rawProviders.length > 0 && providers.length === 0) {
        throw new Error('호환 가능한 AI provider catalog 항목이 없습니다.');
    }
    const uniqueProviders = new Set();
    for (const provider of providers) {
        const providerKey = `${provider.kind}:${provider.id}`;
        if (uniqueProviders.has(providerKey)) throw new Error(`중복 AI provider catalog key: ${providerKey}`);
        uniqueProviders.add(providerKey);
    }

    return {
        schema_version: CATALOG_SCHEMA_VERSION,
        version: String(raw.version || '').trim() || 'unversioned',
        generated_at: String(raw.generated_at || '').trim(),
        minimum_app_version: minimumAppVersion,
        providers,
        models
    };
}

function getMergedProviders() {
    const merged = new Map();
    for (const provider of remoteSnapshot?.providers || []) {
        merged.set(`${provider.kind}:${provider.id}`, clone(provider));
    }
    return Array.from(merged.values()).sort((left, right) => {
        if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
        const orderDelta = Number(left.sort_order || 0) - Number(right.sort_order || 0);
        if (orderDelta !== 0) return orderDelta;
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function getMergedDefinitions() {
    const merged = new Map();
    for (const model of remoteSnapshot?.models || []) {
        const modelKey = `${model.kind}:${model.key}`;
        merged.set(modelKey, {
            ...clone(model),
            capabilities: { ...(model.capabilities || {}) }
        });
    }
    const providerOrder = new Map(getMergedProviders().map((provider) => [
        `${provider.kind}:${provider.id}`,
        Number(provider.sort_order || 0)
    ]));
    return Array.from(merged.values()).sort((left, right) => {
        if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
        const providerOrderDelta = Number(providerOrder.get(`${left.kind}:${left.provider}`) ?? 1000)
            - Number(providerOrder.get(`${right.kind}:${right.provider}`) ?? 1000);
        if (providerOrderDelta !== 0) return providerOrderDelta;
        if (left.provider !== right.provider) return left.provider.localeCompare(right.provider);
        const orderDelta = Number(left.sort_order || 0) - Number(right.sort_order || 0);
        if (orderDelta !== 0) return orderDelta;
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function getAiModelCatalog() {
    // Supabase is the only catalog source. The remote service may load the
    // last-known-good Supabase snapshot from disk before this getter is used.
    const definitions = remoteSnapshot?.models || [];
    const providers = getMergedProviders();
    const providerOrder = new Map(providers.map((provider, index) => [
        `${provider.kind}:${provider.id}`,
        index
    ]));
    const selectable = definitions
        .filter((item) => SELECTABLE_STATUSES.has(item.status))
        .slice()
        .sort((left, right) => {
            const providerDelta = Number(providerOrder.get(`${left.kind}:${left.provider}`) ?? 1000)
                - Number(providerOrder.get(`${right.kind}:${right.provider}`) ?? 1000);
            if (providerDelta !== 0) return providerDelta;
            if (left.provider !== right.provider) return left.provider.localeCompare(right.provider);
            const orderDelta = Number(left.sort_order || 0) - Number(right.sort_order || 0);
            if (orderDelta !== 0) return orderDelta;
            return String(left.name || '').localeCompare(String(right.name || ''));
        });
    return {
        providers: {
            text: providers.filter((item) => item.kind === 'text').map(clone),
            image: providers.filter((item) => item.kind === 'image').map(clone)
        },
        text: selectable.filter((item) => item.kind === 'text').map(clone),
        image: selectable.filter((item) => item.kind === 'image').map(clone)
    };
}

function findModelDefinition(kind, provider, code) {
    const normalizedKind = String(kind || '').trim();
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const normalizedCode = String(code || '').trim();
    return getMergedDefinitions().find((item) => (
        item.kind === normalizedKind
        && item.provider === normalizedProvider
        && item.code === normalizedCode
    )) || null;
}

function applyRemoteCatalog(payload, options = {}) {
    remoteSnapshot = validateRemoteCatalog(payload, options);
    return getCatalogStatus();
}

function clearRemoteCatalog() {
    remoteSnapshot = null;
}

function getCatalogStatus() {
    return {
        source: remoteSnapshot ? 'remote' : 'unavailable',
        version: remoteSnapshot?.version || '',
        schema_version: CATALOG_SCHEMA_VERSION,
        remote_model_count: remoteSnapshot?.models?.length || 0,
        remote_provider_count: remoteSnapshot?.providers?.length || 0
    };
}

module.exports = {
    CATALOG_SCHEMA_VERSION,
    applyRemoteCatalog,
    clearRemoteCatalog,
    compareVersions,
    findModelDefinition,
    getAiModelCatalog,
    getCatalogStatus,
    getMergedDefinitions,
    getMergedProviders,
    validateRemoteCatalog
};
