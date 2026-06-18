"""
DumPOS All-in-One Server
=========================
ไฟล์นี้เป็น server หลักที่รวมทุกอย่างไว้ในที่เดียว:
  1. เปิดเว็บ POS (dist/) บน port 3000
  2. รัน Telegram Bot (แจ้ง IP + สรุปยอดขาย)
  3. แจ้ง IP สาธารณะ ให้เข้าได้จากทุกที่
  4. เปิด browser อัตโนมัติ

วิธีใช้: python server.py  (หรือ double-click START_HERE.bat)
"""

import os
import sys
import signal
import threading
import subprocess
import webbrowser
import time
import socket
import http.server
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ─── ตำแหน่งไฟล์ ───────────────────────────────────────────
ROOT_DIR    = Path(__file__).parent.parent          # root ของ project
DIST_DIR    = ROOT_DIR / "dist"                     # React build output
BOT_DIR     = ROOT_DIR / "bot"
ENV_BOT     = BOT_DIR / ".env.bot"

# ─── อ่าน config จาก bot/.env.bot ──────────────────────────
def load_env(path: Path) -> dict:
    cfg = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                cfg[k.strip()] = v.strip()
    return cfg

cfg = load_env(ENV_BOT)
TELEGRAM_TOKEN  = cfg.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT   = cfg.get("TELEGRAM_CHAT_ID", "")
STORE_NAME      = cfg.get("STORE_NAME", "Dumpos")
WEB_PORT        = int(cfg.get("HTTP_PORT", "3000"))
TZ_THAI         = timezone(timedelta(hours=7))


# ─── Telegram ───────────────────────────────────────────────
def send_telegram(msg: str):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT:
        print("[Telegram] ⚠️  ไม่ได้ตั้งค่า token/chat_id")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT, "text": msg, "parse_mode": "Markdown"},
            timeout=10,
        )
        print("[Telegram] ✅ ส่งแจ้งเตือนสำเร็จ")
    except Exception as e:
        print(f"[Telegram] ❌ {e}")


