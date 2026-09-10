@echo off
setlocal EnableDelayedExpansion
title Store Manager - Starter (Universal + Auto-Setup)
echo ========================================
echo  Starting BusinessDesk Store Manager
echo  Universal: runs from any folder / USB / PC
echo ========================================
echo.

REM ============================================================
REM  Universal paths — all relative to this .bat location
REM  Works on any PC, any drive, no hardcoded C:\store manager
REM ============================================================
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
REM PB is portable inside project: <ROOT>\pocketbase\pocketbase.exe
set "PB_DIR=%ROOT%\pocketbase"
set "PB_EXE=%PB_DIR%\pocketbase.exe"
set "PB_ZIP=%TEMP%\pocketbase_0.40.2_windows_amd64.zip"
set "PB_URL=https://github.com/pocketbase/pocketbase/releases/download/v0.40.2/pocketbase_0.40.2_windows_amd64.zip"
REM Legacy compat: old absolute locations (if user had previous install)
set "PB_DIR_LEGACY=C:\pocketbase_0.40.2_windows_amd64"
set "PB_EXE_LEGACY=%PB_DIR_LEGACY%\pocketbase.exe"
REM Portable Node fallback (no admin) lives at <ROOT>\nodejs\node.exe
set "NODE_PORTABLE=%ROOT%\nodejs\node.exe"
set "NPM_PORTABLE=%ROOT%\nodejs\npm.cmd"

REM Add portable node to PATH if present (so `where node` finds it)
if exist "%NODE_PORTABLE%" set "PATH=%ROOT%\nodejs;%PATH%"

REM ---- Ensure PocketBase (required for EXE, not just localhost) ----
call :ensurePocketBase
if %errorlevel% neq 0 (
    echo [FATAL] PocketBase setup failed. Check internet and re-run.
    echo         Tip: copy portable pocketbase folder: %ROOT%\pocketbase\
    pause
    exit /b 1
)

REM ---- Ensure Node.js (for tunnel + fallback Vite + exe build) ----
REM     Node is OPTIONAL if EXE already exists — offline EXE can run without Node
call :ensureNode
set "NODE_OK=%errorlevel%"
if %NODE_OK% neq 0 (
    echo [WARN] Node.js not found — tunnel/build will be skipped, but EXE can still run if present.
    echo        To enable tunnel: install from https://nodejs.org or place portable at %ROOT%\nodejs\
)

REM ---- Ensure project dependencies (only if Node OK) ----
if %NODE_OK% equ 0 call :ensureDeps

REM ---- Ensure EXE (if not present, build it — needs Node) ----
if %NODE_OK% equ 0 call :ensureExe

goto :afterChecks

REM ============================================================
REM  Functions — all use %ROOT% so they work on any PC
REM ============================================================
:ensureNode
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js found: %%v
    where npm >nul 2>nul
    if %errorlevel% equ 0 goto :eof
)
if exist "%NODE_PORTABLE%" (
    echo [OK] Portable Node found: %NODE_PORTABLE%
    for /f "tokens=*" %%v in ('"%NODE_PORTABLE%" -v 2^>nul') do echo       %%v
    goto :eof
)
echo [SETUP] Node.js not found — installing (universal: tries winget, then portable)...
where winget >nul 2>nul
if %errorlevel% equ 0 (
    echo         winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    timeout /t 15 /nobreak >nul
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        echo [OK] Node.js installed via winget.
        set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
        goto :eof
    )
    echo [WARN] winget did not make node available, trying portable download (no admin needed)...
)
echo         Downloading portable Node.js to %ROOT%\nodejs\ ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip'; $o=Join-Path $env:TEMP 'node-portable.zip'; $d='%ROOT%\nodejs'; try { Write-Host ('Downloading '+$u); Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing; Write-Host ('Saved '+(Get-Item $o).Length+' bytes'); New-Item -ItemType Directory -Path $d -Force | Out-Null; Expand-Archive -LiteralPath $o -DestinationPath $env:TEMP -Force; $src=Get-ChildItem -Path $env:TEMP -Directory -Filter 'node-v*' | Sort LastWriteTime -Desc | Select -First 1; Copy-Item -Path (Join-Path $src.FullName '*') -Destination $d -Recurse -Force; Write-Host ('Portable node at '+$d); } catch { Write-Host ('Portable download failed: '+$_.Exception.Message); exit 1 }"
if exist "%NODE_PORTABLE%" (
    echo [OK] Portable Node installed: %NODE_PORTABLE%
    set "PATH=%ROOT%\nodejs;%PATH%"
    for /f "tokens=*" %%v in ('"%NODE_PORTABLE%" -v 2^>nul') do echo       %%v
    goto :eof
)
where node >nul 2>nul
if %errorlevel% equ 0 goto :eof
echo [ERROR] Node.js still not found. Install from https://nodejs.org and re-run.
exit /b 1

