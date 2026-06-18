#!/bin/bash
# DumPOS — เริ่มต้นระบบ (Linux / macOS)

echo ""
echo "  ============================================"
echo "    DumPOS — เริ่มต้นระบบ"
echo "    กด Ctrl+C เพื่อปิด"
echo "  ============================================"
echo ""

# ตรวจสอบ Python3
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] ไม่พบ Python3"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  macOS:         brew install python3"
    exit 1
fi

# ติดตั้ง deps
echo "[*] ติดตั้ง dependencies..."
pip3 install requests python-dotenv --quiet 2>/dev/null

# รัน
cd "$(dirname "$0")"
python3 server.py
