@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto directory_error

node --version >nul 2>&1
if errorlevel 1 goto node_error

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto runtime_error

node -e "require.resolve('express')" >nul 2>&1
if errorlevel 1 goto dependency_error

set "browser_option=--open-browser"
if /i "%~1"=="--no-browser" set "browser_option="
if /i "%~1"=="--no-pause" set "browser_option="
node "scripts\start-local-workstation.js" %browser_option%
set "workstation_exit=%errorlevel%"
goto finish

:directory_error
echo Cannot open the application folder.
set "workstation_exit=1"
goto finish

:node_error
echo Node.js was not found. Install Node.js and reopen this launcher.
echo No software was installed automatically.
set "workstation_exit=1"
goto finish

:dependency_error
echo Required packages are missing. Run npm install in the deploy folder first.
echo Internet is required for initial setup, not for local startup afterward.
set "workstation_exit=1"
goto finish

:runtime_error
echo Node.js 22 or newer is required. Node.js 24 LTS is recommended.
echo Update Node.js before using this launcher. No software was installed automatically.
set "workstation_exit=1"

:finish
if /i "%~1"=="--no-pause" exit /b %workstation_exit%
if not "%workstation_exit%"=="0" pause
exit /b %workstation_exit%
