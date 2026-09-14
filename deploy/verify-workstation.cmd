@echo off
setlocal
if not "%~2"=="" goto invalid_arguments
if "%2"=="""" goto invalid_arguments
if "%~1"=="" goto empty_first_argument
if /i not "%~1"=="--no-pause" goto invalid_arguments
goto arguments_checked
:empty_first_argument
if not "%1"=="" goto invalid_arguments
:arguments_checked
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

:invalid_arguments
echo Package verification failed: unsupported_arguments
echo Run verify-workstation.cmd inside the package you want to check. Only --no-pause is supported.
echo No verification was performed. No files were changed.
exit /b 1
