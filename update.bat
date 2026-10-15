@echo off
rem Double-click to update unktilz to the newest version on GitHub, then start it.
rem Works for a folder downloaded as a ZIP (no Git needed) and for a git clone.
setlocal

rem This file may itself get updated, and cmd reads a running .bat from disk line by line,
rem so it first copies itself to the temp folder and continues from that copy.
if /i not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\unktilz-update.bat" >nul
  "%TEMP%\unktilz-update.bat" --from-temp "%~dp0."
)

cd /d "%~2"
title unktilz - aktualizace
echo.
echo  unktilz - aktualizace na nejnovejsi verzi z GitHubu
echo  ===================================================
echo.

rem Safety: only ever touch a folder that really is unktilz.
if not exist "package.json" goto notproject
findstr /c:"\"name\": \"unktilz\"" package.json >nul
if errorlevel 1 goto notproject

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js neni nainstalovany. Otviram nodejs.org - nainstaluj verzi LTS a spust update.bat znovu.
  start "" https://nodejs.org
  goto fail_pause
)

echo  Pokud ti web uz bezi v jinem okne, zavri ho (krizek nahore), at ho jde aktualizovat.
echo.
pause

if exist ".git" (
  where git >nul 2>nul
  if not errorlevel 1 (
    echo.
    echo  Stahuji zmeny pres git...
    git pull --ff-only
    if errorlevel 1 goto failed
    goto install
  )
)

echo.
echo  Stahuji nejnovejsi verzi...
set "TMP_DIR=%TEMP%\unktilz-update"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
mkdir "%TMP_DIR%"
curl.exe -L --fail --silent --show-error -o "%TMP_DIR%\main.zip" https://github.com/unknown-566/unktilz/archive/refs/heads/main.zip
if errorlevel 1 goto failed
tar -xf "%TMP_DIR%\main.zip" -C "%TMP_DIR%"
if errorlevel 1 goto failed
set "NEW=%TMP_DIR%\unktilz-main"
if not exist "%NEW%\package.json" goto failed

echo  Kopiruji nove soubory...
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
echo  Instaluji, co web potrebuje...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto failed

echo.
echo  Hotovo, mas nejnovejsi verzi. Spoustim web...
call "%CD%\start.bat"
exit

:notproject
echo  Tenhle soubor musi lezet ve slozce s webem unktilz (vedle package.json).
goto fail_pause

:failed
echo.
echo  Aktualizace se nepovedla (viz text vyse). Zkontroluj pripojeni k internetu a zkus to znovu.
echo  Tvoje soubory zustaly, jak byly, nebo jen castecne aktualizovane - dalsi pokus to dorovna.

:fail_pause
echo.
pause
exit
