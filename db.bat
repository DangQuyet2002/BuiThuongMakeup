@echo off
chcp 65001 >nul
title Bùi Thương Makeup - Xem database
cd /d "%~dp0backend"

echo.
echo   ╔══════════════════════════════════════════════════╗
echo   ║      BÙI THƯƠNG MAKEUP — XEM DATABASE            ║
echo   ╚══════════════════════════════════════════════════╝
echo.

call node db\view.js %*

echo.
echo   ────────────────────────────────────────────────────
echo   Gõ lệnh để xem tiếp (hoặc đóng cửa sổ để thoát):
echo.
echo     npm run db -- bookings          xem 20 đơn đầu
echo     npm run db -- users             xem tài khoản
echo     npm run db -- audit_log 50      xem 50 dòng nhật ký
echo     npm run db -- --schema bookings xem cấu trúc bảng
echo     npm run db -- --sql "SELECT ..."  truy vấn tự do
echo.
pause
