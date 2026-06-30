#!/bin/bash
echo "============================================"
echo "  DumPOS Telegram Bot"
echo "============================================"
echo ""

# ตรวจสอบ Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] ไม่พบ Python3 กรุณาติดตั้งก่อน"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  macOS: brew install python3"
    exit 1
fi

# ติดตั้ง dependencies
echo "[*] ติดตั้ง dependencies..."
pip3 install supabase python-dotenv requests --quiet

# ตรวจสอบ .env.bot
if [ ! -f ".env.bot" ]; then
    echo ""
    echo "[ERROR] ไม่พบไฟล์ .env.bot"
    echo "  cp .env.bot.example .env.bot"
    echo "  แล้วแก้ไข SUPABASE_SERVICE_KEY ให้ถูกต้อง"
    exit 1
fi

echo "[*] กำลังเริ่ม Bot..."
echo ""
python3 dumpos_bot.py
