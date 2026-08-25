@echo off
chcp 65001 >nul
title 키움 IP 확인
cd /d "%~dp0"
echo.
echo ========================================
echo   키움 공인IP 확인
echo ========================================
echo.
node collector.mjs --mode=check-ip
echo.
echo ----------------------------------------
echo  이 IP를 키움 OpenAPI 지정단말에 등록하세요
echo  https://openapi.kiwoom.com
echo ----------------------------------------
echo.
pause
