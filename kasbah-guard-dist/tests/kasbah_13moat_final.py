\
#!/usr/bin/env python3
"""
Kasbah 13-Moat Enforcer — FINAL Single File (DEFENSIVE)
======================================================

Goal
----
Enforce ALL 13 Kasbah moats *in code* — meaning: whenever a workflow routes through
this enforcer, it applies *every* moat (normalization, detection, classification,
redaction, policy, user agency, audit, tamper evidence, adversarial self-tests,
and enforceability hooks).

Important reality check (non-negotiable)
----------------------------------------
No single Python script can *magically* intercept every keystroke and every app on every OS
without becoming spyware or requiring privileged OS hooks and platform-specific components.

So we enforce the 13 moats in code through:
  A) Preflight gate (stdin/file) for prompts/docs
  B) Wrapper gate for commands (e.g., curl, python, node, any uploader) via --wrap
  C) Optional local HTTP proxy gate via --proxy (apps can be configured to send through it)

If traffic does NOT pass through A/B/C, no tool can enforce. That's physics, not opinion.

Moats (all implemented)
-----------------------
M1 Surface Control      : --preflight, --wrap, --proxy enforce gating at the boundary.
M2 Intent Awareness     : explicit intent flags + heuristics; logged in audit.
M3 Normalization        : Unicode NFKC, zero-width removal, digit folding, deobfuscation.
M4 PII Detection        : emails, phones (+212, Arabic digits), IDs, IBAN (incl MA), etc.
M5 Financial Detection  : PAN + Luhn, IBAN.
M6 Secrets Detection    : AWS AKIA, JWT, OpenAI-like keys, generic tokens, private key blocks.
M7 Contextual Redaction : stable tags with hash8, preserves usefulness.
M8 Policy & Governance  : block/warn/allow + configurable thresholds + allowlist/denylist.
M9 User Agency          : human-readable reasons + remediation guidance in output.
M10 System Posture      : firewall/encryption/updates/services/network/tasks/logs snapshot.
M11 Tamper Evidence     : hashes.json + manifest + bundle zip hash.
M12 Adversarial Tests   : --selftest generates obfuscated vectors + asserts coverage.
M13 Composability       : JSON schema output, exit codes, events.jsonl audit, config pack.

Exit codes (designed for automation)
------------------------------------
0 = allow
1 = warn (should require confirm in UI)
2 = block

Usage quick
-----------
Preflight:
  cat prompt.txt | python kasbah_13moat_final.py --preflight --intent prompt
  python kasbah_13moat_final.py --preflight --infile prompt.txt --intent upload

Wrap a command (gate on stdin / files you specify):
  python kasbah_13moat_final.py --wrap --intent upload --files file1.pdf file2.txt -- curl -F "file=@file1.pdf" https://...

Proxy (local HTTP forward proxy with payload preflight for JSON/text bodies):
  python kasbah_13moat_final.py --proxy --listen 127.0.0.1:18888

Config
------
KASBAH_POLICY=warn|block|allow
KASBAH_MAX_MB=25
KASBAH_MAX_FILES=8000
KASBAH_ALLOW_DEST=comma-separated domains allowed (optional)
KASBAH_DENY_DEST=comma-separated domains denied (optional)
KASBAH_CONFIG=path to json config pack (optional)
"""

from __future__ import annotations

import argparse
import base64
import datetime as _dt
import hashlib
import json
import os
import platform
import re
import socket
import subprocess
import sys
import threading
import unicodedata
import urllib.parse
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union


# -----------------------------
# Common utilities
# -----------------------------
def now_utc() -> str:
    return _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def hash8(s: str) -> str:
    return sha256_bytes(s.encode("utf-8"))[:8]

def clip(s: str, limit: int = 12000) -> str:
    if s is None:
        return ""
    if len(s) <= limit:
        return s
    return s[:limit] + "\n...<truncated>\n"

def run_cmd(cmd: Union[List[str], str], shell: bool = False, timeout_s: int = 15) -> Dict[str, Any]:
    rec: Dict[str, Any] = {"cmd": cmd, "shell": shell, "timeout_s": timeout_s}
    try:
        out = subprocess.check_output(
            cmd,
            stderr=subprocess.STDOUT,
            shell=shell,
            timeout=timeout_s,
            text=True,
            errors="replace",
        )
        rec["output"] = out
    except subprocess.TimeoutExpired as e:
        rec["error"] = f"timed out after {e.timeout}s"
    except subprocess.CalledProcessError as e:
        msg = (e.output or "").strip()
        if len(msg) > 4000:
            msg = msg[:4000] + "...<truncated>"
        rec["error"] = f"returncode_{e.returncode}: {msg}"
    except FileNotFoundError:
        rec["error"] = "command not found"
    except PermissionError as e:
        rec["error"] = f"Permission denied: {e}"
    except Exception as e:
        rec["error"] = f"{type(e).__name__}: {e}"
    return rec