:ensurePocketBase
if exist "%PB_EXE%" (
    echo [OK] PocketBase found: %PB_EXE%
    goto :eof
)
if exist "%PB_EXE_LEGACY%" (
    echo [OK] PocketBase found (legacy): %PB_EXE_LEGACY%
    set "PB_DIR=%PB_DIR_LEGACY%"
    set "PB_EXE=%PB_EXE_LEGACY%"
    goto :eof
)
if exist "%ROOT%\pocketbase.exe" (
    echo [OK] PocketBase found in project root
    set "PB_EXE=%ROOT%\pocketbase.exe"
    set "PB_DIR=%ROOT%"
    goto :eof
)
echo [SETUP] PocketBase not found — downloading v0.40.2 to %PB_DIR% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='%PB_URL%'; $o='%PB_ZIP%'; $d='%PB_DIR%'; try { New-Item -ItemType Directory -Path $d -Force | Out-Null; Write-Host ('Downloading '+$u); Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing; Write-Host ('Saved '+(Get-Item $o).Length+' bytes'); Expand-Archive -LiteralPath $o -DestinationPath $d -Force; Write-Host 'Extracted to ' $d } catch { Write-Host ('Download failed: '+$_.Exception.Message); exit 1 }"
if not exist "%PB_ZIP%" (
    echo [WARN] Zip not found, but check if exe already extracted
)
if not exist "%PB_EXE%" (
    for /f "delims=" %%f in ('dir /s /b "%PB_DIR%\pocketbase.exe" 2^>nul') do (
        echo [OK] Found PocketBase at %%f
        set "PB_EXE=%%f"
        for %%d in ("%%f") do set "PB_DIR=%%~dpd"
        set "PB_DIR=!PB_DIR:~0,-1!"
        goto :pbDone
    )
    echo [ERROR] PocketBase extract failed.
    dir "%PB_DIR%" 2>nul
    exit /b 1
)
:pbDone
echo [OK] PocketBase installed: %PB_EXE%
del /q "%PB_ZIP%" 2>nul
goto :eof

:ensureDeps
if exist "%ROOT%\node_modules\.package-lock.json" (
    echo [OK] node_modules present
    goto :eof
)
if not exist "%ROOT%\node_modules" (
    echo [SETUP] node_modules missing — running npm install (universal)...
    pushd "%ROOT%"
    call npm install
    if %errorlevel% neq 0 (
        echo [WARN] npm install failed — retrying with --legacy-peer-deps...
        call npm install --legacy-peer-deps
    )
    popd
    if not exist "%ROOT%\node_modules" (
        echo [ERROR] npm install failed. Check internet.
        exit /b 1
    )
    echo [OK] Dependencies installed
    goto :eof
)
if not exist "%ROOT%\node_modules\.bin\lt.cmd" (
    echo [SETUP] localtunnel missing — installing...
    pushd "%ROOT%"
    call npm install --save-dev localtunnel 2>nul
    popd
)
echo [OK] Dependencies OK
goto :eof

:ensureExe
REM Resolve existing EXE — all relative to %ROOT% first (universal), then fallbacks
set "EXE_PATH="
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release\win-unpacked\BusinessDesk.exe"
if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release2\win-unpacked\BusinessDesk.exe"
REM Fallbacks from old absolute builds (if user moved folder)
if exist "C:\store manager\release\win-unpacked\BusinessDesk.exe" if not defined EXE_PATH set "EXE_PATH=C:\store manager\release\win-unpacked\BusinessDesk.exe"
if exist "C:\store manager\release2\win-unpacked\BusinessDesk.exe" if not defined EXE_PATH set "EXE_PATH=C:\store manager\release2\win-unpacked\BusinessDesk.exe"
if exist "%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe" if not defined EXE_PATH set "EXE_PATH=%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe"
if exist "%LOCALAPPDATA%\Temp\opencode\bd-release\win-unpacked\BusinessDesk.exe" if not defined EXE_PATH set "EXE_PATH=%LOCALAPPDATA%\Temp\opencode\bd-release\win-unpacked\BusinessDesk.exe"
if exist "%TEMP%\opencode\bd-release\win-unpacked\BusinessDesk.exe" if not defined EXE_PATH set "EXE_PATH=%TEMP%\opencode\bd-release\win-unpacked\BusinessDesk.exe"
if defined EXE_PATH (
    echo [OK] EXE found: !EXE_PATH!
    goto :eof
)
echo [SETUP] No built EXE found — building BusinessDesk.exe (universal, one-time, 1-2 min)...
echo         Running: npm run exe (in %ROOT%)
pushd "%ROOT%"
call npm run exe
set "BCODE=%errorlevel%"
popd
if %BCODE% neq 0 (
    echo [WARN] EXE build failed (code %BCODE%). Fallback to Vite dev will be used.
    echo        Fix: reboot to unlock app.asar, or run as Admin, or check Node.
    goto :eof
)
REM Re-resolve after build
set "EXE_PATH="
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release\win-unpacked\BusinessDesk.exe"
if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release2\win-unpacked\BusinessDesk.exe"
if exist "%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe"
if defined EXE_PATH (
    echo [OK] EXE built: !EXE_PATH!
) else (
    echo [WARN] EXE still not found after build — will fallback to Vite.
)
goto :eof

