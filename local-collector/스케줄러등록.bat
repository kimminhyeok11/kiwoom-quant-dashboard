@echo off
chcp 65001 >nul
title 키움 Windows 작업 스케줄러 등록
cd /d "%~dp0"
echo.
echo ========================================
echo   Windows 자동 실행 작업 등록
echo   (관리자 권한 필요!)
echo ========================================
echo.

:: Check admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ 관리자 권한이 필요합니다.
    echo    이 파일을 우클릭 → "관리자 권한으로 실행" 하세요.
    echo.
    pause
    exit /b 1
)

node install-scheduler.mjs
echo.
pause
