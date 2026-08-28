@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto directory_error

node --version >nul 2>&1
if errorlevel 1 goto node_error

node -e "require.resolve('express')" >nul 2>&1
if errorlevel 1 goto dependency_error

node "scripts\start-local-workstation.js"
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

:finish
if /i "%~1"=="--no-pause" exit /b %workstation_exit%
if not "%workstation_exit%"=="0" pause
exit /b %workstation_exit%
