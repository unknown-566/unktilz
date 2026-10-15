@echo off
rem Double-click to update unktilz to the newest version on GitHub, then start it.
rem Works for a folder downloaded as a ZIP (no Git needed) and for a git clone.
rem Your saved items live in the browser, not in this folder, so updating never touches them.
setlocal

rem This file may itself get updated, and cmd reads a running .bat from disk line by line,
rem so it first copies itself to the temp folder and continues from that copy.
if /i not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\unktilz-update.bat" >nul
  "%TEMP%\unktilz-update.bat" --from-temp "%~dp0."
)

cd /d "%~2"
title unktilz - update
echo.
echo  unktilz - updating to the newest version from GitHub
echo  ====================================================
echo.

rem Safety: only ever touch a folder that really is unktilz.
if not exist "package.json" goto notproject
findstr /c:"\"name\": \"unktilz\"" package.json >nul
if errorlevel 1 goto notproject

call :ensure_node
if errorlevel 1 goto fail_pause

echo  If the site is running in another window, close that window first (the X at the top).
echo.
pause

if exist ".git" (
  where git >nul 2>nul
  if not errorlevel 1 (
    echo.
    echo  Getting the changes with git...
    git pull --ff-only
    if errorlevel 1 goto failed
    goto install
  )
)

echo.
echo  Downloading the newest version...
set "TMP_DIR=%TEMP%\unktilz-update"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
mkdir "%TMP_DIR%"
curl.exe -L --fail --silent --show-error -o "%TMP_DIR%\main.zip" https://github.com/unknown-566/unktilz/archive/refs/heads/main.zip
if errorlevel 1 goto failed
tar -xf "%TMP_DIR%\main.zip" -C "%TMP_DIR%"
if errorlevel 1 goto failed
set "NEW=%TMP_DIR%\unktilz-main"
if not exist "%NEW%\package.json" goto failed

echo  Copying the new files...
rem These folders are mirrored, so files deleted on GitHub disappear here too
rem (otherwise a removed tool would keep showing up). node_modules is never touched.
for %%D in (src public scripts design) do (
  if exist "%NEW%\%%D" (
    robocopy "%NEW%\%%D" "%CD%\%%D" /MIR /NFL /NDL /NJH /NJS /NP >nul
    if errorlevel 8 goto failed
  )
)
rem Files in the main folder (package.json, index.html, these .bat files...).
robocopy "%NEW%" "%CD%" /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto failed
rmdir /s /q "%TMP_DIR%"

:install
echo  Installing what the site needs...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto failed

echo.
echo  Done, you have the newest version. Starting the site...
call "%CD%\start.bat"
exit

rem ---- Node.js: install it with winget if it's missing (asks first) ----
:ensure_node
where node >nul 2>nul
if not errorlevel 1 exit /b 0
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  exit /b 0
)
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
echo  Opening nodejs.org - install the LTS version, then run this file again.
start "" https://nodejs.org
exit /b 1

:notproject
echo  This file has to be in the unktilz folder (next to package.json).
goto fail_pause

:failed
echo.
echo  The update didn't finish (see above). Check your internet connection and try again.
echo  Your files are as they were, or partly updated - running it again finishes the job.

:fail_pause
echo.
pause
exit
