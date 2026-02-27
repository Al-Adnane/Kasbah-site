#!/usr/bin/env python3
"""
kasbah_redteam_gauntlet.py

Kasbah Red Team Gauntlet v1:
- HTTP capture server (records /collect requests; detects secret in URL/body)
- WebSocket capture server (records ws messages; detects secret)
- Serves /gauntlet.html with many exfil vectors
- Prints PASS/FAIL + leak details

No third-party deps (stdlib only).
Test philosophy:
  FAIL if raw SECRET bytes appear in ANY outbound request payload or URL.

Usage:
  python3 kasbah_redteam_gauntlet.py
  python3 kasbah_redteam_gauntlet.py --secret "sk-proj-mysecretkey" --http-port 8791 --ws-port 8792
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import socket
import sys
import threading
import time
from dataclasses import dataclass, asdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Optional, List, Dict, Any, Tuple


# ----------------------------
# Shared capture store
# ----------------------------

@dataclass
class Capture:
    t: float
    proto: str  # "http" or "ws"
    method: str
    path: str
    headers: Dict[str, str]
    body: str
    verdict: str  # "clean" or "LEAK"
    vector_hint: str = ""


class CaptureStore:
    def __init__(self, secret: str):
        self.secret = secret
        self._lock = threading.Lock()
        self.items: List[Capture] = []

    def add(self, cap: Capture):
        with self._lock:
            self.items.append(cap)

    def snapshot(self) -> List[Capture]:
        with self._lock:
            return list(self.items)

    def has_leak(self) -> bool:
        with self._lock:
            return any(c.verdict == "LEAK" for c in self.items)


# ----------------------------
# HTTP Server
# ----------------------------

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class GauntletHandler(BaseHTTPRequestHandler):
    server_version = "KasbahGauntletHTTP/1.0"

    # Set by server init
    store: CaptureStore = None  # type: ignore
    secret: str = ""

    def log_message(self, fmt: str, *args):
        # quiet default logs
        return

    def _read_body(self) -> bytes:
        n = int(self.headers.get("content-length", "0") or "0")
        if n <= 0:
            return b""
        return self.rfile.read(n)

    def _verdict(self, body_s: str, path: str) -> str:
        # detect raw secret in body or URL/query
        if self.secret and (self.secret in body_s or self.secret in path):
            return "LEAK"
        return "clean"

    def _capture(self, method: str, path: str, body_b: bytes):
        body_s = ""
        try:
            body_s = body_b.decode("utf-8", errors="replace")
        except Exception:
            body_s = repr(body_b[:200])

        headers = {k.lower(): v for (k, v) in self.headers.items()}
        verdict = self._verdict(body_s, path)
        vector_hint = headers.get("x-kasbah-vector", "")

        self.store.add(Capture(
            t=time.time(),
            proto="http",
            method=method,
            path=path,
            headers=headers,
            body=body_s,
            verdict=verdict,
            vector_hint=vector_hint,
        ))

        ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        if verdict == "LEAK":
            if self.secret in path:
                print(f"[{ts}Z] {path}  {method}  🚨 FAIL — SECRET FOUND IN QUERY")
            else:
                print(f"[{ts}Z] {path}  {method}  🚨 FAIL — SECRET FOUND")
                print(f"  Body: {body_s[:400]}")
        else:
            print(f"[{ts}Z] {path}  {method}  ✓ clean")

    def do_GET(self):
        if self.path.startswith("/gauntlet.html") or self.path == "/":
            page = build_gauntlet_html(self.server.http_port, self.server.ws_port, self.secret)  # type: ignore
            body = page.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path.startswith("/collect"):
            # Treat GET query as capture (leak often happens here)
            self._capture("GET", self.path, b"")
            self.send_response(200)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        if self.path.startswith("/pixel"):
            # 1x1 pixel response for <img src=...> exfil tests
            self._capture("GET", self.path, b"")
            png_1x1 = base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XnGv8AAAAASUVORK5CYII="
            )
            self.send_response(200)
            self.send_header("content-type", "image/png")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(png_1x1)))
            self.end_headers()
            self.wfile.write(png_1x1)
            return

        if self.path.startswith("/script.js"):
            # JS response for <script src=...> exfil tests (query includes secret)
            self._capture("GET", self.path, b"")
            js = b"// ok\n"
            self.send_response(200)
            self.send_header("content-type", "application/javascript; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(js)))
            self.end_headers()
            self.wfile.write(js)
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"NOT_FOUND")

    def do_POST(self):
        if self.path.startswith("/collect"):
            body = self._read_body()
            self._capture("POST", self.path, body)
            self.send_response(200)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"NOT_FOUND")


# ----------------------------
# Minimal WebSocket Server (text frames)
# ----------------------------

class WebSocketServer(threading.Thread):
    def __init__(self, host: str, port: int, store: CaptureStore, secret: str):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.store = store
        self.secret = secret
        self._stop = threading.Event()

    def stop(self):
        self._stop.set()
        # connect to unblock accept
        try:
            with socket.create_connection((self.host, self.port), timeout=0.2):
                pass
        except Exception:
            pass

    def run(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind((self.host, self.port))
        srv.listen(50)

        while not self._stop.is_set():
            try:
                conn, addr = srv.accept()
            except Exception:
                continue
            try:
                conn.settimeout(2.0)
                self._handle_conn(conn)
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass

        try:
            srv.close()
        except Exception:
            pass

    def _handle_conn(self, conn: socket.socket):
        req = b""
        while b"\r\n\r\n" not in req and len(req) < 8192:
            chunk = conn.recv(1024)
            if not chunk:
                conn.close()
                return
            req += chunk

        hdr_text = req.decode("utf-8", errors="replace")
        lines = hdr_text.split("\r\n")
        if not lines or "upgrade: websocket" not in hdr_text.lower():
            conn.close()
            return

        key = ""
        for ln in lines:
            if ln.lower().startswith("sec-websocket-key:"):
                key = ln.split(":", 1)[1].strip()
                break
        if not key:
            conn.close()
            return

        accept = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("utf-8")).digest()
        ).decode("ascii")

        resp = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n"
            "\r\n"
        ).encode("utf-8")
        conn.sendall(resp)

        # Read frames until close
        while True:
            frame = conn.recv(2)
            if not frame:
                break
            b1, b2 = frame[0], frame[1]
            fin = (b1 & 0x80) != 0
            opcode = b1 & 0x0F
            masked = (b2 & 0x80) != 0
            plen = b2 & 0x7F

            if opcode == 0x8:  # close
                break

            if plen == 126:
                ext = conn.recv(2)
                plen = int.from_bytes(ext, "big")
            elif plen == 127:
                ext = conn.recv(8)
                plen = int.from_bytes(ext, "big")

            mask_key = b""
            if masked:
                mask_key = conn.recv(4)

            payload = b""
            while len(payload) < plen:
                chunk = conn.recv(min(4096, plen - len(payload)))
                if not chunk:
                    break
                payload += chunk

            if masked and mask_key:
                payload = bytes(payload[i] ^ mask_key[i % 4] for i in range(len(payload)))

            # opcode 0x1 = text
            body_s = payload.decode("utf-8", errors="replace")
            verdict = "LEAK" if (self.secret and self.secret in body_s) else "clean"
            self.store.add(Capture(
                t=time.time(),
                proto="ws",
                method="WS",
                path="/ws",
                headers={},
                body=body_s,
                verdict=verdict,
                vector_hint="ws",
            ))

            ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
            if verdict == "LEAK":
                print(f"[{ts}Z] WS message  🚨 FAIL — SECRET FOUND IN WS")
            else:
                print(f"[{ts}Z] WS message  ✓ clean")

            if not fin:
                # For simplicity, we don't reassemble fragmented frames in this minimal server
                pass

        try:
            conn.close()
        except Exception:
            pass


# ----------------------------
# Gauntlet HTML builder
# ----------------------------

def build_gauntlet_html(http_port: int, ws_port: int, secret: str) -> str:
    s = html.escape(secret)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Kasbah Red Team Gauntlet v1</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {{ font-family: system-ui, -apple-system, sans-serif; margin: 16px; background: #f8f9fa; }}
    button {{ margin: 6px 6px 6px 0; padding: 10px 12px; background: #c1440e; color: white; border: none; border-radius: 4px; cursor: pointer; }}
    button:hover {{ background: #9c360b; }}
    textarea, input {{ width: 100%; max-width: 980px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }}
    .row {{ max-width: 980px; margin: 12px 0; }}
    .hint {{ color: #555; margin-top: 8px; font-size: 0.9em; }}
    .danger {{ color: #b00020; font-weight: 700; }}
    .ok {{ color: #0a7; font-weight: 700; }}
    code {{ background: #f3f3f3; padding: 2px 5px; border-radius: 4px; font-family: monospace; }}
    h1 {{ color: #1a1a2e; }}
  </style>
</head>
<body>
  <h1>🏰 Kasbah Red Team Gauntlet v1</h1>
  <div class="row">
    <p>Secret under test: <code id="secret"></code></p>
    <p class="hint">
      Goal: Kasbah must prevent the raw secret from reaching this server via <em>any</em> vector.<br/>
      Click <b>RUN ALL</b> to fire all vectors at once.
      Also test: paste into the box, press Enter, submit forms, drag/drop.
    </p>
    <textarea id="box" rows="5" placeholder="Paste here — Kasbah should intercept"></textarea>
    <input id="field" placeholder="Input field — type secret here and press Enter" />
    <form id="form" action="/collect" method="POST">
      <input id="hidden" name="field" value="" type="hidden" />
      <button type="submit">Form Submit (Enter key)</button>
    </form>

    <div style="margin-top:10px">
      <button id="runAll">🚀 RUN ALL</button>
      <button id="btnFetch">fetch() POST</button>
      <button id="btnXHR">XHR POST</button>
      <button id="btnBeacon">sendBeacon</button>
      <button id="btnWS">WebSocket.send()</button>
      <button id="btnFormSubmit">form.submit() [code]</button>
      <button id="btnImg">IMG src GET</button>
      <button id="btnScript">SCRIPT src GET</button>
      <button id="btnLocation">location.assign (query)</button>
      <button id="btnPushState">history.pushState (query)</button>
      <button id="btnTimeout">setTimeout → fetch</button>
      <button id="btnMutation">DOM Mutation → fetch</button>
      <button id="btnIFrame">iframe postMessage → fetch</button>
    </div>

    <p class="hint"><span class="danger">If ANY button causes a server hit with the secret, FAIL.</span><br/>
    After Ctrl+C the server prints a full JSON verdict log.</p>
  </div>

<script>
(() => {{
  const SECRET = "{s}";
  document.getElementById("secret").textContent = SECRET;

  const box = document.getElementById("box");
  const field = document.getElementById("field");
  const hidden = document.getElementById("hidden");
  const form = document.getElementById("form");

  function payload(extra={{}}) {{
    return Object.assign({{
      t: Date.now(),
      secret: SECRET,
      text: box.value || SECRET,
      field: field.value || SECRET,
    }}, extra);
  }}

  async function exfilFetch(extra={{}}, vector="fetch") {{
    try {{
      await fetch("/collect", {{
        method: "POST",
        headers: {{
          "content-type":"application/json",
          "x-kasbah-vector": vector
        }},
        body: JSON.stringify(payload(extra))
      }});
    }} catch(e) {{ console.log("fetch blocked:", e.message); }}
  }}

  function exfilXHR(extra={{}}, vector="xhr") {{
    try {{
      const x = new XMLHttpRequest();
      x.open("POST", "/collect");
      x.setRequestHeader("content-type","application/json");
      x.setRequestHeader("x-kasbah-vector", vector);
      x.send(JSON.stringify(payload(extra)));
    }} catch(e) {{ console.log("XHR blocked:", e.message); }}
  }}

  function exfilBeacon(extra={{}}, vector="beacon") {{
    try {{
      const b = new Blob([JSON.stringify(payload(extra))], {{type:"application/json"}});
      navigator.sendBeacon("/collect", b);
    }} catch(e) {{ console.log("beacon blocked:", e.message); }}
  }}

  function exfilWS(extra={{}}, vector="ws") {{
    try {{
      const ws = new WebSocket("ws://127.0.0.1:{ws_port}/ws");
      ws.onopen = () => {{
        ws.send(JSON.stringify(payload(Object.assign(extra, {{vector}}))));
        ws.close();
      }};
    }} catch(e) {{ console.log("WS blocked:", e.message); }}
  }}

  function exfilFormSubmit(vector="form.submit") {{
    try {{
      hidden.value = SECRET;
      form.submit();
    }} catch(e) {{ console.log("form.submit blocked:", e.message); }}
  }}

  function exfilImg(vector="img") {{
    try {{
      const img = new Image();
      img.src = "/pixel?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(SECRET);
      document.body.appendChild(img);
    }} catch(e) {{ console.log("img blocked:", e.message); }}
  }}

  function exfilScript(vector="script") {{
    try {{
      const s = document.createElement("script");
      s.src = "/script.js?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(SECRET);
      document.body.appendChild(s);
    }} catch(e) {{ console.log("script blocked:", e.message); }}
  }}

  function exfilLocation(vector="location") {{
    location.assign("/collect?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(SECRET));
  }}

  function exfilPushState(vector="pushState") {{
    try {{
      history.pushState({{}}, "", "/collect?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(SECRET));
      // Then hit server so URL gets captured
      fetch(location.href, {{method:"GET", headers: {{"x-kasbah-vector": vector}}}});
    }} catch(e) {{ console.log("pushState blocked:", e.message); }}
  }}

  function exfilTimeout(vector="timeout") {{
    setTimeout(() => exfilFetch({{vector}}, vector), 50);
  }}

  function exfilMutation(vector="mutation") {{
    try {{
      const target = document.createElement("div");
      document.body.appendChild(target);
      const mo = new MutationObserver(() => {{
        mo.disconnect();
        exfilFetch({{vector}}, vector);
      }});
      mo.observe(target, {{childList:true}});
      target.appendChild(document.createElement("span"));
    }} catch(e) {{ console.log("mutation blocked:", e.message); }}
  }}

  function exfilIFrame(vector="iframe") {{
    try {{
      const ifr = document.createElement("iframe");
      ifr.srcdoc = "<scr" + "ipt>window.addEventListener('message', (e) => {{ fetch('/collect', {{method:'POST', headers:{{'content-type':'application/json','x-kasbah-vector':'iframe'}}, body: JSON.stringify(e.data)}}); }});<\\/scr" + "ipt>";
      document.body.appendChild(ifr);
      setTimeout(() => {{
        ifr.contentWindow.postMessage(payload({{vector}}), "*");
      }}, 50);
    }} catch(e) {{ console.log("iframe blocked:", e.message); }}
  }}

  // Wire buttons
  document.getElementById("btnFetch").onclick = () => exfilFetch();
  document.getElementById("btnXHR").onclick = () => exfilXHR();
  document.getElementById("btnBeacon").onclick = () => exfilBeacon();
  document.getElementById("btnWS").onclick = () => exfilWS();
  document.getElementById("btnFormSubmit").onclick = () => exfilFormSubmit();
  document.getElementById("btnImg").onclick = () => exfilImg();
  document.getElementById("btnScript").onclick = () => exfilScript();
  document.getElementById("btnLocation").onclick = () => exfilLocation();
  document.getElementById("btnPushState").onclick = () => exfilPushState();
  document.getElementById("btnTimeout").onclick = () => exfilTimeout();
  document.getElementById("btnMutation").onclick = () => exfilMutation();
  document.getElementById("btnIFrame").onclick = () => exfilIFrame();

  document.getElementById("runAll").onclick = async () => {{
    // Pre-fill inputs with secret
    box.value = SECRET;
    field.value = SECRET;
    hidden.value = SECRET;

    try {{ await exfilFetch({{vector:"runAll"}}, "fetch"); }} catch {{}}
    try {{ exfilXHR({{vector:"runAll"}}, "xhr"); }} catch {{}}
    try {{ exfilBeacon({{vector:"runAll"}}, "beacon"); }} catch {{}}
    try {{ exfilWS({{vector:"runAll"}}, "ws"); }} catch {{}}
    try {{ exfilFormSubmit("form.submit"); }} catch {{}}
    try {{ exfilImg("img"); }} catch {{}}
    try {{ exfilScript("script"); }} catch {{}}
    try {{ exfilTimeout("timeout"); }} catch {{}}
    try {{ exfilMutation("mutation"); }} catch {{}}
    try {{ exfilIFrame("iframe"); }} catch {{}}

    // Note: location.assign and pushState+GET are intentionally not auto-triggered
    // because they navigate away. Test manually by clicking their buttons.
  }};

  // Enter-key submit path (additional form vector)
  field.addEventListener("keydown", (e) => {{
    if (e.key === "Enter") {{
      hidden.value = SECRET;
      try {{ form.submit(); }} catch(err) {{ console.log("Enter submit blocked:", err.message); }}
    }}
  }});
}})();
</script>
</body>
</html>
"""


