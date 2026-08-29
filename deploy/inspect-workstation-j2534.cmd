@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 exit /b 1
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required. No software was installed automatically.
  set "inspection_exit=1"
  goto finish
)
if not exist "package-info.json" goto package_missing
if not exist "package-integrity.json" goto package_missing
goto package_check

:package_missing
echo Package verification files are missing. Restore the complete original package.
echo No driver inspection or vehicle connection was started.
set "inspection_exit=1"
goto finish

:package_check
node "scripts\verify-workstation-package.js"
if errorlevel 1 (
  echo Package verification failed. Restore the complete original package.
  echo No driver inspection or vehicle connection was started.
  set "inspection_exit=1"
  goto finish
)

:inspect
if /i "%~1"=="--preflight-index" (
  if not "%~3"=="" if /i not "%~3"=="--no-pause" (
    echo Unknown inspection option. Use --preflight-index NUMBER.
    set "inspection_exit=2"
    goto finish
  )
  node "scripts\inspect-workstation-j2534.js" --preflight-index "%~2"
) else if "%~1"=="" (
  node "scripts\inspect-workstation-j2534.js"
) else if /i "%~1"=="--no-pause" (
  node "scripts\inspect-workstation-j2534.js"
) else (
  echo Unknown inspection option. Use --preflight-index NUMBER.
  set "inspection_exit=2"
  goto finish
)
set "inspection_exit=%errorlevel%"

:finish
if /i not "%~1"=="--no-pause" if /i not "%~3"=="--no-pause" pause
exit /b %inspection_exit%