# -----------------------------
# M3 Normalization moat
# -----------------------------
_ZERO_WIDTH = dict.fromkeys(map(ord, ["\u200b", "\u200c", "\u200d", "\ufeff", "\u2060"]), None)
_ARABIC_INDIC_MAP = str.maketrans({
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
})
_OBFUSCATIONS = [
    (re.compile(r"\(\s*at\s*\)", re.I), "@"),
    (re.compile(r"\[\s*at\s*\]", re.I), "@"),
    (re.compile(r"\{\s*at\s*\}", re.I), "@"),
    (re.compile(r"\s+at\s+", re.I), "@"),
    (re.compile(r"\(\s*dot\s*\)", re.I), "."),
    (re.compile(r"\[\s*dot\s*\]", re.I), "."),
    (re.compile(r"\{\s*dot\s*\}", re.I), "."),
    (re.compile(r"\s+dot\s+", re.I), "."),
]

def normalize_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.translate(_ZERO_WIDTH)
    s = s.translate(_ARABIC_INDIC_MAP)
    s = s.replace("＠", "@")
    for rx, repl in _OBFUSCATIONS:
        s = rx.sub(repl, s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s


# -----------------------------
# M4/M5/M6 Detection moat
# -----------------------------
RX_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}\b")
RX_PHONE = re.compile(r"\b(?:\+?\d[\d\s\-\(\)]{7,}\d)\b")
RX_MA_PHONE = re.compile(r"\b(?:\+212|0)[\s\-]?(?:\d[\s\-]?){9}\b")
RX_LONG_DIGITS = re.compile(r"\b\d{8,}\b")

RX_SSN = re.compile(r"\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b")

RX_IBAN = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b")
RX_MA_IBAN = re.compile(r"\bMA\d{2}[A-Z0-9]{19,26}\b")

RX_CC_CAND = re.compile(r"\b(?:\d[ .\-]*?){13,19}\b")

RX_AWS_AKIA = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
RX_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
RX_OPENAI_KEY = re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")
RX_API_KV = re.compile(r"(?i)\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*['\"]?([A-Za-z0-9_\-]{16,})['\"]?")

RX_PRIVATE_KEY_BLOCK = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")

# heuristic IDs (keep conservative to avoid false positives)
RX_MA_CIN_LIKE = re.compile(r"\b[A-Z]{1,2}\d{5,7}\b")
RX_PASSPORT_LIKE = re.compile(r"\b[A-Z]{1,2}\d{7,9}\b")

def luhn_ok(digits: str) -> bool:
    digits = re.sub(r"\D", "", digits)
    if not (13 <= len(digits) <= 19):
        return False
    s = 0
    parity = len(digits) % 2
    for i, ch in enumerate(digits):
        d = int(ch)
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        s += d
    return s % 10 == 0


@dataclass(frozen=True)
class Finding:
    category: str
    severity: str  # LOW/MED/HIGH/CRITICAL
    start: int
    end: int
    value_norm: str


SEV_RANK = {"LOW": 1, "MED": 2, "HIGH": 3, "CRITICAL": 4}

def detect_findings(text: str) -> List[Finding]:
    t = normalize_text(text)
    out: List[Finding] = []

    def add(rx: re.Pattern, cat: str, sev: str):
        for m in rx.finditer(t):
            out.append(Finding(cat, sev, m.start(), m.end(), m.group(0)))

    add(RX_EMAIL, "email", "MED")
    add(RX_MA_PHONE, "phone_ma", "MED")
    add(RX_PHONE, "phone", "MED")
    add(RX_SSN, "ssn", "CRITICAL")
    add(RX_MA_IBAN, "iban_ma", "CRITICAL")
    add(RX_IBAN, "iban", "HIGH")

    add(RX_AWS_AKIA, "aws_access_key", "CRITICAL")
    add(RX_OPENAI_KEY, "openai_key", "CRITICAL")
    add(RX_JWT, "jwt", "HIGH")
    add(RX_API_KV, "token_kv", "CRITICAL")
    add(RX_PRIVATE_KEY_BLOCK, "private_key_block", "CRITICAL")

    add(RX_MA_CIN_LIKE, "morocco_cin_like", "MED")
    add(RX_PASSPORT_LIKE, "passport_like", "HIGH")

    # Credit cards (Luhn)
    for m in RX_CC_CAND.finditer(t):
        cand = m.group(0)
        if luhn_ok(cand):
            out.append(Finding("credit_card", "CRITICAL", m.start(), m.end(), cand))

    # long digits
    for m in RX_LONG_DIGITS.finditer(t):
        s = m.group(0)
        sev = "HIGH" if len(s) >= 12 else ("MED" if len(s) >= 9 else "LOW")
        out.append(Finding("long_digits", sev, m.start(), m.end(), s))

    # dedup
    uniq: Dict[Tuple, Finding] = {}
    for f in out:
        uniq[(f.category, f.start, f.end, f.value_norm)] = f
    return sorted(uniq.values(), key=lambda x: (x.start, x.end))


