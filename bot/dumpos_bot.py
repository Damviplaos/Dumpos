"""
DumPOS Telegram Bot
====================
รันบนคอมเครื่องใดก็ได้ — เปิด CMD แล้ว python dumpos_bot.py

เมื่อเปิด  → ส่ง Telegram แจ้ง IP สาธารณะ + เวลาเปิดระบบ
เมื่อปิด   → ส่งสรุปยอดขายรายวัน + สถิติจาก Supabase
"""

import os
import sys
import signal
import threading
import requests
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from supabase import create_client, Client
from dotenv import load_dotenv

# โหลด config จากไฟล์ .env.bot
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env.bot"))

SUPABASE_URL: str       = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str       = os.environ["SUPABASE_SERVICE_KEY"]   # service role key
TELEGRAM_TOKEN: str     = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID: str   = os.environ["TELEGRAM_CHAT_ID"]
STORE_NAME: str         = os.environ.get("STORE_NAME", "Dumpos")
HTTP_PORT: int          = int(os.environ.get("HTTP_PORT", "5000"))

TZ_THAI = timezone(timedelta(hours=7))
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─────────────────────────────────────────────────────────────
# Telegram helpers
# ─────────────────────────────────────────────────────────────

def send_telegram(message: str) -> bool:
    """ส่งข้อความไปยัง Telegram"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    try:
        resp = requests.post(url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "Markdown",
        }, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"[Telegram Error] {e}")
        return False


# ─────────────────────────────────────────────────────────────
# IP helpers
# ─────────────────────────────────────────────────────────────

def get_public_ip() -> str:
    """ดึง IP สาธารณะของเครื่องนี้ (ใช้งานได้แม้เปลี่ยน ISP)"""
    for svc in [
        "https://api.ipify.org?format=json",
        "https://api4.my-ip.io/v2/ip.json",
        "https://ipinfo.io/json",
    ]:
        try:
            r = requests.get(svc, timeout=5)
            data = r.json()
            ip = data.get("ip") or data.get("ip_addr") or data.get("query")
            if ip:
                return ip
        except Exception:
            continue
    return "ไม่ทราบ IP"


def get_local_ip() -> str:
    """ดึง IP ใน LAN (สำหรับเชื่อมต่อในวง LAN เดียวกัน)"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ─────────────────────────────────────────────────────────────
# Supabase — ดึงสรุปยอดขายรายวัน
# ─────────────────────────────────────────────────────────────

def get_daily_summary() -> dict:
    """ดึงยอดขายวันนี้จาก Supabase"""
    now = datetime.now(TZ_THAI)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end_of_day   = now.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()

    try:
        resp = (
            supabase.table("transactions")
            .select("id, total_amount, status, created_at, cashier_name")
            .gte("created_at", start_of_day)
            .lte("created_at", end_of_day)
            .execute()
        )
        rows = resp.data or []
    except Exception as e:
        print(f"[Supabase Error] {e}")
        return {}

    completed = [r for r in rows if r.get("status") not in ("voided", "cancelled")]
    voided    = [r for r in rows if r.get("status") in ("voided", "cancelled")]

    total_sales  = sum(float(r.get("total_amount") or 0) for r in completed)
    total_voided = sum(float(r.get("total_amount") or 0) for r in voided)
    txn_count    = len(completed)
    avg_basket   = total_sales / txn_count if txn_count else 0

    # นับ cashier
    cashier_counts: dict = {}
    for r in completed:
        name = r.get("cashier_name") or "ไม่ระบุ"
        cashier_counts[name] = cashier_counts.get(name, 0) + 1

    return {
        "date":          now.strftime("%d %b %Y"),
        "time":          now.strftime("%H:%M"),
        "total_sales":   total_sales,
        "total_voided":  total_voided,
        "txn_count":     txn_count,
        "avg_basket":    avg_basket,
        "cashier_counts": cashier_counts,
        "voided_count":  len(voided),
    }


# ─────────────────────────────────────────────────────────────
# ข้อความ Telegram
# ─────────────────────────────────────────────────────────────

def startup_message(public_ip: str, local_ip: str) -> str:
    now = datetime.now(TZ_THAI)
    return (
        f"🟢 *{STORE_NAME} — ระบบเปิดทำงานแล้ว*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 วันที่ : {now.strftime('%d %b %Y')}\n"
        f"🕐 เวลา  : {now.strftime('%H:%M:%S')}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🌐 IP สาธารณะ : `{public_ip}`\n"
        f"🏠 IP ใน LAN   : `{local_ip}:{HTTP_PORT}`\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📱 เข้าแอป POS ได้ที่:\n"
        f"  • วงในร้าน: http://{local_ip}:{HTTP_PORT}\n"
        f"  • อินเทอร์เน็ต: http://{public_ip}:{HTTP_PORT}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ Bot พร้อมแจ้งเตือนอัตโนมัติแล้ว"
    )


