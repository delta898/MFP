const { app } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function readArgument(name, fallback = '') {
    const prefix = `--${name}=`;
    const value = process.argv.find((argument) => argument.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
}

function waitForMarker(markerPath, child, timeoutMs = 7000) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        let childExit = null;
        child.once('exit', (code, signal) => {
            childExit = { code, signal: signal || null };
        });
        const timer = setInterval(() => {
            if (fs.existsSync(markerPath)) {
                clearInterval(timer);
                resolve({ ready: true, childExit });
                return;
            }
            if (childExit || Date.now() - startedAt >= timeoutMs) {
                clearInterval(timer);
                resolve({ ready: false, childExit, timedOut: !childExit });
            }
        }, 50);
    });
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function quotePowerShellLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function run() {
    const mode = readArgument('mode');
    const outputRoot = readArgument('output', process.env.BLOGGENIUS_UPDATE_POC_OUTPUT || '');
    if (!['current', 'bootstrap'].includes(mode) || !path.isAbsolute(outputRoot)) {
        throw new Error('Expected --mode=current|bootstrap and an absolute PoC output path.');
    }

    const caseDir = path.join(outputRoot, mode);
    fs.mkdirSync(caseDir, { recursive: true });
    const readyPath = path.join(caseDir, 'helper.ready');
    const survivedPath = path.join(caseDir, 'helper.survived');
    const helperLogPath = path.join(caseDir, 'helper.log');
    const bootstrapLogPath = path.join(caseDir, 'bootstrap.log');
    const resultPath = path.join(caseDir, 'parent-result.json');
    const helperPath = path.join(caseDir, 'helper.ps1');
    const bootstrapPath = path.join(caseDir, 'bootstrap.ps1');
    for (const stalePath of [readyPath, survivedPath, helperLogPath, bootstrapLogPath, resultPath]) {
        fs.rmSync(stalePath, { force: true });
    }

    const helperBody = `
$ErrorActionPreference = 'Stop'
$readyPath = ${quotePowerShellLiteral(readyPath)}
$survivedPath = ${quotePowerShellLiteral(survivedPath)}
$logPath = ${quotePowerShellLiteral(helperLogPath)}
$parentPid = ${process.pid}
Set-Content -LiteralPath $logPath -Value "helper started pid=$PID parent=$parentPid" -Encoding UTF8 -Force
Set-Content -LiteralPath $readyPath -Value $PID -Encoding ASCII -Force
for ($i = 0; $i -lt 200; $i++) {
    if (-not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 100
}
if (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) {
    Add-Content -LiteralPath $logPath -Value 'parent did not exit' -Encoding UTF8
    exit 2
}
Start-Sleep -Milliseconds 750
Set-Content -LiteralPath $survivedPath -Value "survived pid=$PID" -Encoding ASCII -Force
Add-Content -LiteralPath $logPath -Value 'helper survived parent exit' -Encoding UTF8
exit 0
`.trimStart();
    fs.writeFileSync(helperPath, helperBody, 'utf8');

    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    const powerShellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const helperArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath];
    const outputFd = fs.openSync(bootstrapLogPath, 'a');
    let command = powerShellPath;
    let args = helperArgs;
    let options = {
        detached: true,
        stdio: ['ignore', outputFd, outputFd],
        windowsHide: true
    };

    if (mode === 'bootstrap') {
        const encodedInvocation = Buffer.from(`& ${quotePowerShellLiteral(helperPath)}`, 'utf16le').toString('base64');
        const bootstrapBody = `
$ErrorActionPreference = 'Stop'
$powerShellPath = ${quotePowerShellLiteral(powerShellPath)}
$arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', '${encodedInvocation}')
$child = Start-Process -FilePath $powerShellPath -ArgumentList $arguments -WindowStyle Hidden -PassThru
Write-Output "started helper pid=$($child.Id)"
exit 0
`.trimStart();
        fs.writeFileSync(bootstrapPath, bootstrapBody, 'utf8');
        args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bootstrapPath];
        options = {
            detached: false,
            stdio: ['ignore', outputFd, outputFd],
            windowsHide: true
        };
    }

    const startedAt = new Date().toISOString();
    const child = spawn(command, args, options);
    const readiness = await waitForMarker(readyPath, child);
    writeJson(resultPath, {
        mode,
        packaged: app.isPackaged,
        electron: process.versions.electron,
        platform: process.platform,
        arch: process.arch,
        startedAt,
        command,
        detached: options.detached,
        ready: readiness.ready,
        childExit: readiness.childExit,
        timedOut: Boolean(readiness.timedOut)
    });
    fs.closeSync(outputFd);
    app.exit(readiness.ready ? 0 : 1);
}

app.whenReady().then(run).catch((error) => {
    const outputRoot = readArgument('output', process.env.BLOGGENIUS_UPDATE_POC_OUTPUT || '');
    const mode = readArgument('mode', 'unknown');
    if (path.isAbsolute(outputRoot)) {
        const caseDir = path.join(outputRoot, mode);
        fs.mkdirSync(caseDir, { recursive: true });
        writeJson(path.join(caseDir, 'parent-result.json'), {
            mode,
            packaged: app.isPackaged,
            error: error.message,
            stack: error.stack
        });
    }
    app.exit(1);
});
