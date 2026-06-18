@echo off
chcp 65001 >nul
title DumPOS — ระบบขายหน้าร้าน

echo.
echo  ============================================
echo    DumPOS — เริ่มต้นระบบ
echo    กด Ctrl+C เพื่อปิด (จะส่งสรุปยอดไป Telegram)
echo  ============================================
echo.

:: ─── ตรวจสอบ Python ───────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] ไม่พบ Python!
    echo.
    echo  กรุณาติดตั้ง Python 3.8+ ก่อน:
    echo  https://www.python.org/downloads/
    echo  (อย่าลืมติ๊ก "Add Python to PATH" ตอนติดตั้ง)
    echo.
    pause
    exit /b 1
)

:: ─── ตรวจสอบ Node.js (ใช้ build React) ──────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo [WARN] ไม่พบ Node.js — หาก dist/ ยังไม่มีจะ build ไม่ได้
    echo  ดาวน์โหลด: https://nodejs.org/
)

:: ─── ติดตั้ง Python dependencies ──────────────────────────
echo [*] กำลังติดตั้ง dependencies...
pip install requests python-dotenv --quiet 2>nul

:: ─── ตรวจสอบ .env.bot ──────────────────────────────────────
if not exist "..\bot\.env.bot" (
    echo.
    echo  [WARN] ไม่พบ bot\.env.bot
    echo  ระบบยังรันได้ แต่ Telegram จะไม่ส่งแจ้งเตือน
    echo.
)

:: ─── รัน server ────────────────────────────────────────────
echo [*] กำลังเริ่มระบบ POS...
echo.
cd /d "%~dp0"
python server.py

echo.
echo  [*] ระบบปิดแล้ว
pause
