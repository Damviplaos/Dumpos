@echo off
chcp 65001 >nul
title DumPOS Telegram Bot
echo ============================================
echo   DumPOS Telegram Bot
echo ============================================
echo.

:: ตรวจสอบ Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] ไม่พบ Python กรุณาติดตั้ง Python 3.8+ ก่อน
    echo   ดาวน์โหลดได้ที่: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: ติดตั้ง dependencies ถ้ายังไม่มี
echo [*] ตรวจสอบ dependencies...
pip install supabase python-dotenv requests --quiet

:: ตรวจสอบไฟล์ .env.bot
if not exist ".env.bot" (
    echo.
    echo [ERROR] ไม่พบไฟล์ .env.bot
    echo   กรุณาคัดลอก .env.bot.example เป็น .env.bot แล้วแก้ไขค่าต่างๆ
    echo.
    pause
    exit /b 1
)

echo [*] กำลังเริ่ม Bot...
echo.
python dumpos_bot.py

echo.
echo [*] Bot หยุดทำงานแล้ว
pause
