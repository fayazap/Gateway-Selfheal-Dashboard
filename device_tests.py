"""device_tests.py — on-device tests started from the dashboard.

anomaly  Anomaly Detection: a NEW process takes a little more memory than
         tinnoADNewProcMemThreshold, and the test waits for
         tinnoADAnomalyCount to go up with that process as the last anomaly.

It uses one test process (python3, a few MB/s of real, touched memory - a
tmpfs file would not count as process or "used" memory on D4.0), started
over SSH, and always stopped and removed at the end. SSH access
(tinnoCmDoc31AccessSshEnable) is turned on for the test and restored to
its previous value.
"""
import os
import re
import time
import uuid
import socket
import logging
import threading

import snmp
from snmp import SnmpError

logger = logging.getLogger(__name__)

TESTS = ("anomaly",)

_lock = threading.Lock()
_cancel = threading.Event()
_state = {"running": False, "test": None, "stage": "", "log": [], "ok": None,
          "result": None, "started": None, "finished": None}


def status():
    with _lock:
        return dict(_state, log=list(_state["log"][-40:]))


def cancel():
    _cancel.set()


def _log(msg):
    logger.info("[test] %s", msg)
    with _lock:
        _state["stage"] = msg
        _state["log"].append({"t": time.strftime("%H:%M:%S"), "msg": msg})


def start(name, cfg, oid_of):
    with _lock:
        if _state["running"]:
            return False, "Another test is already running."
        _state.update(running=True, test=name, stage="Starting...", log=[], ok=None,
                      result=None, started=time.strftime("%Y-%m-%d %H:%M:%S"), finished=None)
    _cancel.clear()
    target = _anomaly_test
    threading.Thread(target=_run, args=(target, cfg, oid_of), daemon=True).start()
    return True, None


def _run(target, cfg, oid_of):
    ok, result = False, None
    try:
        ok, result = target(cfg, oid_of)
    except _Cancelled:
        ok, result = False, "Test cancelled."
    except SnmpError as e:
        ok, result = False, "SNMP error: %s" % e
    except Exception as e:                           # noqa: BLE001 - report anything
        logger.exception("test failed")
        ok, result = False, "Test failed: %s" % e
    with _lock:
        _state.update(running=False, ok=ok, result=result,
                      finished=time.strftime("%Y-%m-%d %H:%M:%S"))
    _log(("PASSED: " if ok else "FAILED: ") + (result or ""))


class _Cancelled(Exception):
    pass


def _sleep(seconds):
    if _cancel.wait(seconds):
        raise _Cancelled()


# ---------------------------------------------------------------------------
# SNMP helpers bound to the configured modem
# ---------------------------------------------------------------------------
class _Snmp(object):
    def __init__(self, cfg, oid_of):
        self.host = cfg["cm_ip"]
        self.ro = cfg["snmp_community"]
        self.rw = cfg.get("snmp_write_community") or cfg["snmp_community"]
        self.oid_of = oid_of

    def get(self, *keys):
        oids = [self.oid_of(k) for k in keys]
        vals = snmp.get_values(self.host, self.ro, oids)
        return {k: vals.get(o) for k, o in zip(keys, oids)}

    def set(self, key, typ, value):
        snmp.set_value(self.host, self.rw, self.oid_of(key), typ, value)


_HIST_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*-\s*([A-Za-z0-9_]+)(?:\s*-\s*([A-Za-z0-9_]+))?')


def _history(raw):
    return [m.groups() for m in _HIST_RE.finditer(raw or "")]


