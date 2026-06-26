@echo off
setlocal enabledelayedexpansion

title Zeno Setup
cd /d "%~dp0"

echo.
echo ==========================================
echo  Zeno setup
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Trying to install Node.js LTS with winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget is not available. Install Node.js LTS from https://nodejs.org and run setup.bat again.
    pause
    exit /b 1
  )
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo Node.js installation failed. Install Node.js LTS manually and run setup.bat again.
    pause
    exit /b 1
  )
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Close this window, open a new terminal, and run setup.bat again.
  pause
  exit /b 1
)

echo Installing app dependencies...
call npm install --include=optional
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo.
echo Building Windows app...
call npm run dist:portable
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Installing Zeno and creating Desktop executables...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-launcher.ps1"
if errorlevel 1 (
  echo Could not install Zeno or create the Desktop executables.
  pause
  exit /b 1
)

echo.
echo Setup complete. You can now open Zeno.exe from your Desktop.
echo An uninstaller was also added as "Uninstall Zeno.exe".
pause
