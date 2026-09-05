'use strict';

function uniquePaths(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function resolveLicenseKeyStoragePaths({
    fileName,
    userDataDir = '',
    rootDir = '',
    execDir = '',
    pathImpl
} = {}) {
    const normalizedFileName = String(fileName || '').trim();
    if (!normalizedFileName) {
        return { primaryPath: '', legacyPaths: [] };
    }

    const joinConfigPath = (baseDir) => {
        const normalizedBase = String(baseDir || '').trim();
        return normalizedBase ? pathImpl.join(normalizedBase, 'config', normalizedFileName) : '';
    };

    const durablePath = joinConfigPath(userDataDir);
    const rootPath = joinConfigPath(rootDir);
    const execPath = joinConfigPath(execDir);
    const primaryPath = durablePath || rootPath || execPath;

    return {
        primaryPath,
        legacyPaths: uniquePaths([rootPath, execPath]).filter((candidate) => candidate !== primaryPath)
    };
}

function readLicenseKey(filePath, fsImpl) {
    if (!filePath || !fsImpl.existsSync(filePath)) return '';
    try {
        const value = String(fsImpl.readFileSync(filePath, 'utf8') || '')
            .split(/\r?\n/)
            .find((line) => String(line || '').trim() !== '') || '';
        return String(value).trim();
    } catch (_error) {
        return '';
    }
}

function writeLicenseKey(filePath, licenseKey, fsImpl, pathImpl) {
    fsImpl.mkdirSync(pathImpl.dirname(filePath), { recursive: true });
    fsImpl.writeFileSync(filePath, `${licenseKey}\n`, { encoding: 'utf8', mode: 0o600 });
    try { fsImpl.chmodSync(filePath, 0o600); } catch (_error) { }
}

function loadLicenseKey({ primaryPath = '', legacyPaths = [], fsImpl, pathImpl } = {}) {
    const primaryValue = readLicenseKey(primaryPath, fsImpl);
    if (primaryValue) {
        return {
            value: primaryValue,
            path: primaryPath,
            sourcePath: primaryPath,
            migrated: false,
            migrationError: ''
        };
    }

    for (const legacyPath of uniquePaths(legacyPaths)) {
        const legacyValue = readLicenseKey(legacyPath, fsImpl);
        if (!legacyValue) continue;

        if (!primaryPath || primaryPath === legacyPath) {
            return {
                value: legacyValue,
                path: legacyPath,
                sourcePath: legacyPath,
                migrated: false,
                migrationError: ''
            };
        }

        try {
            writeLicenseKey(primaryPath, legacyValue, fsImpl, pathImpl);
            return {
                value: legacyValue,
                path: primaryPath,
                sourcePath: legacyPath,
                migrated: true,
                migrationError: ''
            };
        } catch (error) {
            return {
                value: legacyValue,
                path: primaryPath,
                sourcePath: legacyPath,
                migrated: false,
                migrationError: String(error?.message || error || 'migration failed')
            };
        }
    }

    return {
        value: '',
        path: primaryPath,
        sourcePath: '',
        migrated: false,
        migrationError: ''
    };
}

module.exports = {
    resolveLicenseKeyStoragePaths,
    readLicenseKey,
    writeLicenseKey,
    loadLicenseKey
};
