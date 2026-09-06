param(
    [Parameter(Mandatory = $true)]
    [string]$PocExe,
    [string]$OutputDir = (Join-Path $env:TEMP ("BlogGenius-update-launch-poc-" + (Get-Date -Format 'yyyyMMdd-HHmmss')))
)

$ErrorActionPreference = 'Stop'
$resolvedExe = (Resolve-Path -LiteralPath $PocExe).Path
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$startedAt = Get-Date
$cases = @()

foreach ($mode in @('current', 'bootstrap')) {
    $caseDir = Join-Path $OutputDir $mode
    New-Item -ItemType Directory -Path $caseDir -Force | Out-Null
    $previousOutput = $env:BLOGGENIUS_UPDATE_POC_OUTPUT
    $env:BLOGGENIUS_UPDATE_POC_OUTPUT = $OutputDir
    try {
        $process = Start-Process -FilePath $resolvedExe -ArgumentList "--mode=$mode" -Wait -PassThru
    } finally {
        $env:BLOGGENIUS_UPDATE_POC_OUTPUT = $previousOutput
    }
    Start-Sleep -Seconds 2
    $parentResultPath = Join-Path $caseDir 'parent-result.json'
    $parentResult = if (Test-Path -LiteralPath $parentResultPath) {
        Get-Content -LiteralPath $parentResultPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        $null
    }
    $cases += [ordered]@{
        mode = $mode
        parentExitCode = $process.ExitCode
        parentResult = $parentResult
        helperReady = Test-Path -LiteralPath (Join-Path $caseDir 'helper.ready')
        helperSurvived = Test-Path -LiteralPath (Join-Path $caseDir 'helper.survived')
        helperLogExists = Test-Path -LiteralPath (Join-Path $caseDir 'helper.log')
    }
}

$signature = Get-AuthenticodeSignature -LiteralPath $resolvedExe
$zoneIdentifier = Get-Item -LiteralPath ($resolvedExe + ':Zone.Identifier') -ErrorAction SilentlyContinue
$securityEvents = @()
$eventQueries = @(
    @{ LogName = 'Microsoft-Windows-CodeIntegrity/Operational'; Id = @(3033, 3077, 3089) },
    @{ LogName = 'Microsoft-Windows-AppLocker/MSI and Script'; Id = @(8028, 8029, 8040) },
    @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; Id = @(1116, 1117, 1121, 1122) }
)
foreach ($query in $eventQueries) {
    try {
        $securityEvents += Get-WinEvent -FilterHashtable @{
            LogName = $query.LogName
            Id = $query.Id
            StartTime = $startedAt.AddMinutes(-1)
        } -ErrorAction Stop | Select-Object -First 20 TimeCreated, Id, ProviderName, Message
    } catch { }
}

$report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    computerName = $env:COMPUTERNAME
    windowsVersion = [System.Environment]::OSVersion.VersionString
    executable = $resolvedExe
    authenticode = [ordered]@{
        status = [string]$signature.Status
        statusMessage = [string]$signature.StatusMessage
        signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    }
    hasZoneIdentifier = [bool]$zoneIdentifier
    cases = $cases
    relevantSecurityEvents = $securityEvents
}
$reportPath = Join-Path $OutputDir 'report.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8 -Force

Write-Host "PoC report: $reportPath"
$cases | Format-Table mode, parentExitCode, helperReady, helperSurvived, helperLogExists -AutoSize

if (-not ($cases | Where-Object { $_.mode -eq 'bootstrap' -and $_.helperReady -and $_.helperSurvived })) {
    exit 1
}
