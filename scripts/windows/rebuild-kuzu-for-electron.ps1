param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$electronRange = [string]$packageJson.devDependencies.electron
$electronVersionMatch = [regex]::Match($electronRange, '\d+\.\d+\.\d+')
if (!$electronVersionMatch.Success) {
    throw "Unable to resolve the Electron version from package.json: $electronRange"
}
$electronVersion = $electronVersionMatch.Value

$kuzuRoot = Join-Path $repoRoot 'node_modules\kuzu'
$kuzuPackagePath = Join-Path $kuzuRoot 'package.json'
$kuzuSourceRoot = Join-Path $kuzuRoot 'kuzu-source'
$nodeApiRoot = Join-Path $kuzuSourceRoot 'tools\nodejs_api'
$cmakePath = Join-Path $nodeApiRoot 'CMakeLists.txt'
foreach ($requiredPath in @($kuzuPackagePath, $kuzuSourceRoot, $cmakePath)) {
    if (!(Test-Path -LiteralPath $requiredPath)) {
        throw "Required Kuzu build input was not found: $requiredPath"
    }
}

$kuzuPackage = Get-Content -LiteralPath $kuzuPackagePath -Raw | ConvertFrom-Json
if ([string]$kuzuPackage.version -ne '0.11.3') {
    throw "Unsupported Kuzu version for the Electron build patch: $($kuzuPackage.version)"
}

$nodeAddonApi = (& node -p "require('path').dirname(require.resolve('node-addon-api/package.json'))").Trim()
if (!$nodeAddonApi -or !(Test-Path -LiteralPath $nodeAddonApi -PathType Container)) {
    throw 'Unable to resolve the node-addon-api include directory.'
}

$cmake = (Get-Content -LiteralPath $cmakePath -Raw) -replace "`r`n", "`n"
$runtimeDefinition = 'add_definitions(-DNODE_RUNTIME=node)'
if (!$cmake.Contains($runtimeDefinition)) {
    throw 'Kuzu CMake runtime definition did not match the expected 0.11.3 source.'
}
$cmake = $cmake.Replace($runtimeDefinition, @'
if(NOT DEFINED NODE_RUNTIME)
  set(NODE_RUNTIME node)
endif()
add_definitions(-DNODE_RUNTIME=${NODE_RUNTIME})
'@.Trim())

$discoveryPattern = '(?s)# If on Windows use npx\.cmd instead of npx.*?string\(STRIP \$\{CMAKE_JS_SRC\} CMAKE_JS_SRC\)'
$discoveryMatches = [regex]::Matches($cmake, $discoveryPattern)
if ($discoveryMatches.Count -ne 1) {
    throw "Kuzu CMake.js discovery block matched $($discoveryMatches.Count) times; expected once."
}
$injectedInputs = @'
if(NOT CMAKE_JS_INC OR NOT CMAKE_JS_LIB)
  message(FATAL_ERROR "Electron CMake.js include and library inputs are required")
endif()

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(
    COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS}
    RESULT_VARIABLE NODELIB_RESULT
  )
  if(NOT NODELIB_RESULT EQUAL 0)
    message(FATAL_ERROR "Failed to generate the Electron node.lib import library")
  endif()
endif()
'@.Trim()
$cmake = [regex]::Replace($cmake, $discoveryPattern, $injectedInputs)

$addonIncludeDefinition = 'get_filename_component(NODE_ADDON_API_INCLUDE_PATH ./node_modules/node-addon-api ABSOLUTE)'
if (!$cmake.Contains($addonIncludeDefinition)) {
    throw 'Kuzu node-addon-api include definition did not match the expected source.'
}
$cmake = $cmake.Replace($addonIncludeDefinition, @'
if(NOT NODE_ADDON_API_INCLUDE_PATH)
  get_filename_component(NODE_ADDON_API_INCLUDE_PATH ./node_modules/node-addon-api ABSOLUTE)
endif()
'@.Trim())

[System.IO.File]::WriteAllText($cmakePath, $cmake + "`n", [System.Text.UTF8Encoding]::new($false))

$parallel = [Math]::Max(1, [Math]::Min(4, [Environment]::ProcessorCount))
$arguments = @(
    '--no-install', 'cmake-js', 'rebuild',
    '--directory', $kuzuSourceRoot,
    '--runtime', 'electron',
    '--runtime-version', $electronVersion,
    '--arch', 'x64',
    '--config', 'Release',
    '--parallel', [string]$parallel,
    '--CDBUILD_NODEJS=TRUE',
    '--CDBUILD_SHELL=FALSE',
    "--CDNODE_ADDON_API_INCLUDE_PATH=$nodeAddonApi"
)

Write-Host "Rebuilding Kuzu $($kuzuPackage.version) for Electron $electronVersion (win32-x64)..."
& npx.cmd @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Kuzu Electron rebuild failed with exit code $LASTEXITCODE"
}

$builtModule = Get-ChildItem -LiteralPath (Join-Path $nodeApiRoot 'build') -Recurse -File -Filter 'kuzujs.node' |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if (!$builtModule) {
    throw 'The rebuilt kuzujs.node output was not found.'
}

$destination = Join-Path $kuzuRoot 'kuzujs.node'
Copy-Item -LiteralPath $builtModule.FullName -Destination $destination -Force
Write-Host "Installed Electron-compatible Kuzu module: $destination"
