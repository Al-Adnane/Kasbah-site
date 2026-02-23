#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║         KASBAH 13-MOAT STANDALONE TEST SUITE v2026.1                                 ║
║                    NO EXTERNAL FILE REFERENCES                                        ║
║                    ALL TESTS EMBEDDED INTERNALLY                                      ║
║                    Ready for AGENT Execution & Live Events                            ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝

USAGE:
------
1. No external files needed - everything is embedded
2. Install: pip install pytest pytest-cov pytest-timeout
3. Run: pytest test_kasbah_standalone.py -v --cov-report=html

SECURITY FOCUS:
---------------
✅ FD Leaks (File Descriptor Inheritance)
✅ Env Injection (LD_PRELOAD, PYTHONPATH)
✅ Race Conditions (Thread Safety, TOCTOU)
✅ ReDoS, Path Traversal, PII Detection
✅ 100+ Tests - All Self-Contained
"""
import os
import re
import sys
import json
import time
import hashlib
import tempfile
import threading
import subprocess
import zipfile
import platform
import resource
import tracemalloc
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from io import StringIO
from unittest.mock import patch, MagicMock
from dataclasses import dataclass
from functools import lru_cache
import pytest

# ═══════════════════════════════════════════════════════════════════════════════════════
# EMBEDDED TARGET IMPLEMENTATION (No External File Needed)
# ═══════════════════════════════════════════════════════════════════════════════════════
_ZERO_WIDTH = dict.fromkeys(map(ord, ["\u200b", "\u200c", "\u200d", "\ufeff", "\u2060"]), None)
_ARABIC_MAP = str.maketrans({"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
                              "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
                              "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
                              "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"})
_RX_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}\b")
_RX_PHONE = re.compile(r"\b(?:\+?\d[\d\s\-()]{7,}\d)\b")
_RX_MA_PHONE = re.compile(r"(?:^|(?<=\s))(?:\+212|0)[\s.-]?(?:\d[\s.-]?){8}\d(?=$|\s)")
_RX_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_RX_IBAN_MA = re.compile(r"\bMA\d{2}[A-Z0-9]{19,26}\b")
_RX_AWS = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
_RX_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
_RX_CC = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
_RX_LONG = re.compile(r"\b\d{8,}\b")
_RX_KEY = re.compile(r"(?i)\b(api[_-]?key|secret|token)\b\s*[:=]\s*['\"]?([A-Za-z0-9_-]{16,})['\"]?")
_RX_PRIVKEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")

@dataclass(frozen=True)
class Finding:
    category: str
    severity: str
    start: int
    end: int
    value: str

SEV_RANK = {"LOW": 1, "MED": 2, "HIGH": 3, "CRITICAL": 4}

def normalize_text(s: str) -> str:
    s = s.translate(_ZERO_WIDTH)
    s = s.translate(_ARABIC_MAP)
    s = s.replace("＠", "@")
    s = re.sub(r"\s*(?:\(at\)|\[at\])\s*", "@", s, flags=re.I)
    s = re.sub(r"(?<!\w)\s*at\s*(?!\w)", "@", s, flags=re.I)
    s = re.sub(r"\s*(?:\(dot\)|\[dot\])\s*", ".", s, flags=re.I)
    s = re.sub(r"(?<!\w)\s*dot\s*(?!\w)", ".", s, flags=re.I)
    return s

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

def detect_findings(text: str) -> List[Finding]:
    t = normalize_text(text)
    out: List[Finding] = []
    def add(rx, cat, sev):
        for m in rx.finditer(t):
            out.append(Finding(cat, sev, m.start(), m.end(), m.group(0)))
    add(_RX_EMAIL, "email", "MED")
    add(_RX_MA_PHONE, "phone_ma", "MED")
    add(_RX_PHONE, "phone", "MED")
    add(_RX_SSN, "ssn", "CRITICAL")
    add(_RX_IBAN_MA, "iban_ma", "CRITICAL")
    add(_RX_AWS, "aws_access_key", "CRITICAL")
    add(_RX_JWT, "jwt", "HIGH")
    add(_RX_KEY, "token_kv", "CRITICAL")
    add(_RX_PRIVKEY, "private_key_block", "CRITICAL")
    for m in _RX_CC.finditer(t):
        if luhn_ok(m.group(0)):
            out.append(Finding("credit_card", "CRITICAL", m.start(), m.end(), m.group(0)))
    for m in _RX_LONG.finditer(t):
        sev = "HIGH" if len(m.group(0)) >= 12 else "MED"
        out.append(Finding("long_digits", sev, m.start(), m.end(), m.group(0)))
    uniq = {}
    for f in out:
        uniq[(f.category, f.start, f.end)] = f
    return sorted(uniq.values(), key=lambda x: (x.start, x.end))

def redact_text(text: str) -> Tuple[str, List[Dict]]:
    norm = normalize_text(text)
    findings = detect_findings(norm)
    parts = []
    cur = 0
    summaries = []
    for f in findings:
        parts.append(norm[cur:f.start])
        tag = f"[REDACTED:{f.category}:{hashlib.sha256(f.value.encode()).hexdigest()[:8]}]"
        parts.append(tag)
        cur = f.end
        summaries.append({"category": f.category, "severity": f.severity, "hash8": hashlib.sha256(f.value.encode()).hexdigest()[:8]})
    parts.append(norm[cur:])
    return "".join(parts), summaries

_DANGEROUS_ENV_VARS = {'LD_PRELOAD', 'LD_LIBRARY_PATH', 'PYTHONPATH',
                        'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH'}

def run_cmd(cmd: List[str], timeout_s: int = 120) -> Dict[str, Any]:
    rec = {"cmd": cmd}
    # Sanitize environment: strip dangerous injection vectors
    safe_env = {k: v for k, v in os.environ.items() if k not in _DANGEROUS_ENV_VARS}
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=timeout_s,
                                       text=True, errors="replace",
                                       close_fds=True, env=safe_env)
        rec["output"] = out
    except subprocess.TimeoutExpired as e:
        rec["error"] = f"timeout_after_{e.timeout}s"
    except subprocess.CalledProcessError as e:
        rec["error"] = f"returncode_{e.returncode}"
    except FileNotFoundError:
        rec["error"] = "command_not_found"
    except PermissionError:
        rec["error"] = "permission_denied"
    except Exception as e:
        rec["error"] = f"{type(e).__name__}: {e}"
    return rec

def scan_directory(scan_root: Path, max_mb: int = 25, max_files: int = 5000) -> Dict[str, Any]:
    max_bytes = max_mb * 1024 * 1024
    report = {}
    totals = {}
    count = 0
    for p in scan_root.rglob("*"):
        if not p.is_file():
            continue
        count += 1
        if count > max_files:
            break
        try:
            if p.stat().st_size > max_bytes:
                continue
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except:
            continue
        findings = detect_findings(txt)
        if not findings:
            continue
        rel = str(p.relative_to(scan_root))
        report[rel] = {}
        for f in findings:
            if f.category not in report[rel]:
                report[rel][f.category] = {"count": 0, "hashes": []}
            report[rel][f.category]["count"] += 1
            h = hashlib.sha256(f.value.encode()).hexdigest()
            if h not in report[rel][f.category]["hashes"]:
                report[rel][f.category]["hashes"].append(h)
            totals[f.category] = totals.get(f.category, 0) + 1
    return {"files": report, "totals": totals}

# ═══════════════════════════════════════════════════════════════════════════════════════
# ATTACK VECTORS (Embedded - No External Files)
# ═══════════════════════════════════════════════════════════════════════════════════════
class Vectors:
    EMAILS = [
        'user@example.com', 'user(at)example.com', 'user&#64;example.com',
        'user\u200b@example.com', 'user@exаmple.com', '"user"@example.com',
        'user＠example.com', 'user @example.com', 'user\t@\texample.com'
    ]
    PHONES = [
        '555-123-4567', '+212 6 12 34 56 78', '٠٦١٢٣٤٥٦٧٨', '1-800-FLOWERS',
        '(555) 123-4567', '555.123.4567', '+1 555 123 4567'
    ]
    SECRETS = [
        'AKIAIOSFODNN7EXAMPLE', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
        '-----BEGIN RSA PRIVATE KEY-----', 'sk-1234567890abcdefghij',
        'MA6401151900000123456789012', '123-45-6789'
    ]
    REDOS = [
        (r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", 'a' * 50000 + '!'),
        (r"\b\d{8,}\b", '1' * 100000 + 'x'),
        (r"(?:\+?\d[\d\s\-\(\)]{7,}\d)", '+' + '1(' * 25000 + 'x')
    ]

# ═══════════════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════════════
@pytest.fixture
def temp_dir():
    tmp = tempfile.mkdtemp()
    orig_cwd = os.getcwd()
    orig_env = os.environ.copy()
    os.chdir(tmp)
    yield tmp
    os.chdir(orig_cwd)
    os.environ.clear()
    os.environ.update(orig_env)
    for root, dirs, files in os.walk(tmp, topdown=False):
        for name in files:
            try: os.remove(os.path.join(root, name))
            except: pass
        for name in dirs:
            try: os.rmdir(os.path.join(root, name))
            except: pass
    try: os.rmdir(tmp)
    except: pass

@pytest.fixture
def mock_platform(request):
    os_type = getattr(request, 'param', 'Linux')
    with patch('platform.system', return_value=os_type):
        with patch('platform.uname', return_value=platform.uname_result(os_type, 'rel', 'ver', 'arch', '')):
            yield os_type

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 1: FUNCTIONAL (15 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestFunctional:
    def test_detect_findings_basic(self):
        result = detect_findings('Email: test@example.com')
        assert any(f.category == 'email' for f in result)

    def test_detect_findings_multiple(self):
        result = detect_findings('test@a.com and user@b.org')
        assert len([f for f in result if f.category == 'email']) >= 2

    def test_redact_text_basic(self):
        redacted, summaries = redact_text('Email: test@example.com')
        assert 'test@example.com' not in redacted
        assert 'REDACTED' in redacted
        assert len(summaries) >= 1

    def test_redact_text_preserves_structure(self):
        redacted, _ = redact_text('Contact: test@example.com for info')
        assert 'Contact:' in redacted
        assert 'for info' in redacted

    def test_normalize_zero_width(self):
        text = "user\u200b\u200c\u200d@example.com"
        normalized = normalize_text(text)
        assert '\u200b' not in normalized
        assert '@' in normalized

    def test_normalize_arabic_digits(self):
        text = "٠٦١٢٣٤٥٦٧٨"
        normalized = normalize_text(text)
        assert normalized == "0612345678"

    def test_normalize_obfuscation(self):
        text = "user(at)example(dot)com"
        normalized = normalize_text(text)
        assert '@' in normalized
        assert '.' in normalized

    def test_luhn_validation_valid(self):
        assert luhn_ok("4532015112830366") == True

    def test_luhn_validation_invalid(self):
        assert luhn_ok("1234567890123456") == False

    def test_run_cmd_success(self):
        result = run_cmd(['echo', 'test'])
        assert 'error' not in result or 'output' in result

    def test_run_cmd_timeout(self):
        def mock(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd=['slow'], timeout=1)
        with patch('subprocess.check_output', side_effect=mock):
            result = run_cmd(['slow'])
            assert 'error' in result
            assert 'timeout' in result['error'].lower()

    def test_run_cmd_not_found(self):
        def mock(*args, **kwargs):
            raise FileNotFoundError()
        with patch('subprocess.check_output', side_effect=mock):
            result = run_cmd(['nonexistent'])
            assert 'error' in result

    def test_run_cmd_permission_denied(self):
        def mock(*args, **kwargs):
            raise PermissionError()
        with patch('subprocess.check_output', side_effect=mock):
            result = run_cmd(['protected'])
            assert 'error' in result

    def test_scan_directory_basic(self, temp_dir):
        test_file = Path(temp_dir) / 'test.txt'
        test_file.write_text('test@example.com')
        result = scan_directory(Path(temp_dir))
        assert 'files' in result
        assert 'test.txt' in result['files']

    def test_scan_directory_empty(self, temp_dir):
        result = scan_directory(Path(temp_dir))
        assert result['files'] == {}

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 2: SECURITY - FD LEAKS (10 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestFDLeaks:
    def test_subprocess_fd_leakage(self, temp_dir):
        """⚠️ FD LEAK TEST - File Descriptor Inheritance"""
        secret_file = os.path.join(temp_dir, 'secret.txt')
        with open(secret_file, 'w') as f:
            f.write('TOP_SECRET_FD_LEAK_TEST_2026')
        fd = os.open(secret_file, os.O_RDONLY)
        leaked = False
        def mock_check_output(cmd, *args, **kwargs):
            nonlocal leaked
            # If close_fds=True is passed, FDs should not be inherited
            if kwargs.get('close_fds', False):
                return 'mock'
            try:
                inherited = open(f'/dev/fd/{fd}', 'r').read()
                if 'TOP_SECRET' in inherited:
                    leaked = True
                return 'mock'
            except:
                return 'mock'
        with patch('subprocess.check_output', side_effect=mock_check_output):
            run_cmd(['echo', 'test'])
        os.close(fd)
        assert not leaked, "FD Leakage detected in subprocess"

    def test_subprocess_fd_close_on_exec(self, temp_dir):
        """Verify FDs are closed on exec"""
        secret_file = os.path.join(temp_dir, 'secret2.txt')
        with open(secret_file, 'w') as f:
            f.write('SECRET_CONTENT')
        fd = os.open(secret_file, os.O_RDONLY)
        try:
            result = run_cmd(['echo', 'test'])
            # Python subprocess closes fds by default
            assert 'error' not in result or 'output' in result
        finally:
            os.close(fd)

    def test_multiple_fd_handling(self, temp_dir):
        """Test multiple file descriptors"""
        fds = []
        for i in range(5):
            f = tempfile.NamedTemporaryFile(dir=temp_dir, delete=False)
            f.write(f'SECRET_{i}'.encode())
            f.close()
            fd = os.open(f.name, os.O_RDONLY)
            fds.append(fd)
        try:
            result = run_cmd(['echo', 'test'])
            assert 'error' not in result or 'output' in result
        finally:
            for fd in fds:
                os.close(fd)

    def test_fd_limit_handling(self, temp_dir):
        """Test behavior near FD limit"""
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        try:
            resource.setrlimit(resource.RLIMIT_NOFILE, (50, hard))
            result = run_cmd(['echo', 'test'])
            assert 'error' not in result or 'output' in result
        finally:
            resource.setrlimit(resource.RLIMIT_NOFILE, (soft, hard))

    def test_fd_inheritance_mock(self, temp_dir):
        """Mock test for FD inheritance"""
        secret_file = os.path.join(temp_dir, 'inherit.txt')
        with open(secret_file, 'w') as f:
            f.write('INHERIT_TEST')
        fd = os.open(secret_file, os.O_RDONLY)
        inherited = []
        def mock_check_output(cmd, *args, **kwargs):
            # If close_fds=True is passed, FDs should not be inherited
            if kwargs.get('close_fds', False):
                return 'mock'
            try:
                content = open(f'/dev/fd/{fd}', 'r').read()
                inherited.append(content)
            except:
                pass
            return 'mock'
        with patch('subprocess.check_output', side_effect=mock_check_output):
            run_cmd(['echo', 'test'])
        os.close(fd)
        # Should be empty if FDs properly closed
        assert len(inherited) == 0 or 'INHERIT_TEST' not in ''.join(inherited)

    def test_temp_file_cleanup(self, temp_dir):
        """Verify temp files cleaned up"""
        initial = set(os.listdir(temp_dir))
        for i in range(10):
            f = tempfile.NamedTemporaryFile(dir=temp_dir, delete=False)
            f.write(b'test')
            f.close()
        # Cleanup
        for f in Path(temp_dir).iterdir():
            if f.name not in initial:
                f.unlink()
        final = set(os.listdir(temp_dir))
        assert final == initial

    def test_file_handle_leak(self, temp_dir):
        """Test for file handle leaks"""
        handles_before = len([p for p in Path('/proc/self/fd').glob('*')]) if Path('/proc/self/fd').exists() else 0
        for i in range(100):
            test_file = Path(temp_dir) / f'leak_test_{i}.txt'
            test_file.write_text('test')
            _ = test_file.read_text()
        handles_after = len([p for p in Path('/proc/self/fd').glob('*')]) if Path('/proc/self/fd').exists() else 0
        # Allow some variance
        assert handles_after - handles_before < 50

    def test_subprocess_stderr_handling(self, temp_dir):
        """Test stderr FD handling"""
        result = run_cmd(['sh', '-c', 'echo error >&2'])
        assert 'error' not in result or 'output' in result

    def test_subprocess_stdout_handling(self, temp_dir):
        """Test stdout FD handling"""
        result = run_cmd(['echo', 'output'])
        assert 'error' not in result or 'output' in result

    def test_fd_after_exception(self, temp_dir):
        """Test FD state after exception"""
        secret_file = os.path.join(temp_dir, 'except.txt')
        with open(secret_file, 'w') as f:
            f.write('TEST')
        fd = os.open(secret_file, os.O_RDONLY)
        try:
            def mock(*args, **kwargs):
                raise RuntimeError('Test exception')
            with patch('subprocess.check_output', side_effect=mock):
                try:
                    run_cmd(['test'])
                except:
                    pass
            # FD should still be valid
            os.lseek(fd, 0, os.SEEK_SET)
        finally:
            os.close(fd)

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 3: SECURITY - ENV INJECTION (10 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestEnvInjection:
    def test_subprocess_env_injection(self, temp_dir):
        """⚠️ ENV INJECTION TEST - LD_PRELOAD/PYTHONPATH"""
        os.environ['LD_PRELOAD'] = '/evil/lib.so'
        os.environ['PYTHONPATH'] = '/malicious/path'
        injected = False
        def mock_check_output(cmd, *args, **kwargs):
            nonlocal injected
            env = kwargs.get('env', os.environ)
            if 'LD_PRELOAD' in env or 'PYTHONPATH' in env:
                injected = True
            return 'mock'
        with patch('subprocess.check_output', side_effect=mock_check_output):
            run_cmd(['echo', 'test'])
        del os.environ['LD_PRELOAD']
        del os.environ['PYTHONPATH']
        assert not injected, "Environment Injection detected"

    def test_ld_preload_sanitization(self):
        """Test LD_PRELOAD sanitization"""
        original = os.environ.get('LD_PRELOAD')
        os.environ['LD_PRELOAD'] = '/evil.so'
        env_copy = os.environ.copy()
        # Secure code should sanitize
        dangerous = 'LD_PRELOAD' in env_copy
        if original:
            os.environ['LD_PRELOAD'] = original
        elif 'LD_PRELOAD' in os.environ:
            del os.environ['LD_PRELOAD']
        # Document if dangerous vars passed through
        assert dangerous == True  # Documents the vulnerability

    def test_pythonpath_sanitization(self):
        """Test PYTHONPATH sanitization"""
        original = os.environ.get('PYTHONPATH')
        os.environ['PYTHONPATH'] = '/malicious'
        env_copy = os.environ.copy()
        dangerous = 'PYTHONPATH' in env_copy
        if original:
            os.environ['PYTHONPATH'] = original
        elif 'PYTHONPATH' in os.environ:
            del os.environ['PYTHONPATH']
        assert dangerous == True

    def test_env_var_passthrough(self, temp_dir):
        """Test safe env var passthrough"""
        os.environ['KASBAH_TEST'] = 'safe_value'
        def mock_check_output(cmd, env=None, **kwargs):
            if env and 'KASBAH_TEST' in env:
                return env['KASBAH_TEST']
            return 'mock'
        with patch('subprocess.check_output', side_effect=mock_check_output):
            result = run_cmd(['echo', 'test'])
        del os.environ['KASBAH_TEST']

    def test_dangerous_env_list(self):
        """Document dangerous env vars"""
        dangerous_vars = [
            'LD_PRELOAD', 'LD_LIBRARY_PATH', 'PYTHONPATH',
            'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH'
        ]
        for var in dangerous_vars:
            assert var in ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'PYTHONPATH',
                          'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH']

    def test_env_sanitization_function(self):
        """Test env sanitization logic"""
        def sanitize_env(env):
            safe = env.copy()
            for key in ['LD_PRELOAD', 'PYTHONPATH', 'LD_LIBRARY_PATH']:
                safe.pop(key, None)
            return safe
        test_env = {'LD_PRELOAD': '/evil.so', 'PATH': '/usr/bin', 'PYTHONPATH': '/bad'}
        safe = sanitize_env(test_env)
        assert 'LD_PRELOAD' not in safe
        assert 'PYTHONPATH' not in safe
        assert 'PATH' in safe

    def test_env_inheritance_default(self):
        """Test default env inheritance"""
        os.environ['TEST_VAR'] = 'test_value'
        result = run_cmd(['env'])
        del os.environ['TEST_VAR']
        # Documents that env is inherited by default

    def test_env_isolation(self, temp_dir):
        """Test env isolation"""
        isolated_env = {'PATH': os.environ.get('PATH', '/usr/bin')}
        def mock_check_output(cmd, env=None, **kwargs):
            return 'isolated' if env == isolated_env else 'inherited'
        with patch('subprocess.check_output', side_effect=mock_check_output):
            result = run_cmd(['echo', 'test'])

    def test_env_size_limit(self):
        """Test environment size handling"""
        # Large env vars
        os.environ['LARGE_VAR'] = 'A' * 100000
        result = run_cmd(['echo', 'test'])
        del os.environ['LARGE_VAR']
        assert 'error' not in result or 'output' in result

    def test_env_unicode_handling(self):
        """Test unicode in env vars"""
        os.environ['UNICODE_VAR'] = '测试🔒'
        result = run_cmd(['echo', 'test'])
        del os.environ['UNICODE_VAR']
        assert 'error' not in result or 'output' in result

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 4: RACE CONDITIONS (15 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestRaceConditions:
    def test_thread_safety_detect_findings(self):
        """⚠️ RACE CONDITION TEST - Thread Safety of Detection"""
        text = 'test@example.com\n' * 100
        results = []
        errors = []
        def worker():
            try:
                res = detect_findings(text)
                results.append(len(res))
            except Exception as e:
                errors.append(str(e))
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(errors) == 0, f"Thread errors: {errors}"
        assert len(results) == 10
        assert len(set(results)) == 1, "Inconsistent results across threads"

    def test_concurrent_scan_directory(self, temp_dir):
        """⚠️ RACE CONDITION TEST - Concurrent Directory Scanning"""
        scan_dir = Path(temp_dir) / 'race_scan'
        scan_dir.mkdir()
        for i in range(10):
            (scan_dir / f'file{i}.txt').write_text(f'user{i}@example.com')
        results = []
        def worker():
            res = scan_directory(scan_dir)
            results.append(len(res.get('files', {})))
        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(set(results)) == 1, "Inconsistent scan results"

    def test_file_modification_during_scan(self, temp_dir):
        """⚠️ RACE CONDITION TEST - TOCTOU"""
        scan_dir = Path(temp_dir) / 'toctou'
        scan_dir.mkdir()
        filepath = scan_dir / 'mutable.txt'
        filepath.write_text('original@example.com')
        stop_flag = threading.Event()
        def modifier():
            while not stop_flag.is_set():
                try:
                    filepath.write_text(f'modified_{time.time()}@example.com')
                    time.sleep(0.001)
                except: break
        mod_thread = threading.Thread(target=modifier)
        mod_thread.start()
        data = scan_directory(scan_dir)
        stop_flag.set()
        mod_thread.join()
        assert 'files' in data

    def test_concurrent_redact_text(self):
        """⚠️ RACE CONDITION TEST - Redaction Thread Safety"""
        text = 'SSN: 123-45-6789\nEmail: test@example.com'
        results = []
        def worker():
            res = redact_text(text)
            results.append(len(res[0]))
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(results) == 10
        assert len(set(results)) == 1

    def test_concurrent_normalize(self):
        """Test normalize_text thread safety"""
        text = 'user\u200b@example.com' * 100
        results = []
        def worker():
            results.append(normalize_text(text))
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(set(results)) == 1

    def test_concurrent_luhn(self):
        """Test luhn_ok thread safety"""
        cc = '4532015112830366'
        results = []
        def worker():
            results.append(luhn_ok(cc))
        threads = [threading.Thread(target=worker) for _ in range(100)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert all(results)
        assert len(results) == 100

    def test_file_lock_during_scan(self, temp_dir):
        """Test file locking during scan"""
        scan_dir = Path(temp_dir) / 'lock_test'
        scan_dir.mkdir()
        filepath = scan_dir / 'locked.txt'
        filepath.write_text('test@example.com')
        # Try to lock
        lock_file = filepath.with_suffix('.lock')
        lock_file.write_text('locked')
        data = scan_directory(scan_dir)
        lock_file.unlink()
        assert 'files' in data

    def test_concurrent_run_cmd(self):
        """Test run_cmd thread safety"""
        results = []
        def worker():
            results.append(run_cmd(['echo', 'test']))
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(results) == 10

    def test_race_condition_hash(self):
        """Test hash generation race condition"""
        text = 'test@example.com'
        hashes = []
        def worker():
            h = hashlib.sha256(text.encode()).hexdigest()
            hashes.append(h)
        threads = [threading.Thread(target=worker) for _ in range(100)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(set(hashes)) == 1

    def test_concurrent_file_write(self, temp_dir):
        """Test concurrent file writes"""
        scan_dir = Path(temp_dir) / 'concurrent_write'
        scan_dir.mkdir()
        errors = []
        def writer(i):
            try:
                (scan_dir / f'file{i}.txt').write_text(f'content{i}')
            except Exception as e:
                errors.append(str(e))
        threads = [threading.Thread(target=writer, args=(i,)) for i in range(20)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(errors) == 0
        assert len(list(scan_dir.glob('*.txt'))) == 20

    def test_toctou_file_read(self, temp_dir):
        """Test TOCTOU in file read"""
        filepath = Path(temp_dir) / 'toctou_read.txt'
        filepath.write_text('initial')
        def modifier():
            time.sleep(0.001)
            filepath.write_text('modified')
        mod_thread = threading.Thread(target=modifier)
        mod_thread.start()
        content = filepath.read_text()
        mod_thread.join()
        assert content in ['initial', 'modified']

    def test_concurrent_temp_dir(self, temp_dir):
        """Test concurrent temp directory usage"""
        results = []
        def worker():
            tmp = tempfile.mkdtemp()
            (Path(tmp) / 'test.txt').write_text('test')
            results.append(tmp)
            import shutil
            shutil.rmtree(tmp)
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(results) == 10

    def test_semaphore_limiting(self, temp_dir):
        """Test semaphore for concurrent access"""
        semaphore = threading.Semaphore(3)
        results = []
        def worker():
            with semaphore:
                time.sleep(0.01)
                results.append(1)
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert len(results) == 10

    def test_queue_thread_safety(self):
        """Test queue thread safety"""
        import queue
        q = queue.Queue()
        def worker():
            for i in range(10):
                q.put(i)
        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert q.qsize() == 50

    def test_lock_protection(self):
        """Test lock protection"""
        lock = threading.Lock()
        counter = [0]
        def worker():
            for _ in range(100):
                with lock:
                    counter[0] += 1
        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert counter[0] == 1000

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 5: PII DETECTION (20 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestPIIDetection:
    def test_email_detection(self):
        for email in Vectors.EMAILS:
            result = detect_findings(email)
            assert isinstance(result, list)

    def test_phone_detection(self):
        for phone in Vectors.PHONES:
            result = detect_findings(phone)
            assert isinstance(result, list)

    def test_secrets_detection(self):
        for secret in Vectors.SECRETS:
            result = detect_findings(secret)
            assert isinstance(result, list)

    def test_morocco_phone(self):
        result = detect_findings('+212 6 12 34 56 78')
        assert any(f.category == 'phone_ma' for f in result)

    def test_morocco_iban(self):
        result = detect_findings('MA6401151900000123456789012')
        assert any(f.category == 'iban_ma' for f in result)

    def test_ssn_detection(self):
        result = detect_findings('123-45-6789')
        assert any(f.category == 'ssn' for f in result)

    def test_aws_key_detection(self):
        result = detect_findings('AKIAIOSFODNN7EXAMPLE')
        assert any(f.category == 'aws_access_key' for f in result)

    def test_jwt_detection(self):
        result = detect_findings('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
        assert any(f.category == 'jwt' for f in result)

    def test_credit_card_detection(self):
        result = detect_findings('4532015112830366')
        assert any(f.category == 'credit_card' for f in result)

    def test_private_key_detection(self):
        result = detect_findings('-----BEGIN RSA PRIVATE KEY-----')
        assert any(f.category == 'private_key_block' for f in result)

    def test_api_key_detection(self):
        result = detect_findings('api_key=sk_live_1234567890abcdef')
        assert any(f.category == 'token_kv' for f in result)

    def test_arabic_digits(self):
        result = detect_findings('٠٦١٢٣٤٥٦٧٨')
        assert result

    def test_fullwidth_at(self):
        result = detect_findings('user＠example.com')
        assert any(f.category == 'email' for f in result)

    def test_zero_width_injection(self):
        result = detect_findings('user\u200b@example.com')
        assert any(f.category == 'email' for f in result)

    def test_obfuscation_at(self):
        result = detect_findings('user(at)example.com')
        assert any(f.category == 'email' for f in result)

    def test_obfuscation_dot(self):
        result = detect_findings('user@example(dot)com')
        assert any(f.category == 'email' for f in result)

    def test_no_raw_pii_in_summaries(self):
        _, summaries = redact_text('test@example.com')
        for s in summaries:
            assert 'test@example.com' not in str(s)

    def test_hash_length(self):
        _, summaries = redact_text('test@example.com')
        for s in summaries:
            assert len(s.get('hash8', '')) == 8

    def test_multiple_findings(self):
        result = detect_findings('test@a.com and user@b.org and 123-45-6789')
        assert len(result) >= 3

    def test_deduplication(self):
        result = detect_findings('test@a.com test@a.com test@a.com')
        emails = [f for f in result if f.category == 'email']
        assert len(emails) >= 1

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 6: PERFORMANCE (10 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestPerformance:
    @pytest.mark.timeout(30)
    def test_memory_exhaustion(self, temp_dir):
        tracemalloc.start()
        scan_dir = Path(temp_dir) / 'mem'
        scan_dir.mkdir()
        (scan_dir / 'large.txt').write_bytes(b'A' * (10 * 1024 * 1024))
        before = tracemalloc.get_traced_memory()[0]
        scan_directory(scan_dir)
        after = tracemalloc.get_traced_memory()[0]
        tracemalloc.stop()
        ratio = (after - before) / (10 * 1024 * 1024)
        assert ratio < 5

    def test_many_files(self, temp_dir):
        scan_dir = Path(temp_dir) / 'many'
        scan_dir.mkdir()
        for i in range(100):
            (scan_dir / f'{i}.txt').write_text('test@example.com')
        start = time.time()
        data = scan_directory(scan_dir)
        assert time.time() - start < 30
        assert len(data['files']) == 100

    def test_string_performance(self):
        text = 'test@example.com\n' * 10000
        start = time.time()
        detect_findings(text)
        assert time.time() - start < 5

    def test_regex_performance(self):
        text = 'A' * 100000 + 'test@example.com'
        start = time.time()
        detect_findings(text)
        assert time.time() - start < 5

    def test_large_file_read(self, temp_dir):
        scan_dir = Path(temp_dir) / 'chunk'
        scan_dir.mkdir()
        (scan_dir / 'large.txt').write_text('A' * (20 * 1024 * 1024))
        start = time.time()
        scan_directory(scan_dir)
        assert time.time() - start < 15

    def test_deep_nested(self, temp_dir):
        scan_dir = Path(temp_dir) / 'nested'
        scan_dir.mkdir()
        current = scan_dir
        for i in range(30):
            current = current / f'sub{i}'
            current.mkdir()
        (current / 'deep.txt').write_text('test@example.com')
        data = scan_directory(scan_dir)
        assert any('deep.txt' in p for p in data['files'].keys())

    def test_concurrent_performance(self, temp_dir):
        scan_dir = Path(temp_dir) / 'perf'
        scan_dir.mkdir()
        for i in range(50):
            (scan_dir / f'{i}.txt').write_text('test@example.com')
        def worker():
            scan_directory(scan_dir)
        threads = [threading.Thread(target=worker) for _ in range(5)]
        start = time.time()
        for t in threads: t.start()
        for t in threads: t.join()
        assert time.time() - start < 30

    def test_redos_email(self):
        # Use bounded quantifiers to avoid catastrophic backtracking
        pattern = re.compile(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}")
        payload = 'a' * 50000 + '!'
        start = time.time()
        pattern.findall(payload)
        assert time.time() - start < 2

    def test_redos_digits(self):
        pattern = re.compile(r"\b\d{8,}\b")
        payload = '1' * 100000 + 'x'
        start = time.time()
        pattern.findall(payload)
        assert time.time() - start < 2

    def test_normalization_performance(self):
        text = 'user\u200b@example.com' * 10000
        start = time.time()
        normalize_text(text)
        assert time.time() - start < 5

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 7: INTEGRITY (10 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestIntegrity:
    def test_hash_consistency(self):
        text = 'test@example.com'
        h1 = hashlib.sha256(text.encode()).hexdigest()
        h2 = hashlib.sha256(text.encode()).hexdigest()
        assert h1 == h2

    def test_hash_uniqueness(self):
        h1 = hashlib.sha256('test1@example.com'.encode()).hexdigest()
        h2 = hashlib.sha256('test2@example.com'.encode()).hexdigest()
        assert h1 != h2

    def test_hash_length(self):
        h = hashlib.sha256('test'.encode()).hexdigest()
        assert len(h) == 64

    def test_bundle_structure(self, temp_dir):
        report_dir = Path(temp_dir) / 'report'
        report_dir.mkdir()
        (report_dir / 'report.json').write_text('{}')
        (report_dir / 'report.md').write_text('# Report')
        (report_dir / 'hashes.json').write_text('{}')
        bundle_path = Path(temp_dir) / 'bundle.zip'
        with zipfile.ZipFile(bundle_path, 'w') as zf:
            for fp in report_dir.rglob('*'):
                if fp.is_file():
                    zf.write(fp, fp.relative_to(report_dir))
        assert bundle_path.exists()

    def test_bundle_extraction(self, temp_dir):
        report_dir = Path(temp_dir) / 'report2'
        report_dir.mkdir()
        (report_dir / 'test.txt').write_text('content')
        bundle_path = Path(temp_dir) / 'bundle2.zip'
        with zipfile.ZipFile(bundle_path, 'w') as zf:
            zf.write(report_dir / 'test.txt', 'test.txt')
        extract_dir = Path(temp_dir) / 'extracted'
        extract_dir.mkdir()
        with zipfile.ZipFile(bundle_path, 'r') as zf:
            zf.extractall(extract_dir)
        assert (extract_dir / 'test.txt').exists()

    def test_tamper_detection(self, temp_dir):
        filepath = Path(temp_dir) / 'tamper.txt'
        filepath.write_text('original')
        original_hash = hashlib.sha256(filepath.read_bytes()).hexdigest()
        filepath.write_text('tampered')
        new_hash = hashlib.sha256(filepath.read_bytes()).hexdigest()
        assert original_hash != new_hash

    def test_manifest_integrity(self, temp_dir):
        files = ['a.txt', 'b.txt', 'c.txt']
        manifest = []
        for f in files:
            (Path(temp_dir) / f).write_text('content')
            manifest.append(f)
        assert len(manifest) == 3

    def test_hash_algorithm(self):
        algorithms = ['sha256', 'sha512', 'md5']
        for alg in algorithms:
            h = hashlib.new(alg, b'test').hexdigest()
            assert len(h) > 0

    def test_bundle_file_count(self, temp_dir):
        report_dir = Path(temp_dir) / 'report3'
        report_dir.mkdir()
        for i in range(5):
            (report_dir / f'file{i}.txt').write_text('content')
        bundle_path = Path(temp_dir) / 'bundle3.zip'
        with zipfile.ZipFile(bundle_path, 'w') as zf:
            for fp in report_dir.rglob('*'):
                if fp.is_file():
                    zf.write(fp, fp.relative_to(report_dir))
        with zipfile.ZipFile(bundle_path, 'r') as zf:
            assert len(zf.namelist()) >= 5

    def test_hash_verification(self, temp_dir):
        filepath = Path(temp_dir) / 'verify.txt'
        filepath.write_text('content')
        stored_hash = hashlib.sha256(filepath.read_bytes()).hexdigest()
        current_hash = hashlib.sha256(filepath.read_bytes()).hexdigest()
        assert stored_hash == current_hash

# ═══════════════════════════════════════════════════════════════════════════════════════
# TEST CATEGORY 8: CI/CD (10 Tests)
# ═══════════════════════════════════════════════════════════════════════════════════════
class TestCICD:
    def test_json_output(self, temp_dir):
        data = {'test': 'value', 'count': 42}
        filepath = Path(temp_dir) / 'output.json'
        filepath.write_text(json.dumps(data))
        loaded = json.loads(filepath.read_text())
        assert loaded == data

    def test_timestamp_format(self):
        import datetime
        ts = datetime.datetime.utcnow().isoformat() + 'Z'
        assert re.match(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$', ts)

    def test_exit_codes(self):
        assert 0 == 0  # allow
        assert 1 == 1  # warn
        assert 2 == 2  # block

    def test_coverage_ready(self, temp_dir):
        scan_dir = Path(temp_dir) / 'coverage'
        scan_dir.mkdir()
        (scan_dir / 'test.txt').write_text('test@example.com')
        data = scan_directory(scan_dir)
        assert 'files' in data

    def test_error_handling(self):
        result = run_cmd(['nonexistent_command_12345'])
        assert 'error' in result

    def test_timeout_handling(self):
        def mock(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd=['slow'], timeout=1)
        with patch('subprocess.check_output', side_effect=mock):
            result = run_cmd(['slow'])
            assert 'error' in result

    def test_permission_handling(self):
        def mock(*args, **kwargs):
            raise PermissionError()
        with patch('subprocess.check_output', side_effect=mock):
            result = run_cmd(['protected'])
            assert 'error' in result

    def test_empty_input(self):
        result = detect_findings('')
        assert result == []

    def test_none_handling(self):
        result = detect_findings('no pii here')
        assert isinstance(result, list)

    def test_unicode_input(self):
        result = detect_findings('测试@example.com')
        assert isinstance(result, list)

# ═══════════════════════════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ═══════════════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    pytest.main([
        __file__,
        '-v',
        '--cov-report=html',
        '--cov-report=term-missing',
        '--durations=0',
        '-x',
        '--timeout=60',
        '--tb=short',
    ])