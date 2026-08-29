const fs = require('fs');
const path = require('path');
const { loadEnvFiles, parseEnvFile } = require('./load-env');

const TRENDS_ENVIRONMENTS = Object.freeze({
    LOCAL: 'local',
    DEVELOPMENT: 'development',
    PRODUCTION: 'production'
});

const ALLOWED_ENVIRONMENTS = new Set(Object.values(TRENDS_ENVIRONMENTS));

function normalizeText(value) {
    return String(value || '').trim();
}

function assertTrendsEnvironment(value) {
    const environment = normalizeText(value).toLowerCase();
    if (!environment) {
        throw new Error('TRENDS_ENV is required (local|development|production)');
    }
    if (!ALLOWED_ENVIRONMENTS.has(environment)) {
        throw new Error(`unsupported TRENDS_ENV: ${environment}`);
    }
    return environment;
}

function resolveEnvironmentFile(options = {}) {
    const environment = assertTrendsEnvironment(options.environment);
    const baseDir = path.resolve(String(options.baseDir || process.cwd()));
    const explicitFile = normalizeText(options.envFile);
    if (explicitFile) {
        if (!path.isAbsolute(explicitFile)) {
            throw new Error('TRENDS_ENV_FILE must be an absolute path');
        }
        return {
            path: explicitFile,
            source: 'process_environment:TRENDS_ENV_FILE',
            required: true
        };
    }
    const fileName = `.env.trends-collector.${environment}`;
    return {
        path: path.join(baseDir, fileName),
        source: `collector_file:${fileName}`,
        required: false
    };
}

function assertFileEnvironment(filePath, environment) {
    const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    const declared = normalizeText(parsed.TRENDS_ENV).toLowerCase();
    if (declared && declared !== environment) {
        throw new Error(`trends environment file mismatch: selected=${environment}, declared=${declared}`);
    }
}

function loadTrendsEnvironment(options = {}) {
    const env = options.env || process.env;
    const environment = assertTrendsEnvironment(env.TRENDS_ENV);
    const file = resolveEnvironmentFile({
        environment,
        baseDir: options.baseDir,
        envFile: env.TRENDS_ENV_FILE
    });

    if (file.required && !fs.existsSync(file.path)) {
        throw new Error(`TRENDS_ENV_FILE does not exist: ${file.path}`);
    }

    let loadedFile = '';
    if (fs.existsSync(file.path)) {
        assertFileEnvironment(file.path, environment);
        const result = loadEnvFiles({
            baseDir: path.dirname(file.path),
            fileNames: [path.basename(file.path)],
            env
        });
        loadedFile = result.loadedFiles[0] || '';
    }

    const finalEnvironment = assertTrendsEnvironment(env.TRENDS_ENV);
    if (finalEnvironment !== environment) {
        throw new Error(`trends environment changed while loading: ${environment} -> ${finalEnvironment}`);
    }

    return Object.freeze({
        environment,
        configured: true,
        configSource: loadedFile ? file.source : 'process_environment',
        configFileLoaded: Boolean(loadedFile),
        configFileName: loadedFile ? path.basename(loadedFile) : ''
    });
}

function toSafeTrendsEnvironmentDiagnostic(profile = {}) {
    return Object.freeze({
        environment: normalizeText(profile.environment) || 'unselected',
        configured: profile.configured === true,
        configSource: normalizeText(profile.configSource) || 'none',
        configFileLoaded: profile.configFileLoaded === true,
        configFileName: normalizeText(profile.configFileName)
    });
}

function formatTrendsEnvironmentDiagnostic(profile = {}) {
    const diagnostic = toSafeTrendsEnvironmentDiagnostic(profile);
    const source = diagnostic.configFileLoaded
        ? `${diagnostic.configSource} (${diagnostic.configFileName})`
        : diagnostic.configSource;
    return `[Trends Environment] ${diagnostic.environment} / ${source}`;
}

module.exports = {
    TRENDS_ENVIRONMENTS,
    assertTrendsEnvironment,
    formatTrendsEnvironmentDiagnostic,
    loadTrendsEnvironment,
    resolveEnvironmentFile,
    toSafeTrendsEnvironmentDiagnostic
};
