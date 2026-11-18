@echo off
rem TINNO LCM Dashboard: starts the local backend and opens the dashboard in the browser.
rem Keep this window open while using the dashboard; close it to stop.
title TINNO LCM Dashboard - keep open while using the dashboard, close to stop
set "APP=%~dp0"
set "LCM_CONFIG_FILE=%APP%config.json"
set "LCM_PUBLIC_DIR=%APP%public"
if not defined LCM_DATA_DIR set "LCM_DATA_DIR=%LOCALAPPDATA%\TINNO LCM Dashboard\data"
if not defined PORT set "PORT=18080"
set "LCM_OPEN_BROWSER=true"
rem Windows may reserve the port (Hyper-V/WSL/Docker): then the next free port is used automatically.
set "LCM_PORT_FALLBACK=true"
if not exist "%LCM_CONFIG_FILE%" (
  echo Settings file not found: %LCM_CONFIG_FILE%
  echo Run the installer again and fill in the connection settings.
  pause
  exit /b 1
)
"%APP%node.exe" "%APP%server.mjs"
if errorlevel 1 (
  echo.
  echo The dashboard stopped with an error. See the messages above.
  pause
)
