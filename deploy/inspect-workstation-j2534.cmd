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
if exist "package-info.json" goto package_check
if exist "package-integrity.json" goto package_check
goto inspect

:package_check
node "scripts\verify-workstation-package.js"
if errorlevel 1 (
  echo Package verification failed. Restore the complete original package.
  echo No driver inspection or vehicle connection was started.
  set "inspection_exit=1"
  goto finish
)

:inspect
node "scripts\inspect-workstation-j2534.js"
set "inspection_exit=%errorlevel%"

:finish
if /i not "%~1"=="--no-pause" pause
exit /b %inspection_exit%
