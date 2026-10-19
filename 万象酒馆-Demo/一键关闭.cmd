@echo off
setlocal
title Wanxiang Tavern - Stop
set "DEMO_SCRIPT=%~dp0launch.ps1"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%DEMO_SCRIPT%" -Stop %*
set "DEMO_RESULT=%ERRORLEVEL%"
if not "%DEMO_RESULT%"=="0" pause
exit /b %DEMO_RESULT%
