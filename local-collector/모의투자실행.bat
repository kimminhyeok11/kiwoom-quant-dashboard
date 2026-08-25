@echo off
chcp 65001 >nul
title 키움 모의투자 주문 실행
cd /d "%~dp0"
echo.
echo ========================================
echo   모의투자 주문 실행 + 체결 동기화
echo ========================================
echo.
node mock-trader.mjs
echo.
pause