# ----------------------------
# Verdict + Reporting
# ----------------------------

def print_verdict(store: CaptureStore):
    items = store.snapshot()
    leaks = [c for c in items if c.verdict == "LEAK"]

    print("\n" + "━" * 50)
    print("  GAUNTLET VERDICT")
    print("━" * 50)

    if not items:
        print("No requests captured — Kasbah may have blocked all vectors before network.")
        print("  ✅ PASS (no outbound requests reached server)")
        print("\n  Full captured log:")
        print("[]")
        return

    if leaks:
        print(f"🚨 FAIL — {len(leaks)} leak(s) detected (raw secret reached server).")
        # Rank by protocol then path
        for i, c in enumerate(leaks[:20], 1):
            ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(c.t))
            hint = f"  vector={c.vector_hint}" if c.vector_hint else ""
            print(f"{i:02d}) [{ts}Z] {c.proto.upper()} {c.method} {c.path}{hint}")
        print("\nNext engineering move (binary):")
        print("  Enforce detection at EGRESS: fetch/XHR/beacon/ws/form/img/script/location")
    else:
        print(f"✅ PASS — {len(items)} capture(s) but none contained the raw secret.")

    print("\nFull log (JSON):")
    print(json.dumps([asdict(c) for c in items], indent=2, ensure_ascii=False))


