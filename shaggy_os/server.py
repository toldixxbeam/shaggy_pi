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
import threading
import time
import urllib.request
from urllib.error import HTTPError
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(os.environ.get("SHAGGY_OS_DATA", "/var/lib/shaggypi"))
ROOT.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = ROOT / "display-token"
CONFIG_FILE = ROOT / "display.json"
UI_FILE = Path(__file__).with_name("index.html")
if not TOKEN_FILE.exists():
    TOKEN_FILE.write_text(secrets.token_urlsafe(32))
    TOKEN_FILE.chmod(0o600)
TOKEN = TOKEN_FILE.read_text().strip()
KIOSK_SESSION = hmac.new(TOKEN.encode(), b'local HDMI display', hashlib.sha256).hexdigest()
DEFAULT = {"mode": "Kitchen", "message": "Welcome home.", "show_clock": True,
           "show_calendar": True, "show_weather": True, "show_jumbo": True,
           "show_agent": True, "show_moon": True, "theme": "forest",
           "agent_overlay": False, "calendars": [0, 1, 2]}
MODES = ("Kitchen", "Groceries", "Photos", "Agent", "Browser")
LEGACY_MODES = {"Calendar": "Kitchen", "Shopping": "Groceries"}
ASSETS = {"/screen.js": "text/javascript; charset=utf-8", "/screen.css": "text/css; charset=utf-8"}
CALENDAR_LOCK = threading.Lock()
CALENDAR = {"data": None, "next_check": 0, "busy": False}

def get_config():
    try:
        value = json.loads(CONFIG_FILE.read_text())
        config = {**DEFAULT, **{k: v for k,v in value.items() if k in DEFAULT}}
        config["mode"] = LEGACY_MODES.get(config["mode"], config["mode"])
        return config
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

def agent_runtime():
    """Use the local AI dashboard's private bearer token; expose status only."""
    try:
        token=(ROOT / "access-token").read_text().strip()
        request=urllib.request.Request("http://127.0.0.1:8787/api/status?summary=1",
                                       headers={"Authorization":"Bearer "+token})
        with urllib.request.urlopen(request, timeout=1.5) as response:
            data=json.load(response)
            return {"online":True, "busy":bool(data.get("agent_busy"))}
    except Exception:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8787/health", timeout=1.0) as response:
                return {"online":response.status==200,"busy":False}
        except Exception:
            return {"online":False,"busy":False}

def agent_state():
    return agent_runtime()["online"]


def agent_request(path, timeout=8, body=None):
    token = (ROOT / "access-token").read_text().strip()
    headers = {"Authorization": "Bearer " + token}
    data = None
    if body is not None:
        headers.update({'Content-Type': 'application/json', 'X-Shaggy': '1'})
        data = json.dumps(body).encode()
    request = urllib.request.Request("http://127.0.0.1:8787" + path, data=data, headers=headers)
    return urllib.request.urlopen(request, timeout=timeout)


def refresh_calendar():
    data = None
    try:
        with agent_request("/api/display/kitchen", timeout=125) as response:
            data = json.load(response)
    except (OSError, ValueError):
        pass
    finally:
        with CALENDAR_LOCK:
            healthy = data and all(source['status'] == 'ready' for source in data['sources'])
            CALENDAR.update(data=data, busy=False, next_check=time.monotonic() + (120 if healthy else 25))


def kitchen_data():
    with CALENDAR_LOCK:
        data = CALENDAR["data"]
        today = dt.datetime.now(ZoneInfo("Europe/Amsterdam")).date().isoformat()
        if (time.monotonic() >= CALENDAR["next_check"] or (data and data['today'] != today)) and not CALENDAR["busy"]:
            CALENDAR["busy"] = True
            threading.Thread(target=refresh_calendar, daemon=True).start()
        if not data or data['today'] != today:
            status = 'loading' if CALENDAR["busy"] else 'unavailable'
            return {"status": status, "today": today, "events": [], "sources": []}
        selected = get_config()['calendars']
        return {**data, "status": "ready", "events": [event for event in data['events'] if event['source'] in selected],
                "sources": [source for source in data['sources'] if source['index'] in selected]}

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
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def kiosk_request(self):
        host = urlsplit('//' + self.headers.get('Host', '')).hostname
        return self.client_address[0] == '127.0.0.1' and host == '127.0.0.1'

    def kiosk_session(self):
        if not self.kiosk_request():
            return False
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie',''))
            return 'shaggy_kiosk' in cookie and hmac.compare_digest(KIOSK_SESSION, cookie['shaggy_kiosk'].value)
        except Exception:
            return False

    def screen(self, path):
        if not (self.kiosk_session() or self.authenticated()):
            return self.send(401, {"error": "Authentication required"})
        if path == 'kitchen':
            return self.send(200, kitchen_data())
        if path in ('groceries', 'chat', 'browser'):
            try:
                with agent_request('/api/display/' + path) as response:
                    return self.send(200, response.read(), response.headers.get('Content-Type', 'application/json'))
            except OSError:
                return self.send(502, {"error": "The Shaggy agent service is unavailable."})
        if path == 'voice' and self.kiosk_session() and get_config()['mode'] == 'Agent':
            try:
                query = urlsplit(self.path).query
                with agent_request('/api/display/voice?' + query, timeout=50) as response:
                    return self.send(response.status, response.read(), response.headers.get('Content-Type', 'audio/mpeg'))
            except HTTPError as error:
                return self.send(error.code, {"error": "The requested Shaggy audio is unavailable."})
            except OSError:
                return self.send(503, {"error": "Shaggy’s Onyx voice is unavailable."})
        return self.send(404, {"error": "Display content unavailable"})

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
            if not self.kiosk_request():
                return self.send(403, {"error": "HDMI display is local to the Pi"})
            cookie = f"shaggy_kiosk={KIOSK_SESSION}; HttpOnly; SameSite=Strict; Path=/"
            return self.send(200, UI_FILE.read_bytes(), "text/html; charset=utf-8", cookie=cookie)
        if route in ASSETS:
            return self.send(200, UI_FILE.with_name(route[1:]).read_bytes(), ASSETS[route])
        if route == '/reply-audio.js' and self.kiosk_session():
            try:
                with agent_request(route, timeout=3) as response:
                    return self.send(200, response.read(), 'text/javascript; charset=utf-8')
            except OSError:
                return self.send(503, {"error": "Shaggy’s audio player is unavailable."})
        if route.startswith('/api/screen/'):
            return self.screen(route.rsplit('/', 1)[1])
        if route == "/api/display":
            config=get_config()
            runtime=agent_runtime()
            return self.send(200, {"mode":config["mode"],"message":config["message"],
                **{k:config[k] for k in DEFAULT if k.startswith("show_") or k in ("theme","agent_overlay")},
                "calendars":config["calendars"], "agent_online":runtime["online"], "agent_busy":runtime["busy"]})
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
        if self.path == '/api/screen/groceries/refresh':
            if not self.kiosk_session() or get_config()['mode'] != 'Groceries':
                return self.send(403, {'error': 'Groceries display is unavailable.'})
            try:
                with agent_request('/api/display/groceries/refresh', body={}) as response:
                    return self.send(response.status, response.read())
            except OSError:
                return self.send(503, {'error': 'The groceries update is unavailable.'})
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
                elif k=="calendars":
                    if not isinstance(v,list) or not v or len(v)>3 or any(type(i) is not int or i not in (0,1,2) for i in v) or len(set(v))!=len(v):
                        return self.send(400,{"error":"Select one or more available calendars"})
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
