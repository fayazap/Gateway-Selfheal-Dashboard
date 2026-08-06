@echo off
REM Optional overrides: script.bat [ssh_host] [ssh_username] [ssh_password]
REM With no arguments, docker-compose falls back to the values in .env.
if not "%~1"=="" set SSH_HOST=%~1
if not "%~2"=="" set SSH_USERNAME=%~2
if not "%~3"=="" set SSH_PASSWORD=%~3
docker-compose up --build