# ----------------------------
# Main
# ----------------------------

def main():
    ap = argparse.ArgumentParser(description="Kasbah Red Team Gauntlet v1 — stdlib-only, single-secret HTTP+WS capture")
    ap.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    ap.add_argument("--http-port", type=int, default=8789, help="HTTP port (default: 8789)")
    ap.add_argument("--ws-port", type=int, default=8790, help="WebSocket port (default: 8790)")
    ap.add_argument("--secret", default="sk-proj-1234567890abcdefghijklmnopqrstuvwxyz",
                    help="Secret to watch for in outbound requests")
    args = ap.parse_args()

    store = CaptureStore(secret=args.secret)

    # Start WS server
    ws = WebSocketServer(args.host, args.ws_port, store, args.secret)
    ws.start()

    # Start HTTP server
    GauntletHandler.store = store
    GauntletHandler.secret = args.secret

    httpd = ThreadedHTTPServer((args.host, args.http_port), GauntletHandler)
    httpd.http_port = args.http_port  # type: ignore
    httpd.ws_port = args.ws_port      # type: ignore

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  Kasbah Red Team Gauntlet v1")
    print(f"  http://{args.host}:{args.http_port}/gauntlet.html")
    print("  Open with Kasbah extension active.")
    print("  Click RUN ALL, then also click location.assign + pushState manually.")
    print("  Ctrl+C to stop and see verdict.")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            httpd.shutdown()
        except Exception:
            pass
        ws.stop()
        print_verdict(store)


if __name__ == "__main__":
    main()
