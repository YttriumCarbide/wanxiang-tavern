@echo off
setlocal
title Wanxiang Tavern - Start
set "DEMO_SCRIPT="
for /d %%D in ("%~dp0*-Demo") do (
    if exist "%%~fD\launch.ps1" set "DEMO_SCRIPT=%%~fD\launch.ps1"
)
if not defined DEMO_SCRIPT (
    echo Cannot find the Demo launch script.
    pause
    exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%DEMO_SCRIPT%" %*
set "DEMO_RESULT=%ERRORLEVEL%"
if not "%DEMO_RESULT%"=="0" pause
exit /b %DEMO_RESULT%
