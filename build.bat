@echo off
setlocal enabledelayedexpansion

set APP_NAME=BlogGenius
for /f "usebackq delims=" %%i in (`node -p "require('./package.json').version"`) do set VERSION=%%i
set ROOT_DIR_NAME=%APP_NAME%-v%VERSION%-win-x64
set ROOT_OUT=dist\%ROOT_DIR_NAME%
set ROOT_ZIP=dist\%ROOT_DIR_NAME%.zip

echo 🔍 [Check] 빌드 환경을 점검합니다...

if not exist node_modules (
    echo    📦 라이브러리가 없습니다. 지금 설치합니다... (npm install)
    call npm install || exit /b 1
    echo    🎭 Playwright 브라우저를 다운로드합니다...
    call npx playwright install || exit /b 1
) else (
    echo    ✅ 라이브러리가 이미 설치되어 있습니다.
)

if not exist src\config\secret.js (
    echo.
    echo 🚨 [Error] 'src\config\secret.js' 파일이 없습니다.
    exit /b 1
)

echo 🧹 [Prepare] dist 폴더를 준비합니다...
if not exist dist mkdir dist

echo 🚀 [Build] %APP_NAME% v%VERSION% Windows 패키징을 시작합니다...
echo ---------------------------------------------------

echo    🧹 이전 win-x64 산출물 정리 중...
for /d %%D in ("dist\*-win-x64") do (
    if exist "%%~fD" rmdir /s /q "%%~fD"
)
for %%F in ("dist\*-win-x64.zip") do (
    if exist "%%~fF" del /f /q "%%~fF"
)
if exist "dist\gui-temp" rmdir /s /q "dist\gui-temp"

mkdir "%ROOT_OUT%"
mkdir "%ROOT_OUT%\config"
mkdir "%ROOT_OUT%\config\images"
mkdir "%ROOT_OUT%\data"

if exist "config\config.json.sample" copy /y "config\config.json.sample" "%ROOT_OUT%\config\config.json.sample" >nul
if exist "config\images" xcopy /e /i /y "config\images" "%ROOT_OUT%\config\images" >nul
if exist "README.md" (
    copy /y "README.md" "%ROOT_OUT%\README.md" >nul
)

echo    📦 GUI 빌드 중...
call npx electron-packager . "%APP_NAME%" ^
    --platform=win32 --arch=x64 ^
    --out=dist\gui-temp --overwrite ^
    --asar.unpack="**/{node_modules/sharp,node_modules/@img}/**/*" ^
    --icon=assets/icons/icon ^
    --ignore="^/([.]git|dist|logs|data|config|Videos|workspace|supabase|temp|docs|tmp|tmp_update|tests|testscripts|test_images|scripts|sql|NaverBlogAutoTool|BlogGenius.app|BlogGenius-cli|BlogGenius-cli.exe)($|/)|^/(debug_.*|trend_structure_dump[.]html|jobs[.]xlsx|topics.*[.]xlsx|topics 2[.]numbers|[.]DS_Store)$|(?:[.]zip|[.]tar[.]gz|[.]bak|[.]numbers|[.]dmg|[.]old|[.]build_stamp_.*)$|/node_modules/(electron|electron-packager|[.]cache)($|/)" ^
    --quiet
if errorlevel 1 (
    echo    ❌ [Error] GUI 빌드 실패 (win-x64)
    exit /b 1
)

if exist "dist\gui-temp\%APP_NAME%-win32-x64" (
    xcopy /e /i /y "dist\gui-temp\%APP_NAME%-win32-x64\*" "%ROOT_OUT%\" >nul
)
if exist "dist\gui-temp" rmdir /s /q "dist\gui-temp"

echo    ✅ win-x64 빌드 완료

echo 📦 ZIP 생성 중...
powershell -NoProfile -Command "Compress-Archive -Path '%ROOT_OUT%\\*' -DestinationPath '%ROOT_ZIP%' -Force" || exit /b 1
echo    ✅ %ROOT_ZIP% 생성 완료

echo ✅ Windows 빌드 완료
endlocal
