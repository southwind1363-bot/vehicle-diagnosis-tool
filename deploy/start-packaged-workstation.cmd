@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 exit /b 1

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto runtime_error

if not exist "package-info.json" goto package_error
if not exist "package-integrity.json" goto package_error
node "scripts\verify-workstation-package.js"
if errorlevel 1 goto package_error

set "browser_option=--open-browser"
if /i "%~1"=="--no-browser" set "browser_option="
if /i "%~1"=="--no-pause" set "browser_option="
node "scripts\start-local-workstation.js" %browser_option%
set "workstation_exit=%errorlevel%"
goto finish

:package_error
echo Package verification failed. Restore the complete original package before starting.
echo No server or vehicle connection was started. No files were repaired.
set "workstation_exit=1"
goto finish

:runtime_error
echo Node.js 22 or newer is required. No software was installed automatically.
set "workstation_exit=1"

:finish
if /i "%~1"=="--no-pause" exit /b %workstation_exit%
if not "%workstation_exit%"=="0" pause
exit /b %workstation_exit%
