@echo off
chcp 65001 >nul
title 키움 자동 수집 (시간대 자동 판단)
cd /d "%~dp0"
echo.
echo ========================================
echo   자동 수집 모드
echo   - 장중: 분봉 연속 수집
echo   - 장 마감 후: 일봉 수집
echo   - Ctrl+C로 중단
echo ========================================
echo.
node collector.mjs
echo.
pause
