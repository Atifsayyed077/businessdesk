@echo off
title Build Portable Bundle
echo ========================================
echo  Building BusinessDesk Portable Bundle
echo  For USB / Any PC (offline EXE)
echo ========================================
echo.
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "OUT=%ROOT%\BusinessDesk-Portable"

echo Cleaning previous bundle...
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%" 2>nul

echo [1/5] Copying PocketBase (portable)...
if not exist "%ROOT%\pocketbase\pocketbase.exe" (
    if exist "C:\pocketbase_0.40.2_windows_amd64\pocketbase.exe" (
        mkdir "%OUT%\pocketbase" 2>nul
        copy /y "C:\pocketbase_0.40.2_windows_amd64\pocketbase.exe" "%OUT%\pocketbase\" >nul
        if exist "C:\pocketbase_0.40.2_windows_amd64\pb_data" xcopy /e /i /y "C:\pocketbase_0.40.2_windows_amd64\pb_data" "%OUT%\pocketbase\pb_data\" >nul
    ) else (
        echo [WARN] No pocketbase.exe found — will be auto-downloaded on target PC (needs internet)
    )
) else (
    mkdir "%OUT%\pocketbase" 2>nul
    copy /y "%ROOT%\pocketbase\pocketbase.exe" "%OUT%\pocketbase\" >nul
    if exist "%ROOT%\pocketbase\pb_data" xcopy /e /i /y "%ROOT%\pocketbase\pb_data" "%OUT%\pocketbase\pb_data\" >nul
)

echo [2/5] Copying App (release)...
set "SRC_EXE="
if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "SRC_EXE=%ROOT%\release\win-unpacked"
if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "SRC_EXE=%ROOT%\release2\win-unpacked"
if exist "%LOCALAPPDATA%\opencode\bd-release\win-unpacked\BusinessDesk.exe" if not defined SRC_EXE set "SRC_EXE=%LOCALAPPDATA%\opencode\bd-release\win-unpacked"
if not defined SRC_EXE (
    echo [WARN] No built EXE found — building now...
    pushd "%ROOT%"
    call npm run exe
    popd
    if exist "%ROOT%\release\win-unpacked\BusinessDesk.exe" set "SRC_EXE=%ROOT%\release\win-unpacked"
    if exist "%ROOT%\release2\win-unpacked\BusinessDesk.exe" set "SRC_EXE=%ROOT%\release2\win-unpacked"
)
if defined SRC_EXE (
    echo       From: %SRC_EXE%
    xcopy /e /i /y "%SRC_EXE%" "%OUT%\BusinessDesk\" >nul
    echo [OK] Copied BusinessDesk to %OUT%\BusinessDesk\
) else (
    echo [ERROR] No EXE to bundle. Build failed.
)

echo [3/5] Copying start.bat (universal)...
copy /y "%ROOT%\start.bat" "%OUT%\start.bat" >nul
copy /y "%ROOT%\BUILD_PORTABLE.bat" "%OUT%\BUILD_PORTABLE.bat" 2>nul

echo [4/5] Creating README...
powershell -NoProfile -Command "Set-Content -LiteralPath '%OUT%\README.txt' -Value @('BusinessDesk Portable - USB / Any PC','================================','1. Copy this entire BusinessDesk-Portable folder to target PC / USB','2. Double-click start.bat','3. First run on new PC: if no Node, start.bat auto-installs portable Node to .\nodejs\ ^(no admin^) or uses winget','4. PocketBase auto-starts from .\pocketbase\pocketbase.exe ^(pb_data stays portable^)','5. EXE launches from .\BusinessDesk\BusinessDesk.exe - no install needed','','Offline? The bundle includes pocketbase.exe + BusinessDesk.exe so it works without internet.','Tunnel ^(npx lt^) needs internet - if offline, just use http://127.0.0.1:8090 locally.','','If SmartScreen blocks exe: Right-click BusinessDesk.exe - Properties - Unblock.')"

echo [5/5] Bundle ready:
dir "%OUT%" | findstr /v "Volume"
echo.
echo ZIP for distribution:
echo   powershell Compress-Archive -Path "%OUT%" -DestinationPath "%ROOT%\BusinessDesk-Portable.zip" -Force
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%\*' -DestinationPath '%ROOT%\BusinessDesk-Portable.zip' -Force; Write-Host ('ZIP: '+'%ROOT%\BusinessDesk-Portable.zip '+(Get-Item '%ROOT%\BusinessDesk-Portable.zip').Length/1MB.ToString('0.0')+' MB')"
echo.
echo Done! Copy BusinessDesk-Portable.zip or the folder to any PC and run start.bat
pause