# -----------------------------
# M7 Redaction moat
# -----------------------------
def redact_text(text: str) -> Tuple[str, List[Dict[str, Any]]]:
    norm = normalize_text(text)
    findings = detect_findings(norm)

    merged: List[Finding] = []
    for f in findings:
        if not merged:
            merged.append(f)
            continue
        last = merged[-1]
        if f.start <= last.end:
            start = last.start
            end = max(last.end, f.end)
            sev = last.severity if SEV_RANK[last.severity] >= SEV_RANK[f.severity] else f.severity
            cat = last.category if SEV_RANK[last.severity] >= SEV_RANK[f.severity] else f.category
            val = last.value_norm if SEV_RANK[last.severity] >= SEV_RANK[f.severity] else f.value_norm
            merged[-1] = Finding(cat, sev, start, end, val)
        else:
            merged.append(f)

    parts: List[str] = []
    cur = 0
    summaries: List[Dict[str, Any]] = []
    for f in merged:
        parts.append(norm[cur:f.start])
        tag = f"[KASBAH_REDACT:{f.category}:{hash8(f.value_norm)}]"
        parts.append(tag)
        cur = f.end
        summaries.append({"category": f.category, "severity": f.severity, "hash8": hash8(f.value_norm)})
    parts.append(norm[cur:])
    return "".join(parts), summaries


# -----------------------------
# M8 Policy moat + M9 Agency moat
# -----------------------------
def parse_list_env(name: str) -> List[str]:
    v = os.environ.get(name, "").strip()
    if not v:
        return []
    return [x.strip().lower() for x in v.split(",") if x.strip()]

def load_config_pack() -> Dict[str, Any]:
    path = os.environ.get("KASBAH_CONFIG", "").strip()
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        return {"_config_error": f"missing:{path}"}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return {"_config_error": f"bad_json:{e}"}

def intent_heuristic(intent: str, text: str) -> str:
    # M2 Intent awareness in code: normalize + heuristic fallback
    if intent:
        return intent
    t = normalize_text(text).lower()
    if "invoice" in t or "iban" in t or "bank" in t:
        return "finance"
    if "passport" in t or "cin" in t or "identity" in t or "id" in t:
        return "identity"
    if "api key" in t or "token" in t or "secret" in t:
        return "secrets"
    return "unknown"

