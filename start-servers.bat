@echo off
setlocal EnableDelayedExpansion
title All Servers - PocketBase + Link + EXE
echo ========================================
echo  Starting All Servers (PocketBase + Link + EXE)
echo  Universal - any PC / folder
echo ========================================
echo.

REM --- Universal root ---
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PB_DIR=%ROOT%\pocketbase"
set "PB_EXE=%PB_DIR%\pocketbase.exe"
set "PB_DIR_LEGACY=C:\pocketbase_0.40.2_windows_amd64"
set "PB_EXE_LEGACY=%PB_DIR_LEGACY%\pocketbase.exe"
if exist "%PB_EXE_LEGACY%" if not exist "%PB_EXE%" (
    set "PB_DIR=%PB_DIR_LEGACY%"
    set "PB_EXE=%PB_EXE_LEGACY%"
)
if exist "%ROOT%\pocketbase.exe" if not exist "%PB_EXE%" (
    set "PB_EXE=%ROOT%\pocketbase.exe"
    set "PB_DIR=%ROOT%"
)
set "NODE_PORTABLE=%ROOT%\nodejs\node.exe"
if exist "%NODE_PORTABLE%" set "PATH=%ROOT%\nodejs;%PATH%"

REM --- Ensure PocketBase ---
if not exist "%PB_EXE%" (
    echo [SETUP] PocketBase missing at %PB_EXE%
    echo         Downloading v0.40.2 to %PB_DIR% ...
    set "PB_ZIP=%TEMP%\pocketbase_0.40.2_windows_amd64.zip"
    set "PB_URL=https://github.com/pocketbase/pocketbase/releases/download/v0.40.2/pocketbase_0.40.2_windows_amd64.zip"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://github.com/pocketbase/pocketbase/releases/download/v0.40.2/pocketbase_0.40.2_windows_amd64.zip'; $o=Join-Path $env:TEMP 'pocketbase_0.40.2_windows_amd64.zip'; $d='%PB_DIR%'; New-Item -ItemType Directory -Path $d -Force | Out-Null; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing; Expand-Archive -LiteralPath $o -DestinationPath $d -Force; Write-Host 'PocketBase ready'"
    if not exist "%PB_EXE%" (
        echo [ERROR] PocketBase still not found. Check internet.
        pause
        exit /b 1
    )
)
echo [OK] PocketBase: %PB_EXE%

REM --- Ensure Node (auto-install winget/portable if missing) ---
call :ensureNode
set "NODE_OK=%errorlevel%"
if %NODE_OK% neq 0 (
    echo [WARN] Node.js auto-install failed — tunnel/build skipped, PB+EXE still work if present.
)

REM --- Resolve EXE early (for auto-build check) ---
set "EXE_PATH="
if exist "%ROOT%\BusinessDesk\BusinessDesk.exe" set "EXE_PATH=%ROOT%\BusinessDesk\BusinessDesk.exe"
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release\win-unpacked\BusinessDesk.exe"
if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release2\win-unpacked\BusinessDesk.exe"
if exist "%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe" if not defined EXE_PATH set "EXE_PATH=%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe"
if not defined EXE_PATH (
    echo [SETUP] No EXE found — will try build after PB start (needs Node)...
)

echo.
echo [1/3] Starting PocketBase server...
echo        PB: %PB_EXE%
echo        URL: http://127.0.0.1:8090  Admin: http://127.0.0.1:8090/_/
start "PocketBase Server" /D "%PB_DIR%" cmd /k "echo PocketBase running at http://127.0.0.1:8090 && echo Admin UI at http://127.0.0.1:8090/_/ && pocketbase.exe serve"

timeout /t 3 /nobreak >nul

echo [2/3] Starting LocalTunnel link...
echo        npx lt --port 8090 --subdomain my-pocketbase-app
echo        Tunnel: https://my-pocketbase-app.loca.lt -^> http://127.0.0.1:8090
if %NODE_OK% equ 0 (
    REM Ensure localtunnel present
    if not exist "%ROOT%\node_modules\.bin\lt.cmd" (
        echo        Installing localtunnel...
        pushd "%ROOT%"
        call npm install --save-dev localtunnel >nul 2>&1
        popd
    )
    start "PocketBase Tunnel - loca.lt" /D "%ROOT%" cmd /k "echo Tunnel: https://my-pocketbase-app.loca.lt && echo Keep this window open && npx lt --port 8090 --subdomain my-pocketbase-app"
) else (
    echo [SKIP] Tunnel requires Node.js — PB still works locally at http://127.0.0.1:8090
)

echo.
echo [3/3] Launching BusinessDesk EXE...
if not defined EXE_PATH (
    if %NODE_OK% equ 0 (
        echo [SETUP] Building EXE (one-time)...
        pushd "%ROOT%"
        call npm run exe
        popd
        if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release\win-unpacked\BusinessDesk.exe"
        if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release2\win-unpacked\BusinessDesk.exe"
        if exist "%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe"
        if exist "%ROOT%\BusinessDesk\BusinessDesk.exe" set "EXE_PATH=%ROOT%\BusinessDesk\BusinessDesk.exe"
    )
)
if defined EXE_PATH (
    echo [OK] Launching EXE: !EXE_PATH!
    timeout /t 2 /nobreak >nul
    start "" "!EXE_PATH!"
) else (
    echo [WARN] No EXE found — fallback will open Vite if available
    if %NODE_OK% equ 0 (
        if exist "%ROOT%\package.json" (
            start "Store Manager - Vite" /D "%ROOT%" cmd /k "npm run dev"
            timeout /t 5 /nobreak >nul
            start http://localhost:5173
        )
    )
)

echo.
echo ========================================
echo  All servers launching...
echo  PocketBase : http://127.0.0.1:8090
echo  Admin UI   : http://127.0.0.1:8090/_/
if %NODE_OK% equ 0 echo  Tunnel     : https://my-pocketbase-app.loca.lt
if defined EXE_PATH (
    echo  App (EXE)  : !EXE_PATH!
) else (
    echo  App        : Vite fallback or build EXE with npm run exe
)
echo ========================================
echo.
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8090/_/
if %NODE_OK% equ 0 timeout /t 2 /nobreak >nul & start https://my-pocketbase-app.loca.lt/api/health

echo Done! Keep 3 windows open (PB, Tunnel, EXE). Close them to stop.
pause
goto :eof

REM ============================================================
REM  Ensure Node — tries winget, then portable zip (no admin)
REM  Copied from start.bat for universal offline support
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
    set "PATH=%ROOT%\nodejs;%PATH%"
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
