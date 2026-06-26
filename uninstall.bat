@echo off
setlocal

title Zeno Uninstall
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-zeno.ps1"
if errorlevel 1 (
  echo.
  echo Uninstall failed.
  pause
  exit /b 1
)

pause
