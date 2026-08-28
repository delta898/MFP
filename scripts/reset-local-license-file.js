#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function clearLocalLicenseFile(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const fileSystem = options.fs || fs;
    const targetPath = path.join(repoRoot, 'config', 'license.local.key');

    if (!fileSystem.existsSync(targetPath)) {
        return Object.freeze({ removed: false, path: targetPath });
    }

    fileSystem.unlinkSync(targetPath);
    return Object.freeze({ removed: true, path: targetPath });
}

if (require.main === module) {
    try {
        const result = clearLocalLicenseFile();
        process.stdout.write(result.removed
            ? 'Local 라이선스 파일을 초기화했습니다. 다음 실행에서 이 기기의 키를 다시 발급합니다.\n'
            : '초기화할 Local 라이선스 파일이 없습니다.\n');
    } catch (error) {
        process.stderr.write(`Local 라이선스 파일 초기화 실패: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    clearLocalLicenseFile
};
