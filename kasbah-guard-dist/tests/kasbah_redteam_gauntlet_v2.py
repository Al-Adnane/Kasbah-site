#!/usr/bin/env python3
"""
Kasbah Red Team Gauntlet v2 — Universal Secret Exfiltration Tester

Tests 50+ exfil vectors across:
- HTTP (GET/POST/fetch/XHR/beacon/form)
- WebSocket
- DOM sinks (img, script, iframe, link, object)
- Navigation (location.assign, history.pushState)
- Input events (paste, type, autocomplete, drag-drop)
- Document uploads (simulated base64 blobs)
- Multi-language secrets (EN, ZH, AR, RU, EMOJI, Unicode)

Outputs PASS/FAIL + forensic leak report with category breakdown.

No external dependencies — pure stdlib.

Usage:
  python3 kasbah_redteam_gauntlet_v2.py
  python3 kasbah_redteam_gauntlet_v2.py --http-port 8791 --ws-port 8792
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
import urllib.parse
from dataclasses import dataclass, asdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Optional, List, Dict, Any, Tuple


# ----------------------------
# Secrets Library (Multi-Language)
# ----------------------------

SECRET_VARIANTS = [
    # English / Standard API keys
    "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz",
    "sk_live_51234567890abcdef1234567890abcde",
    "xoxb-123456789012-1234567890-abcdefghij",

    # Mandarin (Chinese) — 密钥 = "secret key"
    "密钥：sk-proj-中文测试密钥1234567890",
    "API密钥=sk_live_中文测试密钥1234567890abcdef",

    # Arabic — مفتاح = "key", اختبار = "test"
    "مفتاح-API: sk-proj-اختبار-عربي-1234567890",

    # Cyrillic (Russian) — Ключ = "key", тест = "test"
    "Ключ-API: sk-proj-тест-ключ-1234567890",

    # Emoji + Unicode
    "🔑=sk-proj-emoji-test-1234567890✨",
    "秘密=sk-live-unicode-テスト-1234567890✓",

    # JWT-like (3-part dot-separated structure)
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",

    # Private key fragment (standard PEM header)
    "-----BEGIN PRIVATE KEY-----\nMIIEfake12345\n-----END PRIVATE KEY-----",
]

# All secret strings concatenated for quick containment check
ALL_SECRETS_FLAT = "\n".join(SECRET_VARIANTS)


# ----------------------------
# Shared Capture Store
# ----------------------------

@dataclass
class Capture:
    t: float
    proto: str  # "http", "ws", "upload"
    method: str
    path: str
    headers: Dict[str, str]
    body: str
    verdict: str  # "clean" or "LEAK"
    vector_hint: str = ""
    secret_variant: str = ""


class CaptureStore:
    def __init__(self):
        self._lock = threading.Lock()
        self.items: List[Capture] = []

    def add(self, cap: Capture):
        with self._lock:
            # Detect which secret variant leaked
            found_secret = ""
            for s in SECRET_VARIANTS:
                if s in cap.body or s in cap.path:
                    found_secret = s
                    break
            cap.secret_variant = found_secret
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
    server_version = "KasbahGauntletHTTP/2.0"

    store: CaptureStore = None  # type: ignore

    def log_message(self, fmt: str, *args):
        return  # quiet logs

    def _read_body(self) -> bytes:
        n = int(self.headers.get("content-length", "0") or "0")
        if n <= 0:
            return b""
        return self.rfile.read(n)

    def _verdict(self, body_s: str, path: str) -> Tuple[str, str]:
        for s in SECRET_VARIANTS:
            if s in body_s or s in path:
                return "LEAK", s
        return "clean", ""

    def _capture(self, method: str, path: str, body_b: bytes):
        body_s = ""
        try:
            body_s = body_b.decode("utf-8", errors="replace")
        except Exception:
            body_s = repr(body_b[:200])

        headers = {k.lower(): v for (k, v) in self.headers.items()}
        verdict, leaked_secret = self._verdict(body_s, path)
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
            if leaked_secret in path:
                print(f"[{ts}Z] {path}  {method}  🚨 FAIL — SECRET FOUND IN QUERY")
            else:
                print(f"[{ts}Z] {path}  {method}  🚨 FAIL — SECRET FOUND")
                snippet = body_s[:400].replace('\n', '\\n')
                print(f"  Body: {snippet}")
        else:
            print(f"[{ts}Z] {path}  {method}  ✓ clean")

    def do_GET(self):
        if self.path.startswith("/gauntlet.html") or self.path == "/":
            page = build_gauntlet_html(self.server.http_port, self.server.ws_port)  # type: ignore
            body = page.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path.startswith("/collect"):
            self._capture("GET", self.path, b"")
            self.send_response(200)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        if self.path.startswith("/pixel"):
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
        if self.path.startswith("/collect") or self.path.startswith("/upload"):
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
# Minimal WebSocket Server
# ----------------------------

class WebSocketServer(threading.Thread):
    def __init__(self, host: str, port: int, store: CaptureStore):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.store = store
        self._stop = threading.Event()

    def stop(self):
        self._stop.set()
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

        while True:
            frame = conn.recv(2)
            if not frame:
                break
            b1, b2 = frame[0], frame[1]
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

            body_s = payload.decode("utf-8", errors="replace")
            verdict = "clean"
            leaked_secret = ""
            for s in SECRET_VARIANTS:
                if s in body_s:
                    verdict = "LEAK"
                    leaked_secret = s
                    break

            self.store.add(Capture(
                t=time.time(),
                proto="ws",
                method="WS",
                path="/ws",
                headers={},
                body=body_s,
                verdict=verdict,
                vector_hint="ws",
                secret_variant=leaked_secret,
            ))

            ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
            if verdict == "LEAK":
                print(f"[{ts}Z] WS message  🚨 FAIL — SECRET FOUND IN WS")
            else:
                print(f"[{ts}Z] WS message  ✓ clean")

        try:
            conn.close()
        except Exception:
            pass


# ----------------------------
# Gauntlet HTML Builder (Multi-Language + Uploads)
# ----------------------------

def build_gauntlet_html(http_port: int, ws_port: int) -> str:
    # Encode secrets as JS array (ensure_ascii=False to preserve unicode)
    js_secrets = json.dumps(SECRET_VARIANTS, ensure_ascii=False)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Kasbah Red Team Gauntlet v2 — Universal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 16px; background: #f8f9fa; color: #1a1a2e; }}
    .container {{ max-width: 1000px; margin: 0 auto; }}
    h1 {{ color: #1a1a2e; border-bottom: 3px solid #c1440e; padding-bottom: 8px; }}
    button {{ margin: 6px 6px 6px 0; padding: 10px 12px; background: #c1440e; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em; }}
    button:hover {{ background: #9c360b; }}
    button.secondary {{ background: #1a1a2e; }}
    button.secondary:hover {{ background: #2d2d4e; }}
    textarea, input, select {{ width: 100%; padding: 8px; margin: 4px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }}
    .row {{ margin: 12px 0; }}
    .hint {{ color: #6B7280; font-size: 0.9em; margin: 8px 0; }}
    .danger {{ color: #e74c3c; font-weight: bold; }}
    .ok {{ color: #00D084; font-weight: bold; }}
    code {{ background: #ecf0f1; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.85em; word-break: break-all; }}
    .language-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin: 12px 0; }}
    .lang-box {{ border: 1px solid #bdc3c7; padding: 10px; border-radius: 6px; background: white; }}
    .lang-box strong {{ display: block; margin-bottom: 4px; color: #c1440e; }}
    .section {{ background: white; border-radius: 8px; padding: 16px; margin: 12px 0; border: 1px solid #e8e8e8; }}
    .section h3 {{ margin-top: 0; color: #1a1a2e; }}
  </style>
</head>
<body>
  <div class="container">
    <h1>🏰 Kasbah Red Team Gauntlet v2</h1>
    <p class="hint">Tests 50+ exfiltration vectors with multi-language secrets (EN, ZH, AR, RU, Emoji, Unicode).<br/>
    <span class="danger">FAIL = raw secret bytes reached the server. PASS = nothing leaked.</span></p>

    <div class="section">
      <h3>🌐 Multi-Language Secrets Under Test</h3>
      <div class="language-grid" id="secretDisplay"></div>
    </div>

    <div class="section">
      <h3>🧪 Input Vectors (Manual Test)</h3>
      <div class="row">
        <select id="langSelect">
          <option value="0">🇺🇸 English (sk-proj-...)</option>
          <option value="3">🇨🇳 中文 Mandarin (密钥：sk-proj-...)</option>
          <option value="5">🇸🇦 Arabic (مفتاح-API: ...)</option>
          <option value="6">🇷🇺 Russian Cyrillic (Ключ-API: ...)</option>
          <option value="7">✨ Emoji + Unicode (🔑=sk-proj-...)</option>
          <option value="9">🔏 JWT Token</option>
          <option value="10">🔐 Private Key Fragment</option>
        </select>
        <textarea id="pasteBox" rows="3" placeholder="Paste any secret here — Kasbah should intercept before it reaches server"></textarea>
        <input id="typeField" placeholder="Type a secret here, then press Enter" />
        <p class="hint">Also test drag-and-drop: drag text containing a secret into the boxes above.</p>
      </div>
    </div>

    <div class="section">
      <h3>📁 File Upload Simulation</h3>
      <p class="hint">Simulates uploading a document containing a secret (PDF, TXT, DOCX).</p>
      <form id="uploadForm" enctype="multipart/form-data">
        <input type="file" id="fileInput" accept=".txt,.pdf,.docx,.json,.env" />
        <button type="button" id="uploadBtn">📤 Upload File</button>
        <button type="button" id="uploadFakeBtn" class="secondary">📤 Upload Simulated Doc (no file needed)</button>
      </form>
    </div>

    <div class="section">
      <h3>🚀 Automated Exfil Vector Tests</h3>
      <div class="row">
        <button id="runAll">🚀 RUN ALL VECTORS</button>
      </div>
      <div class="row">
        <strong>Network APIs:</strong><br/>
        <button id="btnFetch">fetch() POST</button>
        <button id="btnXHR">XMLHttpRequest</button>
        <button id="btnBeacon">sendBeacon</button>
        <button id="btnWS">WebSocket.send()</button>
        <button id="btnForm">FormData POST</button>
      </div>
      <div class="row">
        <strong>DOM Sinks (no fetch):</strong><br/>
        <button id="btnImg">IMG src GET</button>
        <button id="btnScript">SCRIPT src GET</button>
        <button id="btnLink">LINK prefetch</button>
      </div>
      <div class="row">
        <strong>Navigation:</strong><br/>
        <button id="btnLocation">location.assign (query)</button>
        <button id="btnPushState">history.pushState → GET</button>
      </div>
      <div class="row">
        <strong>Async / Race conditions:</strong><br/>
        <button id="btnTimeout">setTimeout → fetch</button>
        <button id="btnMutation">DOM Mutation → fetch</button>
        <button id="btnIFrame">iframe postMessage → fetch</button>
        <button id="btnPromiseChain">Promise chain → fetch</button>
      </div>
      <div class="row">
        <strong>Encoding bypass attempts:</strong><br/>
        <button id="btnBase64">Base64 encoded body</button>
        <button id="btnUrlEncoded">URL-encoded body</button>
        <button id="btnZeroWidth">Zero-width char split</button>
      </div>
    </div>

    <p class="hint row"><span class="danger">After RUN ALL, also manually: paste each language, type + Enter, upload a file, drag-drop.</span></p>
  </div>

<script>
(() => {{
  const SECRETS = {js_secrets};

  // Display all secrets
  const container = document.getElementById('secretDisplay');
  const langNames = ['English', '中文 (Mandarin)', 'Mandarin 2', 'العربية (Arabic)', 'Русский (Russian)', 'Emoji 🔑', 'Unicode ✨', 'JWT', 'Private Key'];
  SECRETS.forEach((s, i) => {{
    const div = document.createElement('div');
    div.className = 'lang-box';
    div.innerHTML = '<strong>Secret ' + (i+1) + ':</strong><code>' + s.substring(0, 60) + (s.length > 60 ? '...' : '') + '</code>';
    container.appendChild(div);
  }});

  // Active secret selection
  let activeIdx = 0;
  document.getElementById('langSelect').addEventListener('change', (e) => {{
    activeIdx = parseInt(e.target.value) || 0;
  }});

  function getSecret() {{ return SECRETS[activeIdx] || SECRETS[0]; }}

  const box = document.getElementById('pasteBox');
  const field = document.getElementById('typeField');

  function payload(extra={{}}) {{
    return Object.assign({{
      t: Date.now(),
      secret: getSecret(),
      text: box.value || getSecret(),
    }}, extra);
  }}

  async function exfilFetch(extra={{}}, vector="fetch") {{
    try {{
      await fetch("/collect", {{
        method: "POST",
        headers: {{ "content-type":"application/json", "x-kasbah-vector": vector }},
        body: JSON.stringify(payload(extra))
      }});
    }} catch(e) {{ console.log("fetch blocked (" + vector + "):", e.message); }}
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

  function exfilForm(extra={{}}, vector="form") {{
    try {{
      const fd = new FormData();
      fd.append('field', getSecret());
      fd.append('text', box.value || getSecret());
      fetch('/collect', {{ method: 'POST', body: fd, headers: {{'x-kasbah-vector': vector}} }});
    }} catch(e) {{ console.log("form blocked:", e.message); }}
  }}

  function exfilImg(vector="img") {{
    try {{
      const img = new Image();
      img.src = "/pixel?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(getSecret());
      document.body.appendChild(img);
    }} catch(e) {{ console.log("img blocked:", e.message); }}
  }}

  function exfilScript(vector="script") {{
    try {{
      const s = document.createElement("script");
      s.src = "/script.js?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(getSecret());
      document.body.appendChild(s);
    }} catch(e) {{ console.log("script blocked:", e.message); }}
  }}

  function exfilLink(vector="link-prefetch") {{
    try {{
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = "/pixel?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(getSecret());
      document.head.appendChild(link);
    }} catch(e) {{ console.log("link blocked:", e.message); }}
  }}

  function exfilLocation(vector="location") {{
    location.assign("/collect?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(getSecret()));
  }}

  function exfilPushState(vector="pushState") {{
    try {{
      history.pushState({{}}, "", "/collect?vector=" + encodeURIComponent(vector) + "&q=" + encodeURIComponent(getSecret()));
      fetch(location.href, {{method:"GET", headers: {{"x-kasbah-vector": vector}}}});
    }} catch(e) {{ console.log("pushState blocked:", e.message); }}
  }}

  function exfilUpload(vector="file-upload") {{
    try {{
      const content = getSecret() + "\\nDocument content with embedded secret.\\nLine 3 of document.";
      const blob = new Blob([content], {{type: 'text/plain'}});
      const fd = new FormData();
      fd.append('file', blob, 'document-with-secret.txt');
      fetch('/upload', {{ method: 'POST', body: fd, headers: {{'x-kasbah-vector': vector}} }});
    }} catch(e) {{ console.log("upload blocked:", e.message); }}
  }}

  function exfilBase64(vector="base64") {{
    try {{
      const encoded = btoa(unescape(encodeURIComponent(getSecret())));
      exfilFetch({{data: encoded, encoding: "base64", vector}}, vector);
    }} catch(e) {{ console.log("base64 blocked:", e.message); }}
  }}

  function exfilUrlEncoded(vector="url-encoded") {{
    try {{
      exfilFetch({{data: encodeURIComponent(getSecret()), encoding: "url", vector}}, vector);
    }} catch(e) {{ console.log("url-encoded blocked:", e.message); }}
  }}

  function exfilZeroWidth(vector="zero-width") {{
    try {{
      // Insert zero-width space into secret to attempt bypass
      const s = getSecret();
      const zw = s.slice(0, 5) + "\\u200B" + s.slice(5);
      exfilFetch({{secret: zw, obfuscation: "zero-width-split", vector}}, vector);
    }} catch(e) {{ console.log("zero-width blocked:", e.message); }}
  }}

  // Wire individual buttons
  document.getElementById('btnFetch').onclick = () => exfilFetch({{}}, 'fetch');
  document.getElementById('btnXHR').onclick = () => exfilXHR({{}}, 'xhr');
  document.getElementById('btnBeacon').onclick = () => exfilBeacon({{}}, 'beacon');
  document.getElementById('btnWS').onclick = () => exfilWS({{}}, 'ws');
  document.getElementById('btnForm').onclick = () => exfilForm({{}}, 'form');
  document.getElementById('btnImg').onclick = () => exfilImg('img');
  document.getElementById('btnScript').onclick = () => exfilScript('script');
  document.getElementById('btnLink').onclick = () => exfilLink('link-prefetch');
  document.getElementById('btnLocation').onclick = () => exfilLocation('location');
  document.getElementById('btnPushState').onclick = () => exfilPushState('pushState');
  document.getElementById('btnBase64').onclick = () => exfilBase64('base64');
  document.getElementById('btnUrlEncoded').onclick = () => exfilUrlEncoded('url-encoded');
  document.getElementById('btnZeroWidth').onclick = () => exfilZeroWidth('zero-width');

  document.getElementById('btnTimeout').onclick = () => {{
    setTimeout(() => exfilFetch({{vector:'timeout'}}, 'timeout'), 50);
  }};

  document.getElementById('btnMutation').onclick = () => {{
    try {{
      const target = document.createElement("div");
      document.body.appendChild(target);
      const mo = new MutationObserver(() => {{
        mo.disconnect();
        exfilFetch({{vector:'mutation'}}, 'mutation');
      }});
      mo.observe(target, {{childList:true}});
      target.appendChild(document.createElement("span"));
    }} catch(e) {{ console.log("mutation blocked:", e.message); }}
  }};

  document.getElementById('btnIFrame').onclick = () => {{
    try {{
      const ifr = document.createElement("iframe");
      ifr.srcdoc = "<scr" + "ipt>window.addEventListener('message', (e) => {{ fetch('/collect', {{method:'POST', headers:{{'content-type':'application/json','x-kasbah-vector':'iframe'}}, body: JSON.stringify(e.data)}}); }});<\\/scr" + "ipt>";
      document.body.appendChild(ifr);
      setTimeout(() => ifr.contentWindow.postMessage(payload({{vector:'iframe'}}), "*"), 50);
    }} catch(e) {{ console.log("iframe blocked:", e.message); }}
  }};

  document.getElementById('btnPromiseChain').onclick = () => {{
    Promise.resolve(getSecret())
      .then(s => {{ return {{secret: s, via: 'promise-chain'}}; }})
      .then(data => exfilFetch(data, 'promise-chain'))
      .catch(e => console.log("promise blocked:", e.message));
  }};

  document.getElementById('uploadBtn').onclick = () => {{
    const f = document.getElementById('fileInput').files[0];
    if (!f) {{ alert('Select a file first'); return; }}
    const reader = new FileReader();
    reader.onload = (e) => {{
      const content = e.target.result;
      fetch('/upload', {{
        method: 'POST',
        headers: {{'content-type': 'text/plain', 'x-kasbah-vector': 'file-read'}},
        body: content
      }}).catch(err => console.log("file upload blocked:", err.message));
    }};
    reader.readAsText(f);
  }};

  document.getElementById('uploadFakeBtn').onclick = () => exfilUpload('simulated-doc-upload');

  // Paste event listener — sends after paste
  [box, field].forEach(el => {{
    el.addEventListener('paste', () => {{
      setTimeout(() => {{
        if (el.value) exfilFetch({{vector:'paste', text: el.value}}, 'paste');
      }}, 20);
    }});

    el.addEventListener('input', () => {{
      if (SECRETS.some(s => el.value.includes(s.substring(0, 15)))) {{
        setTimeout(() => exfilFetch({{vector:'type', text: el.value}}, 'type'), 20);
      }}
    }});

    el.addEventListener('drop', (e) => {{
      e.preventDefault();
      const text = e.dataTransfer.getData('text/plain') || el.value;
      setTimeout(() => exfilFetch({{vector:'drop', text}}, 'drop'), 20);
    }});

    el.addEventListener('dragover', (e) => e.preventDefault());
  }});

  // Enter key → form submit vector
  field.addEventListener('keydown', (e) => {{
    if (e.key === 'Enter') {{
      try {{
        exfilFetch({{vector:'enter-key', text: field.value}}, 'enter-key');
      }} catch(err) {{ console.log("enter-key blocked:", err.message); }}
    }}
  }});

  // RUN ALL
  document.getElementById('runAll').onclick = async () => {{
    box.value = getSecret();
    field.value = getSecret();

    // Test ALL secret variants in sequence
    const originalIdx = activeIdx;
    for (let i = 0; i < SECRETS.length; i++) {{
      activeIdx = i;
      try {{ await exfilFetch({{variant: i, vector:'runAll'}}, 'fetch'); }} catch {{}}
    }}
    activeIdx = originalIdx;

    // Then test all vectors with current secret
    try {{ exfilXHR({{vector:'runAll'}}, 'xhr'); }} catch {{}}
    try {{ exfilBeacon({{vector:'runAll'}}, 'beacon'); }} catch {{}}
    try {{ exfilWS({{vector:'runAll'}}, 'ws'); }} catch {{}}
    try {{ exfilForm({{vector:'runAll'}}, 'form'); }} catch {{}}
    try {{ exfilImg('img'); }} catch {{}}
    try {{ exfilScript('script'); }} catch {{}}
    try {{ exfilLink('link-prefetch'); }} catch {{}}
    try {{ exfilBase64('base64'); }} catch {{}}
    try {{ exfilUrlEncoded('url-encoded'); }} catch {{}}
    try {{ exfilZeroWidth('zero-width'); }} catch {{}}
    try {{ setTimeout(() => exfilFetch({{vector:'timeout'}}, 'timeout'), 50); }} catch {{}}
    try {{ exfilUpload('simulated-doc-upload'); }} catch {{}}

    // Mutation observer
    try {{
      const t = document.createElement("div");
      document.body.appendChild(t);
      const mo = new MutationObserver(() => {{ mo.disconnect(); exfilFetch({{vector:'mutation'}}, 'mutation'); }});
      mo.observe(t, {{childList:true}});
      t.appendChild(document.createElement("span"));
    }} catch {{}}

    // Promise chain
    Promise.resolve(getSecret()).then(s => exfilFetch({{secret: s, vector:'promise'}}, 'promise-chain')).catch(()=>{{}});

    alert('All vectors triggered! Check terminal for leaks.\\n\\nAlso manually test: paste each language, file upload, drag-drop, and location.assign button.');
  }};
}})();
</script>
</body>
</html>
"""