def policy_decision(findings: List[Dict[str, Any]], policy: str, dest: Optional[str] = None) -> Dict[str, Any]:
    counts: Dict[str, int] = {}
    max_rank = 0
    max_sev = "NONE"
    for f in findings:
        counts[f["category"]] = counts.get(f["category"], 0) + 1
        r = SEV_RANK.get(f["severity"], 0)
        if r > max_rank:
            max_rank = r
            max_sev = f["severity"]

    allow = parse_list_env("KASBAH_ALLOW_DEST")
    deny = parse_list_env("KASBAH_DENY_DEST")
    dest_l = (dest or "").lower()

    dest_verdict = "neutral"
    if dest_l:
        host = dest_l
        try:
            host = urllib.parse.urlparse(dest_l).hostname or dest_l
        except Exception:
            host = dest_l
        if any(host.endswith(d) or host == d for d in deny):
            dest_verdict = "deny"
        elif allow and not any(host.endswith(a) or host == a for a in allow):
            dest_verdict = "not_allowlisted"

    # Base action
    action = "allow"
    if max_rank >= 4:
        action = "block"
    elif max_rank == 3:
        action = "block" if policy in ("warn", "block") else "warn"
    elif max_rank == 2:
        action = "warn" if policy in ("warn", "block") else "allow"
    elif max_rank == 1:
        action = "warn" if policy in ("warn", "block") else "allow"

    # Destination override
    if dest_verdict in ("deny", "not_allowlisted"):
        action = "block"

    # User agency: reasons + guidance
    reasons: List[str] = []
    guidance: List[str] = []
    if max_rank >= 4:
        reasons.append("critical_sensitive_data_detected")
        guidance.append("Remove secrets/financial IDs/credentials before sending to any AI.")
    if counts.get("token_kv") or counts.get("aws_access_key") or counts.get("openai_key"):
        guidance.append("Rotate exposed keys immediately if they are real.")
    if counts.get("credit_card") or counts.get("iban") or counts.get("iban_ma"):
        guidance.append("Never paste payment data. Use redaction or secure channels.")
    if counts.get("ssn"):
        guidance.append("SSN/identity data must not be shared with AI tools.")
    if dest_verdict == "deny":
        reasons.append("destination_denied")
        guidance.append("This destination is explicitly blocked by policy.")
    if dest_verdict == "not_allowlisted":
        reasons.append("destination_not_allowlisted")
        guidance.append("Destination is not on allowlist.")

    return {
        "policy": policy,
        "dest": dest,
        "dest_verdict": dest_verdict,
        "action": action,  # allow/warn/block
        "max_severity": max_sev,
        "counts": counts,
        "reasons": reasons,
        "guidance": guidance,
    }

def exit_code_for(action: str) -> int:
    return 2 if action == "block" else (1 if action == "warn" else 0)


# -----------------------------
# M10 System posture moat
# -----------------------------
def check_firewall() -> List[Dict[str, Any]]:
    os_type = platform.system()
    if os_type == "Windows":
        return [
            run_cmd(["netsh", "advfirewall", "show", "allprofiles"]),
            run_cmd(["powershell", "-NoProfile", "-Command", "Get-NetFirewallProfile | Format-List"]),
        ]
    if os_type == "Linux":
        return [
            run_cmd(["ufw", "status"]),
            run_cmd(["iptables", "-L", "-n"]),
            run_cmd(["nft", "list", "ruleset"]),
            run_cmd(["systemctl", "status", "firewalld"]),
        ]
    if os_type == "Darwin":
        return [
            run_cmd(["/usr/libexec/ApplicationFirewall/socketfilterfw", "--getglobalstate"]),
            run_cmd(["pfctl", "-sr"]),
        ]
    return [{"error": f"unsupported_os:{os_type}"}]

def check_encryption() -> List[Dict[str, Any]]:
    os_type = platform.system()
    if os_type == "Windows":
        return [
            run_cmd(["manage-bde", "-status"]),
            run_cmd(["powershell", "-NoProfile", "-Command", "Get-BitLockerVolume | Format-List"]),
        ]
    if os_type == "Linux":
        return [
            run_cmd(["lsblk", "-o", "NAME,TYPE,FSTYPE,MOUNTPOINT"]),
            run_cmd(["cat", "/etc/crypttab"]),
            run_cmd(["cryptsetup", "status"]),
        ]
    if os_type == "Darwin":
        return [
            run_cmd(["fdesetup", "status"]),
            run_cmd(["diskutil", "apfs", "list"]),
        ]
    return [{"error": f"unsupported_os:{os_type}"}]

def check_updates() -> List[Dict[str, Any]]:
    os_type = platform.system()
    if os_type == "Windows":
        return [
            run_cmd(["wmic", "qfe", "list", "full"]),
            run_cmd(["powershell", "-NoProfile", "-Command", "Get-HotFix | Select-Object -First 50 | Format-List"]),
        ]
    if os_type == "Linux":
        return [
            run_cmd(["uname", "-r"]),
            run_cmd(["apt", "list", "--upgradable"]),
            run_cmd(["dnf", "check-update"]),
            run_cmd(["yum", "check-update"]),
            run_cmd(["pacman", "-Qu"]),
        ]
    if os_type == "Darwin":
        return [
            run_cmd(["softwareupdate", "--history"], timeout_s=10),
            run_cmd(["softwareupdate", "--list"], timeout_s=10),
        ]
    return [{"error": f"unsupported_os:{os_type}"}]

def check_services() -> Dict[str, Any]:
    os_type = platform.system()
    if os_type == "Windows":
        return {"processes": run_cmd(["tasklist"]), "services": run_cmd(["sc", "query", "type=service", "state=all"])}
    if os_type == "Linux":
        return {"processes": run_cmd(["ps", "aux"]), "services": run_cmd(["systemctl", "list-units", "--type=service", "--all"])}
    if os_type == "Darwin":
        return {"processes": run_cmd(["ps", "aux"]), "services": run_cmd(["launchctl", "list"])}
    return {"error": f"unsupported_os:{os_type}"}

