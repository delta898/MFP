param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDir,

    [string]$IconPath
)

$ErrorActionPreference = 'Stop'
$packagePath = (Resolve-Path -LiteralPath $PackageDir).Path
$electronExe = Join-Path $packagePath 'BlogGenius.exe'
$runtimeExe = Join-Path $packagePath 'BlogGenius-runtime.exe'
$source = Join-Path $PSScriptRoot 'startup-launcher\BlogGeniusLauncher.cs'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$compileTempDir = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } elseif ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$compiled = Join-Path $compileTempDir 'BlogGenius-launcher.exe'

foreach ($required in @($electronExe, $source, $compiler)) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required startup launcher input is missing: $required" }
}

$compilerArguments = @(
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.IO.Compression.dll',
    '/reference:System.IO.Compression.FileSystem.dll',
    "/out:$compiled"
)
if ($IconPath) {
    $resolvedIcon = (Resolve-Path -LiteralPath $IconPath).Path
    $compilerArguments += "/win32icon:$resolvedIcon"
}
$compilerArguments += $source

& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $compiled -PathType Leaf)) {
    throw 'Windows startup launcher compilation failed.'
}

Move-Item -LiteralPath $electronExe -Destination $runtimeExe -Force
Copy-Item -LiteralPath $compiled -Destination $electronExe -Force
Write-Host "Installed startup launcher and moved Electron runtime to $runtimeExe"
