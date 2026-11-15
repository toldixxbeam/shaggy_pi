"""Smoke tests for Shaggy OS 2.0's authenticated HTTP controller."""
import importlib.util
import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

class ShaggyOSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        os.environ["SHAGGY_OS_DATA"] = cls.tmp.name
        path = Path(__file__).resolve().parents[1] / "shaggy_os" / "server.py"
        spec = importlib.util.spec_from_file_location("shaggy_os_server",path)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)
        cls.server = ThreadingHTTPServer(("127.0.0.1",0),cls.module.Handler)
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.worker = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.worker.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=2)
        cls.tmp.cleanup()
    def request(self,path,body=None,cookie=None,origin=None):
        headers={}
        data=None
        if body is not None:
            data=json.dumps(body).encode()
            headers={"Content-Type":"application/json","X-Shaggy-OS":"1"}
        if cookie: headers["Cookie"]=cookie
        if origin: headers["Origin"]=origin
        req=Request(self.base+path,data=data,headers=headers)
        try:
            with urlopen(req,timeout=5) as r:
                return r.status,json.loads(r.read()) if "json" in r.headers.get_content_type() else None,r.headers
        except HTTPError as e:
            return e.code,json.loads(e.read()),e.headers
    def login(self):
        _,_,headers=self.request("/api/login",{"token":self.module.TOKEN})
        return headers["Set-Cookie"].split(";",1)[0]
    def test_health_and_readonly_display(self):
        self.assertEqual(self.request("/health")[0],200)
        self.assertEqual(self.request("/api/display")[0],200)
    def test_admin_requires_auth(self):
        self.assertEqual(self.request("/api/settings")[0],401)
        self.assertEqual(self.request("/api/settings",{"mode":"Photos"})[0],401)
    def test_login_and_change_mode(self):
        self.assertEqual(self.request("/api/login",{"token":"wrong"})[0],401)
        cookie=self.login()
        self.assertEqual(self.request("/api/settings",{"mode":"Groceries","message":"Dinner ready"},cookie)[0],200)
        _,data,_=self.request("/api/display")
        self.assertEqual(data["mode"],"Groceries")
        self.assertEqual(data["message"],"Dinner ready")

    def test_kiosk_session_can_read_screen_but_cannot_change_settings(self):
        self.assertEqual(self.request('/api/screen/kitchen')[0], 401)
        _, _, headers = self.request('/display')
        cookie = headers['Set-Cookie'].split(';', 1)[0]
        self.assertEqual(self.request('/api/screen/kitchen', cookie=cookie)[0], 200)
        self.assertEqual(self.request('/api/settings', cookie=cookie)[0], 401)
        self.assertEqual(self.request('/api/settings', {'mode':'Agent'}, cookie=cookie)[0], 401)
    def test_calendar_sources_are_persistent_and_validated(self):
        cookie=self.login()
        self.assertEqual(self.request("/api/settings",{"calendars":[0,2]},cookie)[0],200)
        status, data, _ = self.request("/api/display")
        self.assertEqual(status,200)
        self.assertEqual(data["calendars"],[0,2])
        self.assertEqual(self.request("/api/settings",{"calendars":[]},cookie)[0],400)
        self.assertEqual(self.request("/api/settings",{"calendars":[3]},cookie)[0],400)
        self.assertEqual(self.request("/api/settings",{"calendars":[0,0]},cookie)[0],400)
        self.assertEqual(self.request("/api/settings",{"calendars":["0"]},cookie)[0],400)

    def test_settings_validation_and_origin(self):
        cookie=self.login()
        self.assertEqual(self.request("/api/settings",{"mode":"bad"},cookie)[0],400)
        self.assertEqual(self.request("/api/settings",{"unknown":1},cookie)[0],400)
        self.assertEqual(self.request("/api/settings",{"mode":"Kitchen"},cookie,origin="https://evil.example")[0],403)
        self.assertEqual(self.request("/api/system",cookie=cookie)[0],200)

if __name__=="__main__":
    unittest.main()
