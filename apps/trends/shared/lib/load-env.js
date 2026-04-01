const fs = require('fs');
const path = require('path');

function stripWrappingQuotes(value) {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
            return value.slice(1, -1);
        }
    }
    return value;
}

function parseEnvFile(content = '') {
    const result = {};
    const lines = String(content || '').split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;

        const key = match[1];
        let value = match[2].trim();

        const quoteWrapped = (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith('\'') && value.endsWith('\''))
        );

        if (!quoteWrapped) {
            const commentIndex = value.indexOf(' #');
            if (commentIndex >= 0) {
                value = value.slice(0, commentIndex).trim();
            }
        }

        value = stripWrappingQuotes(value)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r');

        result[key] = value;
    }
    return result;
}

function loadEnvFiles(options = {}) {
    const baseDir = path.resolve(String(options.baseDir || process.cwd()));
    const fileNames = Array.isArray(options.fileNames) && options.fileNames.length > 0
        ? options.fileNames
        : ['.env'];
    const env = options.env || process.env;
    const override = options.override === true;

    const loadedFiles = [];
    for (const fileName of fileNames) {
        const filePath = path.join(baseDir, fileName);
        if (!fs.existsSync(filePath)) continue;

        const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
        for (const [key, value] of Object.entries(parsed)) {
            if (!override && Object.prototype.hasOwnProperty.call(env, key) && String(env[key]) !== '') {
                continue;
            }
            env[key] = value;
        }
        loadedFiles.push(filePath);
    }

    return {
        baseDir,
        loadedFiles
    };
}

module.exports = {
    loadEnvFiles,
    parseEnvFile
};
