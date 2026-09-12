@echo off
chcp 65001 >nul
title Bùi Thương Makeup - Máy chủ đặt lịch
cd /d "%~dp0backend"

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║     BÙI THƯƠNG MAKEUP — ĐANG KHỞI ĐỘNG       ║
echo   ╚══════════════════════════════════════════════╝
echo.

if not exist "node_modules" (
  echo   Chưa có thư viện, đang cài đặt lần đầu...
  echo   Việc này chỉ chạy một lần, có thể mất 1-2 phút.
  echo.
  call npm install
  echo.
)

echo   Đang mở máy chủ...
echo.

start "" http://localhost:3000

call npm start

echo.
echo   Máy chủ đã dừng.
pause