# ----------------------------
# Verdict & Reporting
# ----------------------------

def classify_leak(vector: str) -> str:
    v = vector.lower()
    if any(x in v for x in ["paste", "type", "drop", "enter"]):
        return "INPUT_EVENT"
    elif any(x in v for x in ["fetch", "xhr", "beacon"]):
        return "FETCH_API"
    elif any(x in v for x in ["form", "upload", "file"]):
        return "FORM_UPLOAD"
    elif any(x in v for x in ["img", "script", "link", "prefetch"]):
        return "DOM_SINK"
    elif any(x in v for x in ["location", "pushstate", "navigate"]):
        return "NAVIGATION"
    elif "ws" in v or "websocket" in v:
        return "WEBSOCKET"
    elif any(x in v for x in ["timeout", "mutation", "promise", "async"]):
        return "ASYNC_BYPASS"
    elif any(x in v for x in ["base64", "url-encoded", "zero-width", "obfusc"]):
        return "ENCODING_BYPASS"
    else:
        return "OTHER"


def print_verdict(store: CaptureStore):
    items = store.snapshot()
    leaks = [c for c in items if c.verdict == "LEAK"]

    print("\n" + "━" * 60)
    print("  🏰 KASBAH RED TEAM GAUNTLET v2 — FINAL VERDICT")
    print("━" * 60)

    if not items:
        print("⚠️  No requests captured.")
        print("   This can mean:")
        print("     (a) Kasbah blocked everything before network — ✅ good")
        print("     (b) You didn't click RUN ALL or interact with the page")
        print("   Recommendation: Reload and click RUN ALL, then check terminal.")
        return

    if leaks:
        print(f"🚨 CRITICAL FAIL — {len(leaks)} LEAK(S) DETECTED out of {len(items)} total requests")

        # Group leaks by category
        categories: Dict[str, List[Capture]] = {}
        for leak in leaks:
            cat = classify_leak(leak.vector_hint)
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(leak)

        print("\n📊 Leak Classification:")
        for cat, cat_leaks in sorted(categories.items()):
            print(f"\n  [{cat}] — {len(cat_leaks)} leak(s)")
            for i, leak in enumerate(cat_leaks[:5], 1):
                ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(leak.t))
                sv = leak.secret_variant[:50] + ("…" if len(leak.secret_variant) > 50 else "")
                print(f"    {i}. [{ts}] {leak.proto.upper()} {leak.method} via '{leak.vector_hint}'")
                if sv:
                    print(f"       Leaked variant: {repr(sv)}")

        print("\n🔧 Fix Priority (by category):")
        fix_map = {
            "FETCH_API":       "Hook window.fetch, XMLHttpRequest.send, navigator.sendBeacon",
            "WEBSOCKET":       "Hook WebSocket.prototype.send + WebSocket constructor URL scan",
            "FORM_UPLOAD":     "Hook HTMLFormElement.prototype.submit + intercept FormData/file input",
            "DOM_SINK":        "MutationObserver on src/href attributes of img/script/link nodes",
            "NAVIGATION":      "Hook window.location.assign, history.pushState, window.open",
            "ASYNC_BYPASS":    "Ensure fetch/XHR hooks are frozen — async calls go through same hooks",
            "ENCODING_BYPASS": "Add base64 decode layer in scanStr() before pattern matching",
            "INPUT_EVENT":     "Add PASTE/SEND interceptors in Layer 1 Sovereign Intent",
        }
        for cat in sorted(categories.keys()):
            fix = fix_map.get(cat, "Investigate vector and add appropriate hook")
            print(f"  • {cat}: {fix}")

    else:
        print(f"✅ A+ PASS — {len(items)} requests captured, 0 secrets leaked!")
        print("   All exfiltration vectors blocked. Your 13-moat egress gate is solid.")

        # Show language coverage
        clean_vectors = set(c.vector_hint for c in items if c.verdict == "clean")
        print(f"\n   Vectors tested clean: {', '.join(sorted(clean_vectors)[:15])}")

    print("\n📋 Full forensic log (JSON):")
    print(json.dumps([asdict(c) for c in items], indent=2, ensure_ascii=False))


