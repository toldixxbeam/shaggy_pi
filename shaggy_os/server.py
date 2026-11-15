#!/usr/bin/env python3
"""Shaggy OS 2.0: lightweight display/control service; independent from AI browser."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import time
import urllib.request

ROOT = Path(os.environ.get("SHAGGY_OS_DATA", "/var/lib/shaggypi"))
ROOT.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = ROOT / "display-token"
CONFIG_FILE = ROOT / "display.json"
UI_FILE = Path(__file__).with_name("index.html")
if not TOKEN_FILE.exists():
    TOKEN_FILE.write_text(secrets.token_urlsafe(32))
    TOKEN_FILE.chmod(0o600)
TOKEN = TOKEN_FILE.read_text().strip()
DEFAULT = {"mode": "Kitchen", "message": "Welcome home.", "show_clock": True,
           "show_calendar": True, "show_weather": True, "show_jumbo": True,
           "show_agent": True, "show_moon": True, "theme": "forest",
           "agent_overlay": False}
MODES = ("Kitchen", "Calendar", "Shopping", "Photos", "Agent", "Browser")
LAST_WRITE = [0.0]

def get_config():
    try:
        value = json.loads(CONFIG_FILE.read_text())
        return {**DEFAULT, **{k: v for k,v in value.items() if k in DEFAULT}}
    except (OSError, ValueError, TypeError):
        return dict(DEFAULT)

def session_value(stamp):
    sig = hmac.new(TOKEN.encode(), str(stamp).encode(), hashlib.sha256).hexdigest()
    return f"{stamp}.{sig}"

def check_session(value):
    try:
        stamp, sig = value.split(".", 1)
        if not stamp.isdigit() or not (0 <= time.time()-int(stamp) <= 86400):
            return False
        return hmac.compare_digest(session_value(stamp), value)
    except (ValueError, AttributeError):
        return False

def agent_state():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/health", timeout=1.2) as response:
            return response.status == 200
    except Exception:
        return False

def metrics():
    def read(path):
        try: return Path(path).read_text().strip()
        except OSError: return ""
    try:
        uptime = round(float(read("/proc/uptime").split()[0])/3600,1)
    except (ValueError, IndexError): uptime = None
    try: temperature = round(int(read("/sys/class/thermal/thermal_zone0/temp"))/1000,1)
    except ValueError: temperature = None
    try:
        rows = dict((line.split(":",1)[0], int(line.split(":",1)[1].strip().split()[0]))
                    for line in read("/proc/meminfo").splitlines() if ":" in line)
        ram_used = round(100*(rows["MemTotal"]-rows["MemAvailable"])/rows["MemTotal"])
    except (KeyError, ValueError, ZeroDivisionError): ram_used = None
    try:
        load = round(os.getloadavg()[0],2)
        disk = os.statvfs("/")
        disk_used = round(100*(1-disk.f_bavail/disk.f_blocks))
    except (OSError, ZeroDivisionError): load, disk_used = None, None
    return {"agent_online": agent_state(), "uptime_hours": uptime,
            "temperature_c": temperature, "ram_used_pct": ram_used,
            "disk_used_pct": disk_used, "load_1m": load}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass
    def send(self, status, payload, kind="application/json; charset=utf-8", cookie=None):
        if isinstance(payload, (dict,list)): payload = json.dumps(payload).encode()
        elif isinstance(payload,str): payload = payload.encode()
        self.send_response(status)
        for k,v in (("Content-Type",kind),("Cache-Control","no-store"),
                    ("X-Content-Type-Options","nosniff"),("Referrer-Policy","no-referrer"),
                    ("X-Frame-Options","DENY"),("Content-Length",str(len(payload)))):
            self.send_header(k,v)
        if cookie: self.send_header("Set-Cookie",cookie)
        self.end_headers()
        self.wfile.write(payload)
    def authenticated(self):
        bearer = self.headers.get("Authorization","")
        if bearer.startswith("Bearer ") and hmac.compare_digest(bearer[7:], TOKEN): return True
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie",""))
            return "shaggyos" in cookie and check_session(cookie["shaggyos"].value)
        except Exception: return False
    def do_GET(self):
        route=self.path.split("?",1)[0]
        if route == "/health": return self.send(200, {"ok":True,"product":"Shaggy OS 2.0"})
        if route in ("/", "/display"):
            return self.send(200, UI_FILE.read_bytes(), "text/html; charset=utf-8")
        if route == "/api/display":
            config=get_config()
            return self.send(200, {"mode":config["mode"],"message":config["message"],
                **{k:config[k] for k in DEFAULT if k.startswith("show_") or k in ("theme","agent_overlay")},
                "agent_online":agent_state()})
        if not self.authenticated(): return self.send(401,{"error":"Authentication required"})
        if route == "/api/settings": return self.send(200,get_config())
        if route == "/api/system": return self.send(200,metrics())
        return self.send(404,{"error":"Not found"})
    def do_POST(self):
        if self.headers.get("Content-Type","").split(";")[0] != "application/json":
            return self.send(415,{"error":"JSON required"})
        if self.headers.get("X-Shaggy-OS")!="1":
            return self.send(403,{"error":"Request header missing"})
        # Reject cross-origin writes, including origin-less authenticated session writes.
        origin=self.headers.get("Origin")
        if origin:
            from urllib.parse import urlsplit
            parsed=urlsplit(origin)
            if parsed.netloc != self.headers.get("Host") or parsed.scheme not in ("http","https"):
                return self.send(403,{"error":"Origin rejected"})
        try:
            n=int(self.headers.get("Content-Length","0"))
            if n<1 or n>4096: return self.send(413,{"error":"Request too large"})
            body=json.loads(self.rfile.read(n))
            if not isinstance(body,dict): raise ValueError("Object expected")
        except (ValueError, json.JSONDecodeError):
            return self.send(400,{"error":"Invalid JSON"})
        if self.path=="/api/login":
            if not hmac.compare_digest(str(body.get("token","")),TOKEN):
                time.sleep(0.6)
                return self.send(401,{"error":"Invalid token"})
            stamp=int(time.time())
            # Localhost over SSH today; add Secure when served via HTTPS in future.
            secure="; Secure" if os.environ.get("SHAGGY_OS_HTTPS")=="1" else ""
            return self.send(200,{"ok":True},cookie=f"shaggyos={session_value(stamp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400{secure}")
        if not self.authenticated(): return self.send(401,{"error":"Authentication required"})
        if self.path=="/api/settings":
            old=get_config()
            for k,v in body.items():
                if k not in DEFAULT: return self.send(400,{"error":"Unknown setting"})
                if k=="mode":
                    if v not in MODES: return self.send(400,{"error":"Invalid display mode"})
                elif k=="message":
                    if not isinstance(v,str) or len(v)>240: return self.send(400,{"error":"Message too long"})
                elif k=="theme":
                    if v not in ("forest","midnight"): return self.send(400,{"error":"Invalid theme"})
                elif type(v) is not bool: return self.send(400,{"error":"Boolean required"})
                old[k]=v
            tmp=CONFIG_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(old))
            tmp.chmod(0o600)
            os.replace(tmp,CONFIG_FILE)
            return self.send(200,{"ok":True,"settings":old})
        return self.send(404,{"error":"Not found"})

if __name__=="__main__":
    host=os.environ.get("SHAGGY_OS_BIND","127.0.0.1")
    port=int(os.environ.get("SHAGGY_OS_PORT","8790"))
    ThreadingHTTPServer((host,port),Handler).serve_forever()
