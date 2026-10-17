const path = require('node:path');
const { Updater } = require('../updater');

async function main() {
    const appRootDir = process.argv[2];
    const sourceDir = process.argv[3];
    const userDataDir = process.argv[4];
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    const harmlessExecutable = path.join(systemRoot, 'System32', 'where.exe');
    const updater = new Updater({
        appRootDir,
        userDataDir,
        platform: 'win32',
        executablePath: harmlessExecutable,
        windowsHelperReadyTimeoutMs: 10000
    });
    updater.updateInfo = { latestVersion: '0.0.0-windows-bootstrap-test' };
    updater.prepareWindowsDeferredApply(sourceDir, {
        operationId: 'windows-bootstrap-integration',
        targetVersion: '0.0.0-windows-bootstrap-test'
    });
    await updater.restart();
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
});
