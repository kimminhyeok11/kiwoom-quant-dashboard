@echo off
chcp 65001 >nul
title 키움 모의투자 잔고 조회
cd /d "%~dp0"
echo.
echo ========================================
echo   모의투자 잔고/체결 조회
echo ========================================
echo.
node mock-trader.mjs --check
echo.
pause
