@echo off
rem Builds dist\dashboard.exe (PyInstaller) and then the Windows installer
rem dist\eMTA-SelfHealing-Dashboard-Setup-5.0.exe (Inno Setup 6).
rem Needs: Python 3 on PATH, Inno Setup 6 (https://jrsoftware.org/isdl.php).
setlocal
cd /d "%~dp0"

echo === 1/3 Python packages ===
python -m pip install -r requirements.txt pyinstaller
if errorlevel 1 goto :err

echo === 2/3 dashboard.exe ===
python -m PyInstaller --noconfirm --clean dashboard.spec
if errorlevel 1 goto :err
if not exist "dist\dashboard.exe" goto :err

echo === 3/3 installer ===
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" goto :noinno
"%ISCC%" installer\dashboard.iss
if errorlevel 1 goto :err

echo.
echo Done. The installer is in the dist folder.
exit /b 0

:noinno
echo.
echo Inno Setup 6 was not found. Install it from https://jrsoftware.org/isdl.php
echo and run this file again. dist\dashboard.exe has been built.
exit /b 1

:err
echo.
echo Build failed - see the messages above.
exit /b 1
