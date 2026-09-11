@echo off
setlocal EnableDelayedExpansion
title BusinessDesk - Test ^& Diagnose
color 0B
echo ========================================
echo  BusinessDesk - System Test
echo  Checks if everything is working
echo ========================================
echo.

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PB_DIR=%ROOT%\pocketbase"
set "PB_EXE=%PB_DIR%\pocketbase.exe"
if not exist "%PB_EXE%" if exist "C:\pocketbase_0.40.2_windows_amd64\pocketbase.exe" set "PB_EXE=C:\pocketbase_0.40.2_windows_amd64\pocketbase.exe" & set "PB_DIR=C:\pocketbase_0.40.2_windows_amd64"
set "PASS=0"
set "FAIL=0"
set "LOG=%ROOT%\test.log"
echo [%date% %time%] Test started > "%LOG%"

call :test "Node.js" "where node"
call :test "npm" "where npm"
call :test "Portable Node" "if exist ""%ROOT%\nodejs\node.exe"" exit 0 else exit 1" 1
call :test "PocketBase exe" "if exist ""%PB_EXE%"" exit 0 else exit 1"
call :test "node_modules" "if exist ""%ROOT%\node_modules"" exit 0 else exit 1"
call :test "localtunnel" "if exist ""%ROOT%\node_modules\.bin\lt.cmd"" exit 0 else exit 1"
call :test "BusinessDesk EXE" "if exist ""%ROOT%\release\win-unpacked\BusinessDesk.exe"" exit 0 else if exist ""%ROOT%\release2\win-unpacked\BusinessDesk.exe"" exit 0 else if exist ""%ROOT%\BusinessDesk\BusinessDesk.exe"" exit 0 else exit 1"
call :test "Vite dist" "if exist ""%ROOT%\dist\index.html"" exit 0 else exit 1"
call :test "Electron main" "if exist ""%ROOT%\electron\dist\main.js"" exit 0 else exit 1"
call :test "Start scripts" "if exist ""%ROOT%\start.bat"" exit 0 else exit 1"

echo.
echo --- Live Server Checks (if running) ---
call :checkHealth

echo.
echo --- Detailed Versions ---
where node >nul 2>nul && for /f "tokens=*" %%v in ('node -v 2^>nul') do echo Node: %%v
where npm >nul 2>nul && for /f "tokens=*" %%v in ('npm -v 2^>nul') do echo npm: %%v
if exist "%PB_EXE%" echo PocketBase: %PB_EXE%
if exist "%ROOT%\pocketbase\pb_data" echo PB Data: %ROOT%\pocketbase\pb_data (portable)
if exist "C:\pocketbase_0.40.2_windows_amd64\pb_data" echo PB Data legacy: C:\pocketbase_0.40.2_windows_amd64\pb_data

echo.
echo ========================================
echo  Results: %PASS% PASS, %FAIL% FAIL
echo ========================================
if %FAIL% equ 0 (
    echo  ALL CHECKS PASSED - Ready to run start.bat
    color 0A
) else (
    echo  SOME CHECKS FAILED - See FAIL above
    echo  Fix: Run install.bat as Admin, check internet
    color 0C
)
echo  Log: %LOG%
echo.
echo  Next:
echo   - If FAIL: Run install.bat, then re-run test.bat
echo   - If PASS: Run start.bat (full) or start-servers.bat (servers+EXE)
echo.
echo  This window will stay open - press any key to close...
pause >nul
endlocal
exit /b %FAIL%

:test
set "NAME=%~1"
set "CMD=%~2"
set "OPTIONAL=%~3"
%CMD% >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] %NAME%
    set /a PASS+=1
    echo PASS: %NAME% >>"%LOG%"
    goto :eof
) else (
    if "%OPTIONAL%"=="1" (
        echo [SKIP] %NAME% (optional)
        echo SKIP: %NAME% >>"%LOG%"
        goto :eof
    )
    echo [FAIL] %NAME%
    set /a FAIL+=1
    echo FAIL: %NAME% >>"%LOG%"
    goto :eof
)

:checkHealth
echo Checking http://127.0.0.1:8090/api/health ...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:8090/api/health' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { Write-Host '[PASS] PocketBase running (200)' } else { Write-Host ('[FAIL] PB status '+$r.StatusCode) } } catch { Write-Host ('[FAIL] PocketBase not running - '+$_.Exception.Message) }" 2>&1
if %errorlevel% equ 0 set /a PASS+=1 else set /a FAIL+=1
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri 'https://my-pocketbase-app.loca.lt/api/health' -Headers @{'Bypass-Tunnel-Reminder' = 'true'} -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { Write-Host '[PASS] Tunnel https://my-pocketbase-app.loca.lt OK' } else { Write-Host ('[WARN] Tunnel status '+$r.StatusCode) } } catch { Write-Host ('[SKIP] Tunnel not running (offline OK) - '+$_.Exception.Message) }" 2>&1
goto :eof