:afterChecks
echo.
if not defined PB_EXE set "PB_EXE=%PB_DIR%\pocketbase.exe"
if not defined PB_DIR set "PB_DIR=%ROOT%\pocketbase"

echo [1/3] Starting PocketBase server (universal)...
echo        PB: %PB_EXE%
echo        Data: %PB_DIR%\pb_data  (portable, stays in project folder)
REM Use /D to set working dir (handles spaces) and keep window open with /k
start "PocketBase Server" /D "%PB_DIR%" cmd /k "echo PocketBase running at http://127.0.0.1:8090 && echo Admin UI at http://127.0.0.1:8090/_/ && echo Data dir: %PB_DIR%\pb_data && pocketbase.exe serve"

timeout /t 3 /nobreak >nul

echo [2/3] Starting LocalTunnel for PocketBase (port 8090)...
echo        Tunnel: https://my-pocketbase-app.loca.lt -^> http://127.0.0.1:8090
echo        Also:   https://my-secret-pocketbase.loca.lt (alt)
echo        Tip: set VITE_PB_URL=https://my-pocketbase-app.loca.lt in .env for viewer/APK
if %NODE_OK% equ 0 (
    start "PocketBase Tunnel - loca.lt" /D "%ROOT%" cmd /k "echo Starting tunnel: npx lt --port 8090 --subdomain my-pocketbase-app && echo Tunnel URL: https://my-pocketbase-app.loca.lt && echo Alt: https://my-secret-pocketbase.loca.lt && echo (uses localtunnel package - keep this window open^) && echo Press Ctrl+C to stop tunnel && npx lt --port 8090 --subdomain my-pocketbase-app"
) else (
    echo [SKIP] Tunnel requires Node.js — skipping (PB still works at http://127.0.0.1:8090)
)

echo [3/3] Launching BusinessDesk App (EXE instead of localhost)...
timeout /t 3 /nobreak >nul

REM Re-resolve EXE path universal
set "EXE_PATH="
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release\win-unpacked\BusinessDesk.exe"
if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release2\win-unpacked\BusinessDesk.exe"
if exist "%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe"
if exist "%LOCALAPPDATA%\Temp\opencode\bd-release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%LOCALAPPDATA%\Temp\opencode\bd-release\win-unpacked\BusinessDesk.exe"

if defined EXE_PATH (
    echo Found EXE: !EXE_PATH!
    start "" "!EXE_PATH!"
) else (
    echo [WARN] No built EXE found:
    echo   %ROOT%\release\win-unpacked\BusinessDesk.exe
    echo   %ROOT%\release2\win-unpacked\BusinessDesk.exe
    echo Building or use Vite fallback...
    echo Starting Vite dev server as fallback...
    start "Store Manager - Vite" /D "%ROOT%" cmd /k "echo Store Manager starting... && npm run dev"
    timeout /t 5 /nobreak >nul
    start http://localhost:5173
)

echo.
echo ========================================
echo  All services starting (UNIVERSAL)...
echo  Root       : %ROOT%
echo  PocketBase : http://127.0.0.1:8090  (data: %PB_DIR%\pb_data)
echo  Admin UI   : http://127.0.0.1:8090/_/
echo  Tunnel     : https://my-pocketbase-app.loca.lt -^> :8090  (viewer)
echo             : https://my-secret-pocketbase.loca.lt -^> :8090 (alt)
echo             : (set VITE_PB_URL=https://my-pocketbase-app.loca.lt for viewer/APK)
if defined EXE_PATH (
    echo  App (EXE)  : !EXE_PATH!
) else (
    echo  App (Vite) : http://localhost:5173
)
echo.
echo  Portable: copy entire "%ROOT%" folder to any PC / USB — no install needed.
echo  First run on new PC will auto-download Node (portable) + PocketBase + build EXE.
echo ========================================
echo.
echo Opening PocketBase Admin...
timeout /t 4 /nobreak >nul
start http://127.0.0.1:8090/_/

echo Done! Do not close this window. Close the 2-3 new windows to stop servers.
echo To expose PocketBase publicly, keep the Tunnel window open.
pause
