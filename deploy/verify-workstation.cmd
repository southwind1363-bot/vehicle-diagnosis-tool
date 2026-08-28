@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 exit /b 1
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. No software was installed automatically.
  if /i not "%~1"=="--no-pause" pause
  exit /b 1
)
node "scripts\verify-workstation-package.js"
set "verification_exit=%errorlevel%"
if /i not "%~1"=="--no-pause" pause
exit /b %verification_exit%
