@echo off
rem TINNO LCM Dashboard - demo mode: simulated GitLab catalogue and modem, nothing is sent to a real device.
title TINNO LCM Dashboard (demo) - close this window to stop
set "APP=%~dp0"
set "LCM_PUBLIC_DIR=%APP%public"
if not defined PORT set "PORT=18081"
set "LCM_OPEN_BROWSER=true"
rem Windows may reserve the port (Hyper-V/WSL/Docker): then the next free port is used automatically.
set "LCM_PORT_FALLBACK=true"
"%APP%node.exe" "%APP%demo.mjs"
if errorlevel 1 pause
