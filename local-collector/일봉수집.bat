@echo off
chcp 65001 >nul
title 키움 일봉 수집
cd /d "%~dp0"
echo.
echo ========================================
echo   일봉 수집 시작
echo ========================================
echo.
node collector.mjs --mode=daily
echo.
pause
