# DumPOS Telegram Bot 🤖

Bot ทำงานอัตโนมัติบนคอมเครื่องใดก็ได้ — ไม่ต้องไปกดในตั้งค่า

---

## ✅ Bot ทำอะไรบ้าง

| เหตุการณ์ | สิ่งที่ Bot ทำ |
|---|---|
| **เปิด CMD / รัน Bot** | ส่ง Telegram แจ้ง IP สาธารณะ + IP LAN + เวลาเปิด |
| **ทำงานตลอดเวลา** | เปิด port 5000 ให้เข้าจาก browser ได้ |
| **กด Ctrl+C / ปิด CMD** | ส่งสรุปยอดขายรายวันไป Telegram อัตโนมัติ |

---

## 📦 ติดตั้งครั้งแรก (ทำครั้งเดียว)

### 1. ติดตั้ง Python 3.8+
ดาวน์โหลด: https://www.python.org/downloads/  
⚠️ ติ๊ก **"Add Python to PATH"** ตอนติดตั้ง

### 2. ดาวน์โหลดโฟลเดอร์ bot
คัดลอกโฟลเดอร์ `bot/` ไปไว้ในคอมที่จะรัน

### 3. ตั้งค่าไฟล์ .env.bot
```
cd bot
copy .env.bot.example .env.bot
```
แก้ไขไฟล์ `.env.bot` ด้วย Notepad:

```env
SUPABASE_URL=https://oxkuxksdajnzapqvevpx.supabase.co
SUPABASE_SERVICE_KEY=<ใส่ Service Role Key จาก Supabase Dashboard>
TELEGRAM_BOT_TOKEN=8997725146:AAHwy2wq-XFXpBChT5tiCdR7-Peq2vJLICg
TELEGRAM_CHAT_ID=8489890670
STORE_NAME=Dumpos
HTTP_PORT=5000
```

> **หา Service Role Key:**  
> Supabase Dashboard → Project Settings → API → **service_role** (secret)

---

## 🚀 รัน Bot

### Windows (CMD / VS Code Terminal)
```
double-click ไฟล์ run_bot.bat
```
หรือใน CMD:
```cmd
cd bot
run_bot.bat
```

### Linux / macOS
```bash
cd bot
chmod +x run_bot.sh
./run_bot.sh
```

---

## 🌐 เข้าจากคอมเครื่องอื่น / มือถือ

### วงใน LAN (ร้านค้าเดียวกัน)
```
http://<IP LAN>:5000
```
Bot จะแจ้ง IP LAN มาใน Telegram ตอนเปิด

### จากอินเทอร์เน็ต (นอกร้าน)
ต้องตั้งค่า **Port Forwarding** ใน Router:
1. เปิดหน้าจัดการ Router (มักเป็น 192.168.1.1)
2. ไปที่ **Port Forwarding / Virtual Server**
3. เพิ่ม Rule: `TCP Port 5000 → IP คอมที่รัน Bot`
4. เข้าผ่าน `http://<IP สาธารณะ>:5000` (Bot จะแจ้ง IP มาใน Telegram)

---

## 📱 ตัวอย่างข้อความ Telegram

**เมื่อเปิด:**
```
🟢 Dumpos — ระบบเปิดทำงานแล้ว
━━━━━━━━━━━━━━━━━━━━
📅 วันที่ : 14 Jun 2026
🕐 เวลา  : 08:30:00
━━━━━━━━━━━━━━━━━━━━
🌐 IP สาธารณะ : 171.x.x.x
🏠 IP ใน LAN   : 192.168.1.5:5000
```

**เมื่อปิด:**
```
🔴 Dumpos — ปิดระบบ / สรุปยอดประจำวัน
━━━━━━━━━━━━━━━━━━━━
💰 ยอดขายรวม    : ฿12,450.00
🧾 จำนวนบิล     : 47 ใบ
📊 เฉลี่ยต่อบิล  : ฿264.89
❌ ยกเลิก/void   : 2 ใบ (฿380.00)
```

---

## ❓ แก้ปัญหา

| ปัญหา | วิธีแก้ |
|---|---|
| `python not found` | ติดตั้ง Python + เพิ่ม PATH |
| Telegram ไม่ได้รับข้อความ | ตรวจสอบ BOT_TOKEN และ CHAT_ID ใน .env.bot |
| เชื่อมต่อ Supabase ไม่ได้ | ตรวจสอบ SERVICE_KEY (ต้องใช้ service_role ไม่ใช่ anon) |
| เข้าจากนอกร้านไม่ได้ | ตั้งค่า Port Forwarding ใน Router |
