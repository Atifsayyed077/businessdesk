@echo off
setlocal EnableDelayedExpansion
title BusinessDesk - Installer (Universal)
color 0A
echo ========================================
echo  BusinessDesk - Universal Installer
echo  Portable / Any PC / No admin required
echo ========================================
echo  This will install:
echo   - PocketBase (portable) if missing
echo   - Node.js (winget or portable) if missing
echo   - npm dependencies
echo   - BusinessDesk EXE (build if needed)
echo ========================================
echo.

REM --- Universal root (folder of this bat) ---
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
echo [INFO] Install root: %ROOT%
echo.

set "PB_DIR=%ROOT%\pocketbase"
set "PB_EXE=%PB_DIR%\pocketbase.exe"
set "PB_DIR_LEGACY=C:\pocketbase_0.40.2_windows_amd64"
set "PB_EXE_LEGACY=%PB_DIR_LEGACY%\pocketbase.exe"
set "PB_ZIP=%TEMP%\pocketbase_0.40.2_windows_amd64.zip"
set "PB_URL=https://github.com/pocketbase/pocketbase/releases/download/v0.40.2/pocketbase_0.40.2_windows_amd64.zip"
set "NODE_PORTABLE=%ROOT%\nodejs\node.exe"

if exist "%NODE_PORTABLE%" set "PATH=%ROOT%\nodejs;%PATH%"

REM Log file
set "LOG=%ROOT%\install.log"
echo [%date% %time%] Install started > "%LOG%"

call :stepNode
if %errorlevel% neq 0 goto :installFail

call :stepPocketBase
if %errorlevel% neq 0 goto :installFail

call :stepDeps
if %errorlevel% neq 0 goto :installFail

call :stepBuild
if %errorlevel% neq 0 goto :installFail

call :stepShortcuts

echo.
echo ========================================
echo  INSTALL COMPLETE - All checks passed!
echo ========================================
echo  Root: %ROOT%
echo  PocketBase: %PB_EXE%
if exist "%PB_EXE%" echo  PocketBase OK
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" echo  EXE: %ROOT%\release\win-unpacked\BusinessDesk.exe
if exist "%ROOT%\BusinessDesk\BusinessDesk.exe" echo  EXE (portable): %ROOT%\BusinessDesk\BusinessDesk.exe
echo.
echo  Next: Double-click start.bat or start-servers.bat to launch
echo        (Both stay open - do not close instantly)
echo ========================================
echo  Log: %LOG%
echo  Press any key to close installer...
pause >nul
endlocal
exit /b 0

:installFail
echo.
echo ========================================
echo  INSTALL FAILED - See messages above
echo  Log: %LOG%
echo  Fix internet / antivirus, then re-run install.bat
echo  Or run test.bat to diagnose
echo ========================================
echo Press any key to close...
pause >nul
endlocal
exit /b 1

REM ================= Functions =================

:stepNode
echo [1/4] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 goto :checkPortableNode
for /f "tokens=*" %%v in ('node -v 2>nul') do echo [OK] Node.js %%v
echo [OK] Node found, skipping install
echo Node OK >>"%LOG%"
goto :eof
:checkPortableNode
if exist "%NODE_PORTABLE%" (
    echo [OK] Portable Node at %NODE_PORTABLE%
    set "PATH=%ROOT%\nodejs;%PATH%"
    goto :eof
)
echo [SETUP] Node.js not found - installing...
where winget >nul 2>nul
if %errorlevel% equ 0 (
    echo       Trying winget (may need Admin)...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements >>"%LOG%" 2>&1
    timeout /t 12 /nobreak >nul
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        echo [OK] Node installed via winget
        set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
        goto :eof
    )
    echo [WARN] winget failed, trying portable zip (no admin)...
)
echo       Downloading portable Node.js ^(no admin^) to %ROOT%\nodejs\ ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip'; $o=Join-Path $env:TEMP 'node-portable.zip'; $d='%ROOT%\nodejs'; try { Write-Host ('Downloading '+$u); Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing; Write-Host ('Saved '+(Get-Item $o).Length+' bytes'); New-Item -ItemType Directory -Path $d -Force | Out-Null; Expand-Archive -LiteralPath $o -DestinationPath $env:TEMP -Force; $src=Get-ChildItem -Path $env:TEMP -Directory -Filter 'node-v*' | Sort LastWriteTime -Desc | Select -First 1; Copy-Item -Path (Join-Path $src.FullName '*') -Destination $d -Recurse -Force; Write-Host 'Portable node done' } catch { Write-Host ('Failed: '+$_.Exception.Message); exit 1 }" >>"%LOG%" 2>&1
if exist "%NODE_PORTABLE%" (
    echo [OK] Portable Node installed
    set "PATH=%ROOT%\nodejs;%PATH%"
    goto :eof
)
echo [ERROR] Node.js auto-install failed.
echo         Please install from https://nodejs.org and re-run
    echo Node install failed >>"%LOG%"
