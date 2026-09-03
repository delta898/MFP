param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDir
)

$ErrorActionPreference = 'Stop'

$packagePath = (Resolve-Path -LiteralPath $PackageDir).Path
$appExecutable = Join-Path $packagePath 'BlogGenius.exe'
if (!(Test-Path -LiteralPath $appExecutable -PathType Leaf)) {
    throw "BlogGenius.exe was not found in package directory: $packagePath"
}

$requiredRuntimeFiles = @(
    'msvcp140.dll',
    'vcruntime140.dll',
    'vcruntime140_1.dll'
)

function Get-VersionedRedistDirectories([string]$VisualStudioPath) {
    $redistRoot = Join-Path $VisualStudioPath 'VC\Redist\MSVC'
    if (!(Test-Path -LiteralPath $redistRoot -PathType Container)) {
        return @()
    }

    return @(Get-ChildItem -LiteralPath $redistRoot -Directory | Sort-Object {
        try { [version]$_.Name } catch { [version]'0.0' }
    } -Descending | ForEach-Object {
        Get-ChildItem -LiteralPath (Join-Path $_.FullName 'x64') -Directory -Filter 'Microsoft.VC*.CRT' -ErrorAction SilentlyContinue
    })
}

$candidateDirectories = @()
if ($env:VCToolsRedistDir) {
    $candidateDirectories += Get-ChildItem -LiteralPath (Join-Path $env:VCToolsRedistDir 'x64') -Directory -Filter 'Microsoft.VC*.CRT' -ErrorAction SilentlyContinue
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere -PathType Leaf) {
    $installations = @(& $vswhere -all -products '*' -property installationPath | Where-Object { $_ })
    foreach ($installation in $installations) {
        $candidateDirectories += Get-VersionedRedistDirectories $installation
    }
}

$runtimeDirectory = $candidateDirectories | Where-Object {
    $candidate = $_.FullName
    $missing = @($requiredRuntimeFiles | Where-Object {
        !(Test-Path -LiteralPath (Join-Path $candidate $_) -PathType Leaf)
    })
    $missing.Count -eq 0
} | Select-Object -First 1

if (!$runtimeDirectory) {
    throw 'A redistributable x64 Microsoft VC runtime directory containing the required DLLs was not found.'
}

$runtimeFiles = @(Get-ChildItem -LiteralPath $runtimeDirectory.FullName -File -Filter '*.dll')
if ($runtimeFiles.Count -eq 0) {
    throw "No redistributable runtime DLLs were found in: $($runtimeDirectory.FullName)"
}

foreach ($runtimeFile in $runtimeFiles) {
    Copy-Item -LiteralPath $runtimeFile.FullName -Destination (Join-Path $packagePath $runtimeFile.Name) -Force
}

foreach ($requiredFile in $requiredRuntimeFiles) {
    $destination = Join-Path $packagePath $requiredFile
    if (!(Test-Path -LiteralPath $destination -PathType Leaf)) {
        throw "Required VC runtime file was not copied: $requiredFile"
    }
}

Write-Host "Bundled $($runtimeFiles.Count) x64 VC runtime DLLs from $($runtimeDirectory.FullName)"
