#!/usr/bin/env python3
"""Single-origin Shaggy portal. Pi kiosk and AI workstation remain isolated processes."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
from http.cookies import SimpleCookie
from pathlib import Path
import json
import os
import urllib.request
import urllib.error
from urllib.parse import urlsplit
UI=Path(__file__).with_name("index.html")
AGENT_PORT=8787
DISPLAY_PORT=8790
MAX_POST=24*1024*1024
PASS_HEADERS=("Content-Type","Set-Cookie","Cache-Control","Location")
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self,status,data,ctype="application/json; charset=utf-8",extra=None):
        if isinstance(data,(dict,list)):data=json.dumps(data).encode()
        if isinstance(data,str):data=data.encode()
        self.send_response(status)
        self.send_header("Content-Type",ctype)
        self.send_header("Content-Length",str(len(data)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("X-Frame-Options","SAMEORIGIN")
        if extra:
            for name,value in extra:self.send_header(name,value)
        self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass
    def auth(self):
        headers={"Cookie":self.headers.get("Cookie","")}
        bearer=self.headers.get("Authorization")
        if bearer:headers["Authorization"]=bearer
        req=urllib.request.Request("http://127.0.0.1:8787/api/status?summary=1",headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=3) as response:
                return response.status==200
        except Exception:return False
    def proxy(self,port,path=None,display_auth=False):
        if path is None:path=self.path
        method=self.command
        size=int(self.headers.get("Content-Length","0"))
        if size>MAX_POST or size<0:return self.reply(413,{"error":"Body too large"})
        data=self.rfile.read(size) if size else None
        conn=HTTPConnection("127.0.0.1",port,timeout=180)
        headers={}
        for key in ("Content-Type","Cookie","Authorization","X-Shaggy","X-Filename","X-Conversation-ID","Origin"):
            if self.headers.get(key):headers[key]=self.headers[key]
        if display_auth:
            try:
                token=Path("/var/lib/shaggypi/display-token").read_text().strip()
            except OSError:
                return self.reply(502,{"error":"Pi display unavailable"})
            headers["Authorization"]="Bearer "+token
        # The legacy API checks Origin against its own public host, which may
        # differ on the Pi. Browser-side requests are same-origin to this portal.
        if "Origin" in headers:headers.pop("Origin")
        # No user-controlled target host, path normalization or proxy URL.
        try:
            conn.request(method,path,body=data,headers=headers)
            resp=conn.getresponse()
            body=resp.read()
            extra=[]
            for name,val in resp.getheaders():
                if name.lower() in ("set-cookie","location"):
                    extra.append((name,val))
            content_type=resp.getheader("Content-Type","application/octet-stream")
            self.reply(resp.status,body,content_type,extra)
        except Exception:
            self.reply(502,{"error":"Pi component unavailable"})
        finally:conn.close()
    def route(self):
        path=urlsplit(self.path).path
        if path=="/health":return self.reply(200,{"ok":True,"name":"Shaggy unified"})
        if path=="/":return self.reply(200,UI.read_bytes(),"text/html; charset=utf-8")
        if path=="/agent":return self.proxy(AGENT_PORT,"/")
        if path in ("/app.js","/app.css"):return self.proxy(AGENT_PORT)
        if path in ("/screen.js","/screen.css"):return self.proxy(DISPLAY_PORT)
        if path in ("/api/screen/kitchen", "/api/screen/groceries") and self.command == 'GET':
            if not self.auth():return self.reply(401,{"error":"Sign in to Shaggy"})
            return self.proxy(DISPLAY_PORT,path,display_auth=True)
        if path.startswith('/api/screen/'):
            return self.reply(404,{"error":"HDMI content is local to the Pi"})
        if path=="/api/os/status":
            if not self.auth():return self.reply(401,{"error":"Sign in to Shaggy"})
            self.proxy(DISPLAY_PORT,"/api/display")
            return
        if path=="/api/os/system":
            if not self.auth():return self.reply(401,{"error":"Sign in to Shaggy"})
            # Local display service has its own token; do not reveal it to browser.
            token_file=Path("/var/lib/shaggypi/display-token")
            try:
                token=token_file.read_text().strip()
                req=urllib.request.Request("http://127.0.0.1:8790/api/system",
                                           headers={"Authorization":"Bearer "+token})
                with urllib.request.urlopen(req,timeout=3) as result:
                    return self.reply(result.status,result.read(),result.headers.get("Content-Type","application/json"))
            except Exception:return self.reply(502,{"error":"Display metrics unavailable"})
        if path=="/api/os/settings":
            if not self.auth():return self.reply(401,{"error":"Sign in to Shaggy"})
            token_file=Path("/var/lib/shaggypi/display-token")
            try:
                token=token_file.read_text().strip()
                body=None
                if self.command=="POST":
                    if self.headers.get("X-Shaggy-OS")!="1":return self.reply(403,{"error":"Invalid request"})
                    n=int(self.headers.get("Content-Length","0"))
                    if n<1 or n>4096:return self.reply(413,{"error":"Invalid request size"})
                    body=self.rfile.read(n)
                request=urllib.request.Request("http://127.0.0.1:8790/api/settings",data=body,
                    headers={"Authorization":"Bearer "+token,"Content-Type":"application/json","X-Shaggy-OS":"1"})
                with urllib.request.urlopen(request,timeout=5) as response:
                    return self.reply(response.status,response.read())
            except urllib.error.HTTPError as error:
                return self.reply(error.code,{"error":"Display settings rejected"})
            except Exception:return self.reply(502,{"error":"Display settings unavailable"})
        if path in ("/display","/api/display"):
            return self.reply(403,{"error":"Kitchen display is local-only"})
        # Agent API endpoints stay within the trusted internal port.
        if path.startswith("/api/") or path in ("/oauth/google/callback","/webhooks/whatsapp"):
            return self.proxy(AGENT_PORT)
        return self.reply(404,{"error":"Not found"})
    def do_GET(self):self.route()
    def do_POST(self):self.route()
if __name__=="__main__":
    ThreadingHTTPServer(("127.0.0.1",int(os.environ.get("SHAGGY_UNIFIED_PORT","8800"))),Handler).serve_forever()