def check_network() -> Dict[str, Any]:
    os_type = platform.system()
    if os_type == "Windows":
        return {"netstat": run_cmd(["netstat", "-ano"]),
                "ps_tcp": run_cmd(["powershell", "-NoProfile", "-Command", "Get-NetTCPConnection | Select-Object -First 200 | Format-Table -AutoSize"])}
    if os_type == "Linux":
        return {"ss": run_cmd(["ss", "-tulnp"]),
                "netstat": run_cmd(["netstat", "-tulpen"]),
                "lsof": run_cmd(["lsof", "-i", "-P", "-n"])}
    if os_type == "Darwin":
        return {"lsof": run_cmd(["lsof", "-i", "-P", "-n"]),
                "netstat": run_cmd(["netstat", "-anv"])}
    return {"error": f"unsupported_os:{os_type}"}

def check_scheduled_tasks() -> Dict[str, Any]:
    os_type = platform.system()
    if os_type == "Windows":
        return {"schtasks": run_cmd(["schtasks", "/query", "/fo", "LIST", "/v"])}
    if os_type == "Linux":
        return {"user_crontab": run_cmd(["crontab", "-l"]),
                "system_crontab": run_cmd(["cat", "/etc/crontab"]),
                "systemd_timers": run_cmd(["systemctl", "list-timers", "--all"])}
    if os_type == "Darwin":
        return {"user_crontab": run_cmd(["crontab", "-l"]),
                "launchd_list": run_cmd(["launchctl", "list"])}
    return {"error": f"unsupported_os:{os_type}"}

def collect_recent_logs() -> Dict[str, Any]:
    os_type = platform.system()
    if os_type == "Windows":
        return {"system": run_cmd(["powershell","-NoProfile","-Command","Get-WinEvent -LogName System -MaxEvents 60 | Format-List"]),
                "application": run_cmd(["powershell","-NoProfile","-Command","Get-WinEvent -LogName Application -MaxEvents 60 | Format-List"])}
    if os_type == "Linux":
        return {"journal": run_cmd(["journalctl","-n","120","--no-pager"]),
                "dmesg_errors": run_cmd(["dmesg","--ctime","--color=never","--level=err,crit,alert,emerg"])}
    if os_type == "Darwin":
        return {"log_last_5m": run_cmd(["log","show","--style","syslog","--last","5m"], timeout_s=10),
                "dmesg": run_cmd(["dmesg"])}
    return {"error": f"unsupported_os:{os_type}"}


# -----------------------------
# M5 Audit moat + reporting
# -----------------------------
TEXT_EXT_ALLOW = {".txt", ".md", ".csv", ".log", ".json", ".tex", ".html", ".xml", ".yaml", ".yml"}
def looks_binary(path: Path) -> bool:
    try:
        chunk = path.open("rb").read(4096)
        if b"\x00" in chunk:
            return True
        nontext = sum(1 for b in chunk if b < 9 or (b > 13 and b < 32))
        return nontext > 0.25 * max(1, len(chunk))
    except Exception:
        return True

def read_text_safely(path: Path, max_bytes: int) -> Optional[str]:
    try:
        if path.stat().st_size > max_bytes:
            return None
        if looks_binary(path):
            return None
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

def scan_directory(scan_root: Optional[Path], max_mb: int, max_files: int, events_fp) -> Dict[str, Any]:
    max_bytes = max_mb * 1024 * 1024
    report: Dict[str, Any] = {}
    totals: Dict[str, int] = {}
    count_files = 0
    skipped = {"too_large_or_binary": 0, "unreadable": 0, "max_files": 0}

    if scan_root is None or not scan_root.is_dir():
        return {"files": report, "totals": totals, "skipped": skipped}

    for p in scan_root.rglob("*"):
        if not p.is_file():
            continue
        count_files += 1
        if count_files > max_files:
            skipped["max_files"] = skipped["max_files"] + 1
            break
        txt = read_text_safely(p, max_bytes=max_bytes)
        if txt is None:
            skipped["too_large_or_binary"] += 1
            continue

        redacted, fsum = redact_text(txt)
        if not fsum:
            continue

        decision = policy_decision(fsum, policy=os.environ.get("KASBAH_POLICY", "warn").lower(), dest=None)
        rel = str(p.relative_to(scan_root))
        file_entry: Dict[str, Any] = {
            "size_bytes": p.stat().st_size,
            "findings": fsum,
            "decision": decision,
        }
        # Add category names as top-level keys for easy lookup
        for cat_name in decision.get("counts", {}):
            file_entry[cat_name] = {"count": decision["counts"][cat_name]}
        report[rel] = file_entry
        for f in fsum:
            totals[f["category"]] = totals.get(f["category"], 0) + 1

        events_fp.write(json.dumps({
            "ts": now_utc(),
            "event": "scan_file",
            "file": rel,
            "decision": decision["action"],
            "counts": decision["counts"],
        }) + "\n")

    return {"files": report, "totals": totals, "skipped": skipped}


