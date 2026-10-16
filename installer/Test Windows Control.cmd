@echo off
setlocal
cd /d "%~dp0resources\app"
echo AGENTS will test only its own disposable validation window.
echo Please leave the keyboard and mouse untouched while the test runs.
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0AGENTS.exe" "dist-server\windows-smoke.js"
set "AGENTS_TEST_EXIT=%ERRORLEVEL%"
if not "%AGENTS_TEST_EXIT%"=="0" echo Windows validation did not pass. Copy the error above when reporting it.
pause
exit /b %AGENTS_TEST_EXIT%
