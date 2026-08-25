@echo off
chcp 65001 >nul
title 키움 분봉 수집 (장중)
cd /d "%~dp0"
echo.
echo ========================================
echo   분봉 수집 시작 (장중에만 동작)
echo ========================================
echo.
node collector.mjs --mode=minute
echo.
pause