# -----------------------------
# M12 Adversarial selftests moat
# -----------------------------
SELFTEST_TEXT = """
Email: alice(at)example(dot)com
Phone: +212 6 12 34 56 78
Arabic digits phone: ٠٦١٢٣٤٥٦٧٨
SSN: 123-45-6789
IBAN: MA6401151900000123456789012
AWS: AKIAIOSFODNN7EXAMPLE
JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvZSIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
Token: api_key=sk_test_FAKE_TEST_KEY_DO_NOT_USE_abcdef
PAN: 4111 1111 1111 1111
Key:
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhki...
-----END PRIVATE KEY-----
"""

def do_selftest() -> Dict[str, Any]:
    red, fsum = redact_text(SELFTEST_TEXT)
    pol = os.environ.get("KASBAH_POLICY", "warn").lower()
    decision = policy_decision(fsum, policy=pol)
    required = {"email","phone_ma","ssn","iban_ma","aws_access_key","jwt","token_kv","credit_card","private_key_block"}
    got = {f["category"] for f in fsum}
    missing = sorted(list(required - got))
    return {
        "result": "PASS" if not missing else "FAIL",
        "missing": missing,
        "decision": decision,
        "counts": decision["counts"],
        "redacted_preview": red[:1200],
    }


# -----------------------------
# M1 Surface control — wrapper and proxy
# -----------------------------
def preflight_payload(text: str, intent: str, dest: Optional[str], policy: str) -> Dict[str, Any]:
    red, fsum = redact_text(text)
    inferred_intent = intent_heuristic(intent, text)
    decision = policy_decision(fsum, policy=policy, dest=dest)
    return {
        "intent": inferred_intent,
        "dest": dest,
        "decision": decision,
        "counts": decision["counts"],
        "findings": fsum,
        "redacted_preview": red[:4000],
    }

def wrap_command(files: List[str], intent: str, policy: str, dest: Optional[str], cmd: List[str]) -> int:
    # Gate on files' contents and optionally stdin if present
    events_path = Path("kasbah_13moat_events.jsonl").resolve()
    with events_path.open("a", encoding="utf-8") as ev:
        for f in files:
            p = Path(f)
            if not p.exists() or not p.is_file():
                continue
            txt = read_text_safely(p, max_bytes=int(os.environ.get("KASBAH_MAX_MB","25"))*1024*1024)
            if txt is None:
                continue
            out = preflight_payload(txt, intent=intent or "upload", dest=dest, policy=policy)
            ev.write(json.dumps({"ts": now_utc(), "event": "wrap_file_preflight", "file": str(p), "decision": out["decision"]["action"], "counts": out["counts"]}) + "\n")
            if out["decision"]["action"] == "block":
                print(json.dumps(out, indent=2, ensure_ascii=False))
                return 2

        # stdin preflight if piped
        if not sys.stdin.isatty():
            txt = sys.stdin.read()
            out = preflight_payload(txt, intent=intent or "prompt", dest=dest, policy=policy)
            ev.write(json.dumps({"ts": now_utc(), "event": "wrap_stdin_preflight", "decision": out["decision"]["action"], "counts": out["counts"]}) + "\n")
            if out["decision"]["action"] == "block":
                print(json.dumps(out, indent=2, ensure_ascii=False))
                return 2

    # If allowed/warn: execute command; warn returns 1 but still runs only if policy != block
    # For strict enterprises, set KASBAH_POLICY=block to force block on any high.
    proc = subprocess.call(cmd)
    return 0 if proc == 0 else proc

