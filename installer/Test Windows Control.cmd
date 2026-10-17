@echo off
setlocal
cd /d "%~dp0resources\app"
if errorlevel 1 goto missing
if not exist "dist-server\windows-smoke.js" goto missing
if not exist "dist-server\windows-validation.js" goto missing
echo AGENTS will test only its own disposable validation window.
echo Progress prints every five seconds. The test has a three-minute overall limit.
echo Please leave the keyboard and mouse untouched while the test runs.
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0AGENTS.exe" "dist-server\windows-smoke.js"
set "AGENTS_TEST_EXIT=%ERRORLEVEL%"
if not "%AGENTS_TEST_EXIT%"=="0" echo Windows validation did not pass. Copy the error above when reporting it.
echo Test finished with exit code %AGENTS_TEST_EXIT%. The pause below only keeps this result visible.
pause
exit /b %AGENTS_TEST_EXIT%
:missing
echo FAIL: Validation files are missing. Reinstall the latest verified package.
pause
exit /b 1
