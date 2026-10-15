@echo off
rem Double-click to run unktilz. Opens the site in your browser; closing this window stops it.
setlocal
cd /d "%~dp0"
title unktilz

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js neni nainstalovany.
  echo  Otviram nodejs.org - stahni verzi LTS, nainstaluj ji a pak spust start.bat znovu.
  start "" https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  Prvni spusteni: instaluji, co web potrebuje. Chvili to potrva...
  echo.
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto failed
)

echo.
echo  ============================================================
echo   unktilz bezi. Prohlizec se otevre sam.
echo   Tohle okno nech otevrene - jeho zavrenim web vypnes.
echo  ============================================================
echo.
call npm.cmd run dev -- --open
goto end

:failed
echo.
echo  Neco se nepovedlo (viz text vyse). Zkontroluj pripojeni k internetu a zkus to znovu.
pause
exit /b 1

:end
pause