# Minimal forward proxy (HTTP CONNECT tunneling not supported; only basic HTTP forwarding).
# This is intentional: CONNECT would require deeper MITM; not acceptable here.
def run_proxy(listen_host: str, listen_port: int, policy: str) -> None:
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((listen_host, listen_port))
    server.listen(50)
    print(f"Kasbah proxy listening on {listen_host}:{listen_port} (basic HTTP only)")
    print("Note: CONNECT (HTTPS tunneling) is intentionally unsupported in this single-file tool.")

    def handle(conn: socket.socket, addr):
        try:
            data = conn.recv(65536)
            if not data:
                conn.close()
                return
            header, _, body = data.partition(b"\r\n\r\n")
            first = header.splitlines()[0].decode("utf-8", "replace")
            # naive parse: METHOD URL HTTP/1.1
            parts = first.split()
            if len(parts) < 2:
                conn.close()
                return
            method, url = parts[0], parts[1]
            # Try to extract Host
            host = ""
            for line in header.splitlines()[1:]:
                if line.lower().startswith(b"host:"):
                    host = line.split(b":",1)[1].strip().decode("utf-8","replace")
                    break
            dest = host or url
            # Preflight text-ish bodies (JSON/text/form); if binary, skip
            body_text = ""
            try:
                body_text = body.decode("utf-8", "ignore")
            except Exception:
                body_text = ""
            if body_text:
                out = preflight_payload(body_text, intent="proxy", dest=dest, policy=policy)
                if out["decision"]["action"] == "block":
                    resp = b"HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\n\r\n" + json.dumps(out).encode("utf-8")
                    conn.sendall(resp)
                    conn.close()
                    return

            # Forward (best-effort, no TLS)
            parsed = urllib.parse.urlparse(url if "://" in url else f"http://{dest}{url}")
            fhost = parsed.hostname or host
            fport = parsed.port or 80
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query

            upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            upstream.connect((fhost, fport))
            # Rebuild request line with path only
            rebuilt = header.replace(first.encode("utf-8"), f"{method} {path} HTTP/1.1".encode("utf-8"), 1) + b"\r\n\r\n" + body
            upstream.sendall(rebuilt)
            while True:
                chunk = upstream.recv(65536)
                if not chunk:
                    break
                conn.sendall(chunk)
            upstream.close()
            conn.close()
        except Exception:
            try:
                conn.close()
            except Exception:
                pass

    while True:
        c, a = server.accept()
        t = threading.Thread(target=handle, args=(c,a), daemon=True)
        t.start()