# ---------------------------------------------------------------------------
# SSH shell on the modem
# ---------------------------------------------------------------------------
# The modem's Dropbear may only offer legacy algorithms; allow them
# explicitly (paramiko must be 4.x - 5.x removed "ssh-rsa").
_KEY_TYPES = ["ssh-rsa", "rsa-sha2-256", "rsa-sha2-512", "ecdsa-sha2-nistp256",
              "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "ssh-ed25519"]
_KEX = ["curve25519-sha256", "curve25519-sha256@libssh.org",
        "diffie-hellman-group14-sha256", "diffie-hellman-group14-sha1",
        "diffie-hellman-group-exchange-sha256", "diffie-hellman-group-exchange-sha1",
        "diffie-hellman-group1-sha1", "ecdh-sha2-nistp256", "ecdh-sha2-nistp384",
        "ecdh-sha2-nistp521"]
_CIPHERS = ["aes128-ctr", "aes192-ctr", "aes256-ctr", "aes128-cbc", "aes256-cbc", "3des-cbc"]


class DeviceShell(object):
    def __init__(self, cfg, quiet=False):
        self.cfg = cfg
        self.quiet = quiet
        self.transport = None
        self.chan = None
        self.pid = None          # test process started on the modem (for cleanup)
        self.path = None
        self.exec_mode = False

    def open(self):
        import paramiko
        host, port = self.cfg["cm_ip"], int(self.cfg.get("ssh_port", 22))
        last = None
        for attempt in range(3):
            try:
                sock = socket.create_connection((host, port), timeout=10)
                t = paramiko.Transport(sock)
                t.banner_timeout = 60
                t.auth_timeout = 30
                sec = t.get_security_options()
                for attr, wanted in (("key_types", _KEY_TYPES), ("kex", _KEX), ("ciphers", _CIPHERS)):
                    supported = [a for a in wanted if a in getattr(sec, attr)]
                    if supported:
                        setattr(sec, attr, supported)
                t.connect(username=self.cfg.get("ssh_username", "root"),
                          password=self.cfg.get("ssh_password", ""))
                self.transport = t
                break
            except Exception as e:                   # noqa: BLE001
                last = e
                if self.quiet:
                    logger.warning("SSH attempt %d failed: %s", attempt + 1, e)
                    time.sleep(3)
                else:
                    _log("SSH attempt %d failed: %s" % (attempt + 1, e))
                    _sleep(3)
        if not self.transport:
            raise RuntimeError("cannot open SSH to %s:%d (%s)" % (host, port, last))
        # Preferred: one SSH "exec" channel per command - no prompt or echo handling.
        try:
            if "__OK__" in self._exec("echo __OK__", 15):
                self.exec_mode = True
                self.chan = True                     # marks the shell as open (cleanup)
                return
        except Exception as e:                       # noqa: BLE001
            logger.info("SSH exec not usable (%s); using an interactive shell", e)
        self.chan = self.transport.open_session()
        self.chan.get_pty(width=250, height=50)
        self.chan.invoke_shell()
        banner = self._read_until(("mainMenu>", "#", "$ "), 20)
        if "mainMenu>" in banner:                    # vendor CLI first: drop to the shell
            self.chan.send("shell\n")
            self._read_until(("#", "$ "), 15)
        # quiet, predictable shell
        self.run("export PS1='# '; stty -echo 2>/dev/null; true", 10)

    def _read_until(self, markers, timeout):
        buf, end = "", time.time() + timeout
        while time.time() < end:
            if self.chan.recv_ready():
                buf += self.chan.recv(65536).decode("utf-8", "replace")
                if any(m in buf for m in markers):
                    break
            else:
                time.sleep(0.1)
        return buf

    def _exec(self, cmd, timeout):
        ch = self.transport.open_session()
        try:
            ch.settimeout(timeout)
            ch.exec_command(cmd)
            out, end = b"", time.time() + timeout
            while time.time() < end:
                if ch.recv_ready():
                    out += ch.recv(65536)
                elif ch.recv_stderr_ready():
                    ch.recv_stderr(65536)
                elif ch.exit_status_ready():
                    while ch.recv_ready():
                        out += ch.recv(65536)
                    return out.decode("utf-8", "replace").replace("\r", "").strip()
                else:
                    time.sleep(0.05)
            raise RuntimeError("command timed out on the modem: %s" % cmd[:60])
        finally:
            ch.close()

    def run(self, cmd, timeout=30):
        """Run one command, return its output (without the echoed command)."""
        if self.exec_mode:
            return self._exec(cmd, timeout)
        token = uuid.uuid4().hex[:10]
        done = "__END_%s__" % token
        self.chan.send('%s; echo "__E""ND_%s__"\n' % (cmd, token))
        buf, end = "", time.time() + timeout
        while time.time() < end:
            if self.chan.recv_ready():
                buf += self.chan.recv(65536).decode("utf-8", "replace")
                if done in buf:
                    break
            else:
                time.sleep(0.1)
        else:
            tail = " ".join(buf.replace("\r", "").split())[-120:]
            raise RuntimeError("command timed out on the modem: %s (modem sent: %s)"
                               % (cmd[:60], tail or "nothing"))
        out = buf[:buf.index(done)]
        echo_end = out.find('ND_%s__"' % token)       # skip the echoed command line
        if echo_end >= 0:
            nl = out.find("\n", echo_end)
            out = out[nl + 1:] if nl >= 0 else ""
        return out.replace("\r", "").strip()

    def close(self):
        try:
            if self.chan and self.chan is not True:
                self.chan.close()
            if self.transport:
                self.transport.close()
        except Exception:                            # noqa: BLE001
            pass


# Test process: allocates and touches <bytes> over <ramp> seconds, then holds.
_HOG_LINES = [
    "import sys, time",
    "target, ramp, hold = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])",
    "chunk = 1 << 20",
    "n = max(1, target // chunk)",
    "blocks = []",
    "for i in range(n):",
    "    b = bytearray(chunk)",
    "    for j in range(0, chunk, 4096):",
    "        b[j] = 1",
    "    blocks.append(b)",
    "    time.sleep(ramp / n)",
    "time.sleep(hold)",
]


def _start_hog(sh, path, nbytes, ramp, hold):
    lines = " ".join("'%s'" % l for l in _HOG_LINES)
    sh.path = path
    sh.run("printf '%%s\\n' %s > %s" % (lines, path))
    out = sh.run("nohup python3 %s %d %d %d >/dev/null 2>&1 & echo PID=$!" % (path, nbytes, ramp, hold))
    m = re.search(r"PID=(\d+)", out)
    if not m:
        raise RuntimeError("could not start the test process: %s" % out[:200])
    sh.pid = int(m.group(1))
    return sh.pid


def _alive(sh, pid):
    # a killed child can linger as a zombie until the shell reaps it
    # (the shell may also reap it while this command runs: no status = gone)
    out = sh.run("s=$(grep '^State:' /proc/%d/status 2>/dev/null); "
                 "case \"$s\" in ''|*Z*) echo GONE;; *) echo ALIVE;; esac" % pid)
    return out.endswith("ALIVE")


def _meminfo(sh):
    """(total_kB, used_kB) exactly as self-heal computes it (busybox free)."""
    out = sh.run("free | awk 'FNR == 2 {print $2, $3}'")
    total, used = (int(x) for x in out.split()[-2:])
    return total, used


class _SshAccess(object):
    """Turn SSH access on for the test; restore the previous value afterwards.
    quiet=True: not part of a test (no test log lines, not cancellable)."""
    def __init__(self, s, quiet=False):
        self.s = s
        self.prev = None
        self.quiet = quiet

    def _log(self, msg):
        (logger.info if self.quiet else _log)(msg)

    def __enter__(self):
        self.prev = self.s.get("tinnoCmDoc31AccessSshEnable")["tinnoCmDoc31AccessSshEnable"]
        if self.prev != "1":
            self._log("Enabling SSH access on the modem...")
            self.s.set("tinnoCmDoc31AccessSshEnable", "i", 1)
            if self.quiet:
                time.sleep(8)
            else:
                _sleep(8)                             # let Dropbear start
        return self

    def __exit__(self, *exc):
        if self.prev is not None and self.prev != "1":
            try:
                self.s.set("tinnoCmDoc31AccessSshEnable", "i", self.prev)
                self._log("SSH access restored to disabled.")
            except SnmpError as e:
                self._log("Could not restore SSH access: %s" % e)


# ---------------------------------------------------------------------------
# Test 2: Anomaly Detection (new process over tinnoADNewProcMemThreshold)
# ---------------------------------------------------------------------------
def _anomaly_test(cfg, oid_of):
    s = _Snmp(cfg, oid_of)
    v = s.get("tinnoADEnable", "tinnoADNewProcMemThreshold", "tinnoADAnomalyCount",
              "tinnoADCorrectiveActionEnable", "tinnoAvgMemoryThreshold",
              "tinnoRMCorrectiveAction", "tinnoSelfhealEnable")
    if v["tinnoADEnable"] != "1":
        return False, "Anomaly Detection is disabled (tinnoADEnable = 0) - enable it first."
    ad_thr = int(v["tinnoADNewProcMemThreshold"])
    count0 = int(v["tinnoADAnomalyCount"] or 0)
    kill_on = v["tinnoADCorrectiveActionEnable"] == "1"
    sh = DeviceShell(cfg)
    with _SshAccess(s):
        try:
            return _anomaly_test_body(s, sh, v, ad_thr, count0, kill_on)
        finally:
            _cleanup(sh)

def _local_time(ts):
    """Modem timestamp (UTC, 'YYYY-mm-dd HH:MM:SS') in this PC's time zone."""
    try:
        import calendar
        return time.strftime("%Y-%m-%d %H:%M:%S",
                             time.localtime(calendar.timegm(time.strptime(ts, "%Y-%m-%d %H:%M:%S"))))
    except (TypeError, ValueError):
        return ts

def _anomaly_test_body(s, sh, v, ad_thr, count0, kill_on):
    _log("Connecting over SSH...")
    sh.open()
    total, used = _meminfo(sh)
    used_pct = used * 100.0 / total
    take_pct = ad_thr + 2.5
    after_pct = used_pct + take_pct
    rm_thr = int(v["tinnoAvgMemoryThreshold"])
    if (v["tinnoSelfhealEnable"] == "1" and v["tinnoRMCorrectiveAction"] == "1"
            and after_pct >= rm_thr):
        return False, ("This test would take the modem to about %.0f%% memory, above the "
                       "self-heal threshold (%d%%) with RM corrective action on - the "
                       "modem could reboot. Turn RM corrective action off or raise the "
                       "threshold for the test." % (after_pct, rm_thr))
    nbytes = int(total * 1024 * take_pct / 100.0)
    path = "/tmp/ad_test_%d.py" % int(time.time())
    pid = _start_hog(sh, path, nbytes, ramp=5, hold=480)
    _log("New test process PID %d is taking %d MB (%.1f%% of RAM, AD limit %d%%)."
         % (pid, nbytes >> 20, take_pct, ad_thr))
    _log("Anomaly Detection needs two samples over the limit (about 2-3 minutes)...")

    deadline = time.time() + 7 * 60
    while time.time() < deadline:
        _sleep(10)
        cur = s.get("tinnoADAnomalyCount", "tinnoADProcessCMD", "tinnoADProcessID",
                    "tinnoADMemUsage", "tinnoADProcessTimestamp")
        found = path in (cur["tinnoADProcessCMD"] or "")
        if not found and int(cur["tinnoADAnomalyCount"] or 0) > count0:
            # another anomaly reported right after ours replaces the "last anomaly"
            # objects - look in the history (TS|PID|RES|CPU|MEM|ACTION|CMD per line;
            # multi-line, so it is read with the walk)
            try:
                col, inst = (int(x) for x in s.oid_of("tinnoADAnomalyHistory").split(".")[-2:])
                hist = snmp.walk_tinno(s.host, s.ro, inst).get(col) or ""
            except SnmpError:
                hist = ""
            for line in hist.splitlines():
                f = line.split("|", 6)
                if len(f) == 7 and path in f[6]:
                    cur.update(tinnoADProcessTimestamp=f[0], tinnoADProcessID=f[1],
                               tinnoADMemUsage=f[4], tinnoADProcessCMD=f[6])
                    found = True
                    break
        if found and int(cur["tinnoADAnomalyCount"] or 0) > count0:
            _sleep(6)                              # give corrective action time
            alive = _alive(sh, pid)
            if kill_on and not alive:
                action = "the process was killed by AD corrective action"
            elif kill_on:
                action = "corrective action is on but the process is still running"
            else:
                action = "corrective action is off, so the process was left running"
            return True, ("Anomaly Detection flagged PID %s (%s) at %s: MEM %s%% "
                          "(limit %d%%); %s." % (cur["tinnoADProcessID"],
                                                 cur["tinnoADProcessCMD"],
                                                 _local_time(cur["tinnoADProcessTimestamp"]),
                                                 cur["tinnoADMemUsage"], ad_thr, action))
        _log("Waiting for Anomaly Detection... (anomalies: %s)" % cur["tinnoADAnomalyCount"])
        if not _alive(sh, pid):
            return False, "The test process ended before Anomaly Detection reported it."
    return False, "Anomaly Detection did not report the test process within 7 minutes."


def _cleanup(sh):
    if sh.chan is None:
        return
    pid, path = sh.pid, sh.path
    try:
        if pid:
            sh.run("kill %d 2>/dev/null; sleep 1; kill -9 %d 2>/dev/null; true" % (pid, pid))
        if path:
            sh.run("rm -f %s" % path)
        if pid or path:
            _log("Test process stopped and removed.")
    except Exception as e:                           # noqa: BLE001
        _log("WARNING: cleanup on the modem failed: %s" % e)
    finally:
        sh.close()


# ---------------------------------------------------------------------------
# Anomaly report (details panel): the agent keeps a copy of every report in
# /log/anomaly_logs/reports/<YYYYmmdd_HHMMSS>_<pid>.txt (last 20). Fetched
# over SSH on first request, then cached next to the dashboard (reports
# never change).
# ---------------------------------------------------------------------------
REPORT_DIR_ON_MODEM = "/log/anomaly_logs/reports"
REPORT_CACHE_DIR = os.path.join("logs", "ad_reports")
_report_lock = threading.Lock()


def _report_name(ts, pid):
    return "%s_%d.txt" % (time.strftime("%Y%m%d_%H%M%S", time.strptime(ts, "%Y-%m-%d %H:%M:%S")), pid)


def fetch_anomaly_report(cfg, oid_of, ts, pid):
    """(True, parsed_report) or (False, reason)."""
    name = _report_name(ts, pid)
    cached = os.path.join(REPORT_CACHE_DIR, name)
    if os.path.exists(cached):
        with open(cached) as f:
            return True, dict(parse_report(f.read()), source="cache")
    with _lock:
        if _state["running"]:
            return False, "A device test is running - try again when it has finished."
    if not _report_lock.acquire(blocking=False):
        return False, "Another report is being fetched - try again in a moment."
    try:
        s = _Snmp(cfg, oid_of)
        sh = DeviceShell(cfg, quiet=True)
        with _SshAccess(s, quiet=True):
            try:
                sh.open()
                text = sh.run("cat %s/%s 2>/dev/null || echo __NO_REPORT__"
                              % (REPORT_DIR_ON_MODEM, name), timeout=20)
            finally:
                sh.close()
        if "__NO_REPORT__" in text or "=====LOG=====" not in text:
            return False, ("The detailed report is no longer on the modem (only the last 20 are "
                           "kept, and they are cleared by a factory reset).")
        os.makedirs(REPORT_CACHE_DIR, exist_ok=True)
        with open(cached, "w") as f:
            f.write(text)
        return True, dict(parse_report(text), source="modem")
    except (SnmpError, RuntimeError, OSError) as e:
        return False, "Could not read the report from the modem: %s" % e
    except Exception as e:                           # noqa: BLE001
        logger.exception("report fetch failed")
        return False, "Could not read the report from the modem: %s" % e
    finally:
        _report_lock.release()


_RULE_RE = re.compile(
    r'^(CPU|MEM)\s*:\s*value\s+([\d.]+)%(?:\s+baseline\s+([\d.]+)%\s+variation\s+([\d.]+))?'
    r'\s+limit\s+([\d.]+)%\s+\((.*?)\)\s+over limit\s+(\d+)\s+of\s+(\d+)\s+samples in a row\s+->\s+(.+)$')
_SAMPLE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+([\d.]+)\s+([\d.]+)\s*$')


def parse_report(text):
    cfg_part, _, log_part = text.partition("=====LOG=====")
    out = {"detection_type": "", "parameters": "", "rules": [], "notes": [],
           "anomaly": {}, "process": [], "samples": [], "raw": text}
    for line in cfg_part.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("DetectionType="):
            out["detection_type"] = line.split("=", 1)[1]
            continue
        if line.startswith("K_SIGMA="):
            out["parameters"] = line
            continue
        m = _RULE_RE.match(line)
        if m:
            out["rules"].append({
                "resource": m.group(1), "value": float(m.group(2)),
                "baseline": float(m.group(3)) if m.group(3) else None,
                "variation": float(m.group(4)) if m.group(4) else None,
                "limit": float(m.group(5)), "limit_desc": m.group(6),
                "count": int(m.group(7)), "needed": int(m.group(8)), "verdict": m.group(9).strip()})
        else:
            out["notes"].append(line)
    section = None
    for line in log_part.splitlines():
        stripped = line.strip()
        h = re.match(r'^== (.+?) ==$', stripped)
        if h:
            section = h.group(1)
            continue
        if not stripped:
            continue
        if section == "Anomaly" and ":" in stripped:
            k, v = stripped.split(":", 1)
            out["anomaly"][k.strip()] = v.strip()
        elif section and section.startswith("Process at detection"):
            out["process"].append(stripped)
        elif section and section.startswith("Recent samples"):
            m = _SAMPLE_RE.match(stripped)
            if m:
                out["samples"].append({"t": m.group(1), "cpu": float(m.group(2)), "mem": float(m.group(3))})
    return out
