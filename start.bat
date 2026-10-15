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

rem Saved items belong to the address, so the site always runs on port 5173. If something is
rem already listening there, it's almost surely unktilz in another window: just open that.
netstat -ano -p tcp | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo  unktilz is already running. Opening it in your browser...
  start "" http://localhost:5173
  timeout /t 3 >nul
  exit /b 0
)

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo  First run: installing what the site needs. This takes a moment...
  echo.
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "node_modules\vite\bin\vite.js" goto failed

echo.
echo  ============================================================
echo   unktilz is running at http://localhost:5173
echo   Your browser opens by itself.
echo   Keep this window open - closing it stops the site.
echo  ============================================================
echo.
rem Vite is started with node directly instead of "npm run dev": npm's launcher scripts break
rem when the folder path contains characters like & (e.g. "Minecraft & games").
node "%~dp0node_modules\vite\bin\vite.js" --open --port 5173 --strictPort
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
echo  Node.js isn't installed, and the site needs it.
where winget >nul 2>nul
if errorlevel 1 goto node_manual
choice /c YN /m " Install it now"
if errorlevel 2 goto node_manual
echo.
echo  Installing Node.js LTS (Windows may ask for permission)...
call winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
rem This window still has the old PATH; add Node's folder so we can carry on right away.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 exit /b 0
:node_manual
echo  Opening nodejs.org - install the LTS version, then run start.bat again.
start "" https://nodejs.org
exit /b 1

:failed
echo.
echo  Something went wrong (see above). Check your internet connection and try again.
pause
exit /b 1

:end
pause