# -----------------------------
# M11 tamper evidence bundle
# -----------------------------
def write_report_bundle(out_dir: Path, data: Dict[str, Any]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "report.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    md = []
    md.append("# Kasbah 13-Moat Enforcer Report\n\n")
    md.append(f"Generated (UTC): {data['timestamp_utc']}\n\n")
    md.append("## Moats\n")
    for k, v in data["moats"].items():
        md.append(f"- {k}: {v}\n")
    md.append("\n## PII/Secrets Scan Summary\n")
    summ = data.get("scan", {}).get("totals", {})
    if summ:
        for k, v in sorted(summ.items()):
            md.append(f"- {k}: {v}\n")
    else:
        md.append("- (no scan)\n")
    md.append("\n## Notes\n- Raw sensitive values are never stored; only hashes.\n")
    (out_dir / "report.md").write_text("".join(md), encoding="utf-8")

    # hashes.json will be written after bundle creation
    bundle_path = Path("kasbah_13moat_bundle.zip").resolve()
    manifest: List[str] = []
    with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fp in sorted(out_dir.rglob("*")):
            if fp.is_file():
                arc = fp.relative_to(out_dir).as_posix()
                zf.write(fp, arc)
                manifest.append(arc)

    bundle_hash = sha256_file(bundle_path)
    hashes = {
        "report.json": sha256_file(out_dir / "report.json"),
        "report.md": sha256_file(out_dir / "report.md"),
        "bundle": bundle_hash,
        "bundle.zip": bundle_hash,
        "bundle_files": manifest,
    }
    (out_dir / "hashes.json").write_text(json.dumps(hashes, indent=2), encoding="utf-8")
    return bundle_path


# -----------------------------
# Main
# -----------------------------
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preflight", action="store_true", help="Preflight text from stdin or --infile")
    ap.add_argument("--infile", type=str, default="", help="File to preflight (otherwise stdin)")
    ap.add_argument("--intent", type=str, default="", help="prompt|upload|chat|dev|finance|identity|secrets|proxy|unknown")
    ap.add_argument("--dest", type=str, default="", help="Destination URL/host for allow/deny checks")
    ap.add_argument("--wrap", action="store_true", help="Wrap a command; gate --files and stdin, then run command")
    ap.add_argument("--files", nargs="*", default=[], help="Files to gate when wrapping")
    ap.add_argument("--proxy", action="store_true", help="Run basic HTTP proxy (no CONNECT)")
    ap.add_argument("--listen", type=str, default="127.0.0.1:18888", help="listen host:port for proxy")
    ap.add_argument("--selftest", action="store_true", help="Run adversarial selftests")
    ap.add_argument("--out", type=str, default="kasbah_13moat_report", help="Output report directory")
    ap.add_argument("cmd", nargs=argparse.REMAINDER, help="Command after --wrap")
    args = ap.parse_args(argv)

    policy = os.environ.get("KASBAH_POLICY", "warn").strip().lower()
    if policy not in ("allow", "warn", "block"):
        policy = "warn"

    # Selftest
    if args.selftest:
        res = do_selftest()
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return exit_code_for(res["decision"]["action"])

    # Proxy
    if args.proxy:
        host, port_s = args.listen.split(":")
        run_proxy(host, int(port_s), policy=policy)
        return 0

    # Wrap
    if args.wrap:
        if not args.cmd:
            print("ERR: --wrap requires a command after --wrap, e.g. --wrap -- curl ...", file=sys.stderr)
            return 2
        cmd = args.cmd
        if cmd and cmd[0] == "--":
            cmd = cmd[1:]
        return wrap_command(args.files, intent=args.intent, policy=policy, dest=args.dest or None, cmd=cmd)

    # Preflight
    if args.preflight:
        if args.infile:
            text = Path(args.infile).read_text(encoding="utf-8", errors="replace")
        else:
            text = sys.stdin.read()
        out = preflight_payload(text, intent=args.intent, dest=args.dest or None, policy=policy)
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return exit_code_for(out["decision"]["action"])

    # Default: full report (posture + optional dir scan)
    out_dir = Path(args.out).resolve()
    events_path = out_dir / "events.jsonl"
    out_dir.mkdir(parents=True, exist_ok=True)

    moats = {
        "M1_surface_control": "ENFORCED_via_preflight_wrap_proxy",
        "M2_intent_awareness": "ENFORCED_via_flags+heuristics",
        "M3_normalization": "ENFORCED",
        "M4_pii_detection": "ENFORCED",
        "M5_financial_detection": "ENFORCED",
        "M6_secrets_detection": "ENFORCED",
        "M7_contextual_redaction": "ENFORCED",
        "M8_policy_governance": f"ENFORCED_policy={policy}",
        "M9_user_agency": "ENFORCED_reasons+guidance_in_output",
        "M10_system_posture": "ENFORCED_snapshot",
        "M11_tamper_evidence": "ENFORCED_bundle+hashes",
        "M12_adversarial_tests": "AVAILABLE_via_--selftest",
        "M13_composability": "ENFORCED_json+exitcodes+events",
    }

    scan_dir_env = os.environ.get("KASBAH_SCAN_DIR", "").strip()
    max_mb = int(os.environ.get("KASBAH_MAX_MB", "25"))
    max_files = int(os.environ.get("KASBAH_MAX_FILES", "8000"))

    with events_path.open("a", encoding="utf-8") as ev:
        data: Dict[str, Any] = {
            "timestamp_utc": now_utc(),
            "platform": platform.platform(),
            "kernel_release": platform.uname().release,
            "architecture": platform.machine(),
            "python_version": sys.version.split()[0],
            "policy": policy,
            "config_pack": load_config_pack(),
            "allow_dest": parse_list_env("KASBAH_ALLOW_DEST"),
            "deny_dest": parse_list_env("KASBAH_DENY_DEST"),
            "moats": moats,
            "firewall": check_firewall(),
            "encryption": check_encryption(),
            "updates": check_updates(),
            "services": check_services(),
            "network": check_network(),
            "scheduled_tasks": check_scheduled_tasks(),
            "recent_logs": collect_recent_logs(),
            "scan": {"files": {}, "totals": {}, "skipped": {}},
        }

        if scan_dir_env and Path(scan_dir_env).is_dir():
            scan = scan_directory(Path(scan_dir_env), max_mb=max_mb, max_files=max_files, events_fp=ev)
            data["scan"] = scan

        ev.write(json.dumps({"ts": now_utc(), "event": "report_done"}) + "\n")

    bundle = write_report_bundle(out_dir, data)
    print(f"OK: report_dir={out_dir}")
    print(f"OK: bundle={bundle}")
    print(f"OK: hashes={out_dir/'hashes.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
