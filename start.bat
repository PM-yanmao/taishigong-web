@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Taishigong local demo server
echo   Open http://localhost:8787 in your browser
echo   Press Ctrl+C to stop
echo.
node server/index.mjs
pause