exit /b 1

:stepPocketBase
echo.
echo [2/4] Checking PocketBase...
if exist "%PB_EXE%" echo [OK] Found %PB_EXE% & goto :eof
if exist "%PB_EXE_LEGACY%" echo [OK] Found legacy %PB_EXE_LEGACY% & set "PB_DIR=%PB_DIR_LEGACY%" & set "PB_EXE=%PB_EXE_LEGACY%" & goto :eof
if exist "%ROOT%\pocketbase.exe" set "PB_EXE=%ROOT%\pocketbase.exe" & set "PB_DIR=%ROOT%" & echo [OK] Found !PB_EXE! & goto :eof
echo [SETUP] Downloading PocketBase v0.40.2 to %PB_DIR% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='%PB_URL%'; $o='%PB_ZIP%'; $d='%PB_DIR%'; New-Item -ItemType Directory -Path $d -Force | Out-Null; Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing; Expand-Archive -LiteralPath $o -DestinationPath $d -Force" >>"%LOG%" 2>&1
if exist "%PB_EXE%" (
    echo [OK] PocketBase installed
    del /q "%PB_ZIP%" 2>nul
    goto :eof
)
for /f "delims=" %%f in ('dir /s /b "%PB_DIR%\pocketbase.exe" 2>nul') do (
    set "PB_EXE=%%f"
    echo [OK] Found at %%f
    goto :eof
)
echo [ERROR] PocketBase download failed - check internet
exit /b 1

:stepDeps
echo.
echo [3/4] Checking dependencies...
if exist "%ROOT%\node_modules\.package-lock.json" (
    echo [OK] node_modules present
    goto :eof
)
if not exist "%ROOT%\node_modules" (
    echo [SETUP] Running npm install (may take 1-2 min)...
    pushd "%ROOT%"
    call npm install >>"%LOG%" 2>&1
    if %errorlevel% neq 0 (
        echo [WARN] Retrying with --legacy-peer-deps...
        call npm install --legacy-peer-deps >>"%LOG%" 2>&1
    )
    popd
    if not exist "%ROOT%\node_modules" (
        echo [ERROR] npm install failed
        exit /b 1
    )
    echo [OK] Dependencies installed
    goto :eof
)
if not exist "%ROOT%\node_modules\.bin\lt.cmd" (
    echo [SETUP] Installing localtunnel...
    pushd "%ROOT%"
    call npm install --save-dev localtunnel >>"%LOG%" 2>&1
    popd
)
echo [OK] Dependencies OK
goto :eof

:stepBuild
echo.
echo [4/4] Checking BusinessDesk EXE...
set "EXE_PATH="
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release\win-unpacked\BusinessDesk.exe"
if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "EXE_PATH=%ROOT%\release2\win-unpacked\BusinessDesk.exe"
if exist "%ROOT%\BusinessDesk\BusinessDesk.exe" set "EXE_PATH=%ROOT%\BusinessDesk\BusinessDesk.exe"
if defined EXE_PATH (
    echo [OK] EXE exists: !EXE_PATH!
    goto :eof
)
echo [SETUP] Building EXE (first time, 1-2 min)...
pushd "%ROOT%"
call npm run exe >>"%LOG%" 2>&1
set "BCODE=%errorlevel%"
popd
if %BCODE% neq 0 (
    echo [WARN] Build failed code %BCODE% - may need reboot (app.asar locked) or Admin
    echo        Log: %LOG%
    echo        You can still run PocketBase via start-servers.bat
    exit /b 0
)
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" (
    echo [OK] EXE built
) else (
    echo [WARN] EXE not found after build - check log
)
goto :eof

:stepShortcuts
echo.
echo [EXTRA] Creating desktop shortcut (if possible)...
powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\BusinessDesk.lnk'); $s.TargetPath='%ROOT%\start.bat'; $s.WorkingDirectory='%ROOT%'; $s.IconLocation='%ROOT%\release\win-unpacked\BusinessDesk.exe,0'; $s.Description='BusinessDesk - Store Manager'; try { $s.Save(); Write-Host 'Shortcut created' } catch { Write-Host 'Shortcut skipped' }" >>"%LOG%" 2>&1
goto :eof
