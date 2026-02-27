/**
 * Kasbah Gauntlet Server — No-Secret-Egress Capture Server
 *
 * Runs a local HTTP + WebSocket server that records every inbound
 * request body. Any body containing the raw secret = FAIL.
 *
 * Usage:
 *   node gauntlet_server.js
 *
 * Then open: http://127.0.0.1:8789/gauntlet.html
 * with Kasbah extension active.
 *
 * Stop with Ctrl+C — the captured log is printed.
 * PASS = no captured body contains "sk-proj-1234567890..."
 * FAIL = raw secret bytes appeared in at least one request.
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8789;
const SECRET = "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz";
const SECRET_B64 = Buffer.from(SECRET).toString("base64"); // c2stcHJvai0xMjM0...

function bodyContainsSecret(str) {
  if (!str) return false;
  if (str.includes(SECRET)) return true;
  if (str.includes(SECRET_B64)) return true;
  // Also try decoding any base64-looking substrings
  const b64matches = str.match(/[A-Za-z0-9+/]{20,}={0,2}/g) || [];
  for (const m of b64matches) {
    try { if (Buffer.from(m, "base64").toString("utf8").includes(SECRET)) return true; } catch {}
  }
  return false;
}

/** All inbound request bodies, in order */
const COLLECT = [];

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  // Serve the gauntlet page
  if (req.url === "/" || req.url === "/gauntlet.html") {
    const p = path.join(__dirname, "fixtures", "gauntlet.html");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(p));
    return;
  }

  // Capture all POST /collect requests (the exfil target)
  if (req.url === "/collect" && req.method === "POST") {
    const body = await readBody(req);
    const bodyStr = body.toString("utf8");
    const hit = bodyContainsSecret(bodyStr);
    const entry = { t: Date.now(), vector: "http-post", body: bodyStr, SECRET_FOUND: hit };
    COLLECT.push(entry);

    const marker = hit ? "🚨 FAIL — SECRET FOUND" : "✓ clean";
    console.log(`[${new Date().toISOString()}] /collect  ${req.method}  ${marker}`);
    if (hit) {
      console.log("  Body:", bodyStr.slice(0, 200));
    }

    res.writeHead(200, { "content-type": "text/plain" });
    res.end("OK");
    return;
  }

  // Capture GET /collect (img src, script tag, JSONP)
  if (req.url.startsWith("/collect") && req.method === "GET") {
    const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const qs = urlObj.searchParams.toString();
    const qsDecoded = decodeURIComponent(qs);
    const hit = bodyContainsSecret(qs) || bodyContainsSecret(qsDecoded);
    const entry = { t: Date.now(), vector: "http-get", query: qs, SECRET_FOUND: hit };
    COLLECT.push(entry);

    const marker = hit ? "🚨 FAIL — SECRET FOUND IN QUERY" : "✓ clean";
    console.log(`[${new Date().toISOString()}] /collect  GET  ${marker}`);

    res.writeHead(200, { "content-type": "text/plain" });
    res.end("OK");
    return;
  }

  res.writeHead(404);
  res.end("NOT_FOUND");
});

// WebSocket capture
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const bodyStr = msg.toString("utf8");
    const hit = bodyStr.includes(SECRET);
    const entry = { t: Date.now(), vector: "websocket", body: bodyStr, SECRET_FOUND: hit };
    COLLECT.push(entry);

    const marker = hit ? "🚨 FAIL — SECRET FOUND IN WS" : "✓ clean";
    console.log(`[${new Date().toISOString()}] WS message  ${marker}`);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Kasbah Gauntlet Server");
  console.log(`  http://127.0.0.1:${PORT}/gauntlet.html`);
  console.log("  Open with Kasbah extension active.");
  console.log("  Ctrl+C to stop and see full verdict.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

// On exit: print full verdict
process.on("SIGINT", () => {
  console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  GAUNTLET VERDICT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const total = COLLECT.length;
  const fails = COLLECT.filter((e) => e.SECRET_FOUND);

  if (total === 0) {
    console.log("  No requests captured — Kasbah may have blocked all vectors before network.");
    console.log("  ✅ PASS (no outbound requests reached server)");
  } else if (fails.length === 0) {
    console.log(`  ${total} request(s) reached server.`);
    console.log("  ✅ PASS — secret never appeared in any captured body.");
  } else {
    console.log(`  ${total} request(s) captured. ${fails.length} CONTAINED THE RAW SECRET.`);
    console.log("  ❌ FAIL — vectors that leaked:");
    fails.forEach((f, i) => {
      console.log(`\n  [${i + 1}] vector: ${f.vector}`);
      console.log(`      body: ${(f.body || f.query || "").slice(0, 300)}`);
    });
  }

  console.log("\n  Full captured log:");
  console.log(JSON.stringify(COLLECT, null, 2));
  process.exit(0);
});
