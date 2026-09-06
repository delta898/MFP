param(
    [string]$OutputDir = (Join-Path $env:TEMP 'BlogGenius-update-launch-poc-build')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$packageOutput = Join-Path $OutputDir 'package'
New-Item -ItemType Directory -Path $packageOutput -Force | Out-Null

Push-Location $repoRoot
try {
    & npx --no-install electron-packager `
        'scripts/windows/update-launch-poc/app' `
        'BlogGeniusUpdateLaunchPoC' `
        '--platform=win32' `
        '--arch=x64' `
        "--out=$packageOutput" `
        '--overwrite'
    if ($LASTEXITCODE -ne 0) { throw "electron-packager failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$pocExe = Get-ChildItem -LiteralPath $packageOutput -Filter 'BlogGeniusUpdateLaunchPoC.exe' -Recurse | Select-Object -First 1
if (-not $pocExe) { throw 'Packaged PoC executable was not found.' }

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-poc.ps1') -Destination $OutputDir -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-poc.cmd') -Destination $OutputDir -Force

& (Join-Path $PSScriptRoot 'run-poc.ps1') -PocExe $pocExe.FullName -OutputDir (Join-Path $OutputDir 'results')
exit $LASTEXITCODE