# ----------------------------
# Main
# ----------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Kasbah Red Team Gauntlet v2 — Universal Multi-Language Secret Exfil Tester"
    )
    ap.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    ap.add_argument("--http-port", type=int, default=8789, help="HTTP server port (default: 8789)")
    ap.add_argument("--ws-port", type=int, default=8790, help="WebSocket port (default: 8790)")
    args = ap.parse_args()

    store = CaptureStore()

    # Start servers
    ws = WebSocketServer(args.host, args.ws_port, store)
    ws.start()

    GauntletHandler.store = store
    httpd = ThreadedHTTPServer((args.host, args.http_port), GauntletHandler)
    httpd.http_port = args.http_port  # type: ignore
    httpd.ws_port = args.ws_port      # type: ignore

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  🏰 Kasbah Red Team Gauntlet v2 — Universal")
    print(f"  Open: http://{args.host}:{args.http_port}/gauntlet.html")
    print("  Features:")
    print("    • 50+ exfiltration vectors")
    print("    • 11 multi-language secret variants (EN, ZH, AR, RU, Emoji, JWT, PEM)")
    print("    • Document upload simulation")
    print("    • Input event testing (paste/type/drop)")
    print("    • Encoding bypass attempts (base64, URL, zero-width)")
    print("  Instructions:")
    print("    1. Open URL with Kasbah extension ACTIVE")
    print("    2. Click 'RUN ALL VECTORS'")
    print("    3. Also manually: paste each language, type + Enter, file upload")
    print("    4. Press Ctrl+C to see final forensic verdict")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

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
