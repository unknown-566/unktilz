@echo off
rem Double-click to run unktilz. Opens the site in your browser; closing this window stops it.
setlocal
cd /d "%~dp0"
title unktilz

call :ensure_node
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo  Prvni spusteni: instaluji, co web potrebuje. Chvili to potrva...
  echo.
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "node_modules\vite\bin\vite.js" goto failed

echo.
echo  ============================================================
echo   unktilz bezi. Prohlizec se otevre sam.
echo   Tohle okno nech otevrene - jeho zavrenim web vypnes.
echo  ============================================================
echo.
rem Vite is started with node directly instead of "npm run dev": npm's launcher scripts break
rem when the folder path contains characters like & (e.g. "Minecraft & games").
node "%~dp0node_modules\vite\bin\vite.js" --open
goto end

rem ---- Node.js: install it with winget if it's missing (asks first) ----
:ensure_node
where node >nul 2>nul
if not errorlevel 1 exit /b 0
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  exit /b 0
)
echo.
echo  Node.js neni nainstalovany a web ho potrebuje.
where winget >nul 2>nul
if errorlevel 1 goto node_manual
choice /c AN /m " Mam ho ted nainstalovat? A = ano, N = ne"
if errorlevel 2 goto node_manual
echo.
echo  Instaluji Node.js LTS (Windows se muze zeptat na povoleni)...
call winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
rem This window still has the old PATH; add Node's folder so we can carry on right away.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 exit /b 0
:node_manual
echo  Otviram nodejs.org - nainstaluj verzi LTS a spust start.bat znovu.
start "" https://nodejs.org
exit /b 1

:failed
echo.
echo  Neco se nepovedlo (viz text vyse). Zkontroluj pripojeni k internetu a zkus to znovu.
pause
exit /b 1

:end
pause