# ─── IP helpers ─────────────────────────────────────────────
def get_public_ip() -> str:
    for svc in [
        "https://api.ipify.org?format=json",
        "https://api4.my-ip.io/v2/ip.json",
        "https://ipinfo.io/json",
    ]:
        try:
            data = requests.get(svc, timeout=5).json()
            ip = data.get("ip") or data.get("ip_addr")
            if ip:
                return ip
        except Exception:
            continue
    return "ไม่ทราบ"

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ─── Supabase — ยอดขายรายวัน ────────────────────────────────
def get_daily_summary() -> dict:
    supabase_url = cfg.get("SUPABASE_URL", "")
    service_key  = cfg.get("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not service_key:
        return {}
    now   = datetime.now(TZ_THAI)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end   = now.replace(hour=23, minute=59, second=59).isoformat()
    try:
        resp = requests.get(
            f"{supabase_url}/rest/v1/transactions",
            headers={
                "apikey":        service_key,
                "Authorization": f"Bearer {service_key}",
            },
            params={
                "select":      "id,total_amount,status,cashier_name",
                "created_at":  f"gte.{start}",
                "created_at2": f"lte.{end}",
            },
            timeout=10,
        )
        rows      = resp.json() if resp.status_code == 200 else []
        done      = [r for r in rows if r.get("status") not in ("voided","cancelled")]
        voided    = [r for r in rows if r.get("status") in ("voided","cancelled")]
        total     = sum(float(r.get("total_amount") or 0) for r in done)
        v_total   = sum(float(r.get("total_amount") or 0) for r in voided)
        count     = len(done)
        avg       = total / count if count else 0
        cashiers  = {}
        for r in done:
            n = r.get("cashier_name") or "ไม่ระบุ"
            cashiers[n] = cashiers.get(n, 0) + 1
        return {
            "date": now.strftime("%d %b %Y"),
            "time": now.strftime("%H:%M"),
            "total": total, "v_total": v_total,
            "count": count, "avg": avg,
            "cashiers": cashiers, "voided": len(voided),
        }
    except Exception as e:
        print(f"[Supabase] ❌ {e}")
        return {}


def shutdown_msg(s: dict) -> str:
    if not s:
        return f"🔴 *{STORE_NAME}* — ปิดระบบแล้ว ⚠️ ดึงยอดขายไม่ได้"
    lines = "\n".join(f"   • {n}: {c} บิล" for n, c in s["cashiers"].items()) or "   ไม่มี"
    return (
        f"🔴 *{STORE_NAME} — ปิดระบบ / สรุปยอดวันนี้*\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📅 {s['date']}  🕐 {s['time']}\n"
        f"💰 ยอดขาย   : ฿{s['total']:,.0f}\n"
        f"🧾 จำนวนบิล : {s['count']} ใบ  |  เฉลี่ย ฿{s['avg']:,.0f}\n"
        f"❌ void/ยกเลิก: {s['voided']} ใบ (฿{s['v_total']:,.0f})\n"
        f"👥 พนักงาน:\n{lines}"
    )


# ─── Static file server (serve dist/) ──────────────────────
class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Single-Page App handler — redirect 404 → index.html"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def do_GET(self):
        # ถ้าไฟล์ไม่มีให้ส่ง index.html (SPA routing)
        path = DIST_DIR / self.path.lstrip("/")
        if not path.exists() or path.is_dir():
            self.path = "/index.html"
        super().do_GET()

    def log_message(self, fmt, *args):
        # แสดง log ใน terminal
        now = datetime.now(TZ_THAI).strftime("%H:%M:%S")
        print(f"[Web {now}] {fmt % args}")


def start_web_server():
    server = http.server.ThreadingHTTPServer(("0.0.0.0", WEB_PORT), SPAHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[Web] ✅ เปิด port {WEB_PORT} แล้ว — http://localhost:{WEB_PORT}")
    return server


# ─── Main ────────────────────────────────────────────────────
def main():
    print("=" * 55)
    print(f"  🛒  DumPOS — เริ่มต้นระบบ")
    print("=" * 55)

    # 1. ตรวจ dist/
    if not DIST_DIR.exists() or not (DIST_DIR / "index.html").exists():
        print("[Build] dist/ ไม่พบ — กำลัง build React app...")
        result = subprocess.run(
            ["npx", "vite", "build"],
            cwd=str(ROOT_DIR),
            shell=sys.platform == "win32",
        )
        if result.returncode != 0:
            print("[Build] ❌ Build ล้มเหลว กรุณารัน: npm run build ก่อน")
            sys.exit(1)
        print("[Build] ✅ Build สำเร็จ")
    else:
        print("[Web] ✅ พบ dist/ แล้ว")

    # 2. ดึง IP
    print("[Net] กำลังดึง IP...")
    public_ip = get_public_ip()
    local_ip  = get_local_ip()
    print(f"[Net] สาธารณะ: {public_ip}  |  LAN: {local_ip}")

    # 3. เปิด web server
    start_web_server()

    # 4. ส่ง Telegram เปิดระบบ
    now     = datetime.now(TZ_THAI)
    open_msg = (
        f"🟢 *{STORE_NAME} — เปิดระบบแล้ว*\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📅 {now.strftime('%d %b %Y')}  🕐 {now.strftime('%H:%M:%S')}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🌐 IP สาธารณะ : `{public_ip}`\n"
        f"🏠 IP LAN      : `{local_ip}`\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📱 เข้าใช้งานระบบ POS:\n"
        f"  • ในร้าน  → http://{local_ip}:{WEB_PORT}\n"
        f"  • นอกร้าน → http://{public_ip}:{WEB_PORT}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"✅ ระบบพร้อมใช้งาน!"
    )
    send_telegram(open_msg)

    # 5. เปิด browser
    time.sleep(1)
    webbrowser.open(f"http://localhost:{WEB_PORT}")
    print(f"[Browser] เปิด http://localhost:{WEB_PORT} แล้ว")

    # 6. Signal handler — ส่งสรุปเมื่อปิด
    def on_shutdown(sig, frame):
        print("\n[Shutdown] กำลังส่งสรุปยอดขาย...")
        send_telegram(shutdown_msg(get_daily_summary()))
        print("[Shutdown] ✅ ปิดระบบเรียบร้อย")
        sys.exit(0)

    signal.signal(signal.SIGINT,  on_shutdown)
    signal.signal(signal.SIGTERM, on_shutdown)

    print("")
    print("=" * 55)
    print(f"  ✅ ระบบทำงานอยู่ — กด Ctrl+C เพื่อปิด")
    print(f"  🌐 http://localhost:{WEB_PORT}")
    print(f"  🌐 http://{local_ip}:{WEB_PORT}  (คอมเครื่องอื่นในร้าน)")
    print(f"  🌐 http://{public_ip}:{WEB_PORT}  (จากข้างนอก)")
    print("=" * 55)

    # 7. รอ signal
    if sys.platform == "win32":
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            on_shutdown(None, None)
    else:
        signal.pause()


if __name__ == "__main__":
    main()
