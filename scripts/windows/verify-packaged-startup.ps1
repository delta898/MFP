param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDir,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion,

    [switch]$IncludeSafeMode
)

$ErrorActionPreference = 'Stop'
$packagePath = (Resolve-Path -LiteralPath $PackageDir).Path
$launcher = Join-Path $packagePath 'BlogGenius.exe'
$runtime = Join-Path $packagePath 'BlogGenius-runtime.exe'

if (!(Test-Path -LiteralPath $launcher -PathType Leaf) -or !(Test-Path -LiteralPath $runtime -PathType Leaf)) {
    throw 'The Windows launcher/runtime pair is incomplete.'
}

$expectedVersionClean = $ExpectedVersion.TrimStart('v')
$runtimeVersion = (Get-Item -LiteralPath $runtime).VersionInfo.FileVersion
if ($runtimeVersion -ne $expectedVersionClean) {
    throw "Packaged runtime version mismatch: expected=$expectedVersionClean actual=$runtimeVersion"
}

foreach ($binary in @($launcher, $runtime)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $binary
    Write-Host "Authenticode: $(Split-Path $binary -Leaf) status=$($signature.Status)"
}
Write-Host 'This startup check validates technical execution only; it does not prove SmartScreen reputation or trusted publisher status.'

$diagnosticRoot = Join-Path $env:LOCALAPPDATA 'BlogGenius'
$bootstrapLog = Join-Path $diagnosticRoot 'logs\bootstrap.log'

function Invoke-StartupProbe([string[]]$Arguments, [string]$CompletionPattern, [string]$Label) {
    if (Test-Path -LiteralPath $diagnosticRoot) {
        Remove-Item -LiteralPath $diagnosticRoot -Recurse -Force
    }

    $supervisor = Start-Process -FilePath $launcher -ArgumentList $Arguments -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 240; $attempt++) {
        Start-Sleep -Milliseconds 250
        if ((Test-Path -LiteralPath $bootstrapLog) -and (Select-String -LiteralPath $bootstrapLog -Pattern $CompletionPattern -Quiet)) {
            $ready = $true
            break
        }
        if ($supervisor.HasExited) { break }
    }

    if (!$supervisor.HasExited) {
        $supervisor.WaitForExit(10000) | Out-Null
    }
    if (!$supervisor.HasExited) {
        try { $supervisor.Kill() } catch { }
        throw "Packaged $Label startup probe did not exit within 70 seconds."
    }
    if (!$ready) {
        if (Test-Path -LiteralPath $bootstrapLog) { Get-Content -LiteralPath $bootstrapLog -Tail 120 }
        throw "Packaged $Label UI did not reach the renderer startup completion checkpoint."
    }
    if ($supervisor.ExitCode -ne 0) {
        throw "Packaged $Label startup probe failed with exit code $($supervisor.ExitCode)."
    }

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (!(Get-Process -Name 'BlogGenius-runtime' -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
    if (Get-Process -Name 'BlogGenius-runtime' -ErrorAction SilentlyContinue) {
        throw "Packaged $Label startup probe left the Electron runtime running."
    }

    Write-Host "Verified actual $Label application startup through renderer readiness."
}

Invoke-StartupProbe `
    -Arguments @('--bloggenius-startup-probe') `
    -CompletionPattern '"phase":"STARTUP_PROBE_COMPLETE".*"safeMode":false' `
    -Label 'normal-mode'

if ($IncludeSafeMode) {
    Invoke-StartupProbe `
        -Arguments @('--bloggenius-safe-mode', '--bloggenius-startup-probe') `
        -CompletionPattern '"phase":"STARTUP_PROBE_COMPLETE".*"safeMode":true' `
        -Label 'safe-mode'
}
