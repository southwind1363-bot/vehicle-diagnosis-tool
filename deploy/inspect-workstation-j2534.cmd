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
set "inspection_no_pause="
if /i "%~1"=="--no-pause" set "inspection_no_pause=1"
if /i "%~2"=="--no-pause" set "inspection_no_pause=1"
if /i "%~3"=="--no-pause" set "inspection_no_pause=1"
if /i "%~4"=="--no-pause" set "inspection_no_pause=1"
if /i "%~1"=="--preflight-index" (
  if "%~2"=="" goto invalid_option
  if "%~3"=="" (
    node "scripts\inspect-workstation-j2534.js" --preflight-index "%~2"
  ) else if /i "%~3"=="--no-pause" (
    if not "%~4"=="" goto invalid_option
    node "scripts\inspect-workstation-j2534.js" --preflight-index "%~2"
  ) else if /i "%~3"=="--evidence-json" (
    if not "%~4"=="" if /i not "%~4"=="--no-pause" goto invalid_option
    node "scripts\inspect-workstation-j2534.js" --preflight-index "%~2" --evidence-json
  ) else (
    goto invalid_option
  )
) else if /i "%~1"=="--evidence-json" (
  if not "%~2"=="" if /i not "%~2"=="--no-pause" goto invalid_option
  node "scripts\inspect-workstation-j2534.js" --evidence-json
) else if "%~1"=="" (
  node "scripts\inspect-workstation-j2534.js"
) else if /i "%~1"=="--no-pause" (
  if not "%~2"=="" goto invalid_option
  node "scripts\inspect-workstation-j2534.js"
) else (
  goto invalid_option
)
set "inspection_exit=%errorlevel%"
goto finish

:invalid_option
echo Unknown inspection option. Use --preflight-index NUMBER and optionally --evidence-json.
set "inspection_exit=2"

:finish
if not defined inspection_no_pause pause
exit /b %inspection_exit%
