@echo off
title Create PocketBase Tables
echo ========================================
echo  Creating PocketBase Tables
echo ========================================
echo.
echo PocketBase: http://127.0.0.1:8090
echo Superuser: admin@storemanager.com / admin123
echo.

REM Check PocketBase is running
curl -s http://127.0.0.1:8090/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] PocketBase not running! Start it first with start.bat
    pause
    exit /b 1
)

echo Running init script...
cd /d "C:\store manager"
node init-pocketbase.mjs

echo.
echo ========================================
if %errorlevel% equ 0 (
    echo  All tables created successfully!
) else (
    echo  Failed - check errors above
)
echo ========================================
pause