def shutdown_message(summary: dict) -> str:
    if not summary:
        return f"🔴 *{STORE_NAME} — ระบบปิดแล้ว*\n⚠️ ไม่สามารถดึงข้อมูลยอดขายได้"

    cashier_lines = "\n".join(
        f"   • {name}: {cnt} รายการ"
        for name, cnt in summary["cashier_counts"].items()
    ) or "   ไม่มีข้อมูล"

    return (
        f"🔴 *{STORE_NAME} — ปิดระบบ / สรุปยอดประจำวัน*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 วันที่ : {summary['date']}\n"
        f"🕐 ปิดเวลา: {summary['time']}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"💰 ยอดขายรวม    : ฿{summary['total_sales']:,.2f}\n"
        f"🧾 จำนวนบิล     : {summary['txn_count']} ใบ\n"
        f"📊 เฉลี่ยต่อบิล  : ฿{summary['avg_basket']:,.2f}\n"
        f"❌ ยกเลิก/void   : {summary['voided_count']} ใบ (฿{summary['total_voided']:,.2f})\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👥 สรุปตามพนักงาน:\n{cashier_lines}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ รายงานอัตโนมัติจาก DumPOS Bot"
    )


# ─────────────────────────────────────────────────────────────
# HTTP Health-check server (เปิด port ให้เข้าจากข้างนอกได้)
# ─────────────────────────────────────────────────────────────

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        now = datetime.now(TZ_THAI).strftime("%Y-%m-%d %H:%M:%S")
        body = (
            f"<html><head><meta charset='utf-8'>"
            f"<title>{STORE_NAME} POS Bot</title>"
            f"<style>body{{font-family:sans-serif;padding:40px;background:#f0f4f8}}"
            f"h1{{color:#16a34a}}</style></head>"
            f"<body><h1>✅ {STORE_NAME} POS Bot กำลังทำงาน</h1>"
            f"<p>🕐 เวลาปัจจุบัน: <b>{now}</b></p>"
            f"<p>📡 Bot เชื่อมต่อ Supabase และ Telegram แล้ว</p>"
            f"<hr><p style='color:#888'>DumPOS Telegram Bot v1.0</p>"
            f"</body></html>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # แสดง log ใน CMD
        print(f"[HTTP] {self.address_string()} - {fmt % args}")


def start_http_server():
    """เปิด HTTP server บน 0.0.0.0 (รับการเชื่อมต่อจากทุก IP)"""
    server = HTTPServer(("0.0.0.0", HTTP_PORT), HealthHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[HTTP] Server เปิดที่ port {HTTP_PORT} แล้ว")
    return server


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print(f"  DumPOS Telegram Bot — {STORE_NAME}")
    print("=" * 50)

    # ── 1. ดึง IP
    print("[*] กำลังดึง IP สาธารณะ...")
    public_ip = get_public_ip()
    local_ip  = get_local_ip()
    print(f"[*] IP สาธารณะ : {public_ip}")
    print(f"[*] IP LAN      : {local_ip}")

    # ── 2. เปิด HTTP server
    start_http_server()

    # ── 3. ส่ง Telegram แจ้งเปิดระบบ
    print("[*] กำลังส่งแจ้งเตือน Telegram เปิดระบบ...")
    ok = send_telegram(startup_message(public_ip, local_ip))
    print(f"[*] Telegram: {'✅ ส่งสำเร็จ' if ok else '❌ ส่งไม่สำเร็จ'}")

    # ── 4. Signal handler — ทำงานเมื่อกด Ctrl+C หรือปิด CMD
    def on_shutdown(sig, frame):
        print("\n[*] กำลังปิดระบบ... ดึงสรุปยอดขาย")
        summary = get_daily_summary()
        msg = shutdown_message(summary)
        print("[*] ส่งสรุปยอดขายไป Telegram...")
        send_telegram(msg)
        print("[*] ปิดระบบเรียบร้อย ✅")
        sys.exit(0)

    signal.signal(signal.SIGINT,  on_shutdown)
    signal.signal(signal.SIGTERM, on_shutdown)

    print("")
    print("=" * 50)
    print(f"  ✅ Bot ทำงานแล้ว — กด Ctrl+C เพื่อปิด")
    print(f"  🌐 เปิด http://{local_ip}:{HTTP_PORT} เพื่อตรวจสอบ")
    print("=" * 50)
    print("")

    # ── 5. รอ signal ตลอดเวลา
    signal.pause() if sys.platform != "win32" else _windows_wait()


def _windows_wait():
    """Windows ไม่มี signal.pause() — ใช้ loop แทน"""
    import time
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
