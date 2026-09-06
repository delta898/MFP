@echo off
setlocal
set "POC_ROOT=%~dp0"
set "POC_EXE="
for /r "%POC_ROOT%package" %%F in (BlogGeniusUpdateLaunchPoC.exe) do set "POC_EXE=%%~fF"
if not defined POC_EXE (
  echo PoC executable was not found under %POC_ROOT%package
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%POC_ROOT%run-poc.ps1" -PocExe "%POC_EXE%" -OutputDir "%POC_ROOT%results-user"
exit /b %ERRORLEVEL%
