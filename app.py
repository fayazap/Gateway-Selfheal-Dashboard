"""Self-Healing Dashboard (DOCSIS 4.0 eMTA) — Flask backend.

Reads the whole tinnoCfgEntry row with one snmpwalk, exposes it to the page
as structured JSON (selfheal, anomaly detection, histories), applies
single-object SNMP SETs from the Configure tab (whitelisted and validated),
and runs the two on-device tests over SSH (selfheal memory threshold and
Anomaly Detection).
"""
from flask import Flask, render_template, jsonify, request
import os
import re
import sys
import time
import logging
import logging.handlers
import threading

import snmp
from snmp import SnmpError, TINNO_CFG_ENTRY
from utils import read_log_data
from config_loader import load_config
import device_tests


def resource_path(*parts):
    """Path to a bundled read-only resource (templates/, static/). Uses the
    PyInstaller temp extraction dir when frozen, this file's directory
    otherwise."""
    base = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)


app = Flask(
    __name__,
    template_folder=resource_path('templates'),
    static_folder=resource_path('static'),
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.handlers.RotatingFileHandler('modem_monitor.log', maxBytes=1_000_000, backupCount=3),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# D4.0 TINNO-MIB: tinnoCfgEntry column numbers (instance = CATV MAC ifIndex)
# ---------------------------------------------------------------------------
COLUMNS = {
    "tinnoCmDoc31AccessSshEnable": 12,
    "tinnoSpeedtestUrl": 16,
    "tinnoSpeedtestServerPort": 17,
    "tinnoSpeedtestStart": 22,
    "tinnoSpeedTestStatus": 23,
    "tinnoSpeedtestthroughput": 24,
    "tinnoSelfhealEnable": 25,
    "tinnoSelfhealRMRebootWindow": 26,
    "tinnoRMInterval": 27,
    "tinnoAvgMemoryThreshold": 28,
    "tinnoAvgMemoryThresholdMW": 29,
    "tinnoAvgCPUThreshold": 30,
    "tinnoAvgCPUThresholdMW": 31,
    "tinnoMaxRMRebootCount": 32,
    "tinnoMaxConnRebootCount": 33,
    "tinnoRMCorrectiveAction": 34,
    "tinnoSHConnTestEnable": 35,
    "tinnoConnTestPingInterval": 36,
    "tinnoConnTestCorrectiveAction": 37,
    "tinnoIPv4PingServer": 38,
    "tinnoIPv6PingServer": 39,
    "tinnoSHSpeedTestEnable": 40,
    "tinnoSHSpeedTestInterval": 41,
    "tinnoSHSpeedTestThreshold": 42,
    "tinnoSHIsLowThroughput": 43,
    "tinnoTemperatureThreshold": 44,
    "tinno24HrConnRebootCount": 45,
    "tinno24HrRMRebootCount": 46,
    "tinnoLastRebootReason": 47,
    "tinnoLastRebootCounter": 48,
    "tinnoLastActionTakenTime": 49,
    "tinnoHistoricalRebootReason": 50,
    "tinnoLiveCPUStat": 51,
    "tinnoLiveMemoryStat": 52,
    "tinnoADEnable": 58,
    "tinnoADProcessData": 59,
    "tinnoADProcessTimestamp": 60,
    "tinnoADProcessID": 61,
    "tinnoADProcessCMD": 62,
    "tinnoADCPUUsage": 63,
    "tinnoADMemUsage": 64,
    "tinnoADCPUAvg": 65,
    "tinnoADCPUMin": 66,
    "tinnoADCPUMax": 67,
    "tinnoADMemAvg": 68,
    "tinnoADMemMin": 69,
    "tinnoADMemMax": 70,
    "tinnoADAnomalyCount": 71,
    "tinnoADNewProcCPUThreshold": 72,
    "tinnoADNewProcMemThreshold": 73,
    "tinnoADCorrectiveActionEnable": 74,
    "tinnoLogUploadServer": 75,
    "tinnoLogUploaderStatus": 76,
    "tinnoADAnomalyHistory": 77,
    "tinnoADModelStatus": 78,
    "tinnoADModelDays": 79,
}


def oid_of(key, instance=None):
    if instance is None:
        instance = int(load_config().get("snmp_instance", 2))
    return "%s.%d.%d" % (TINNO_CFG_ENTRY, COLUMNS[key], instance)


# Objects the Configure tab may SET: SNMP type and a validator returning an
# error message (or None). Anything else is refused.
def _int_range(lo, hi):
    def check(v):
        try:
            n = int(v)
        except (TypeError, ValueError):
            return "must be a whole number"
        return None if lo <= n <= hi else "must be between %d and %d" % (lo, hi)
    return check


def _bool01(v):
    return None if str(v) in ("0", "1") else "must be 0 or 1"


def _window(v):
    return None if re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d', str(v)) \
        else "must look like HH:MM-HH:MM"


def _host(allow_empty=False):
    def check(v):
        v = str(v).strip()
        if not v:
            return None if allow_empty else "must not be empty"
        return None if re.fullmatch(r'[0-9A-Za-z.:\-]{1,253}', v) else "is not a valid address"
    return check


WRITABLE = {
    "tinnoSelfhealEnable": ("i", _bool01),
    "tinnoMaxConnRebootCount": ("i", _int_range(0, 100)),
    "tinnoSHConnTestEnable": ("i", _bool01),
    "tinnoConnTestPingInterval": ("i", _int_range(1, 1440)),
    "tinnoConnTestCorrectiveAction": ("i", _bool01),
    "tinnoIPv4PingServer": ("s", _host()),
    "tinnoIPv6PingServer": ("s", _host()),
    "tinnoSHSpeedTestEnable": ("i", _bool01),
    "tinnoSHSpeedTestInterval": ("i", _int_range(1, 10080)),
    "tinnoSHSpeedTestThreshold": ("i", _int_range(1, 10000)),
    "tinnoSpeedtestUrl": ("s", _host(allow_empty=True)),
    "tinnoSpeedtestServerPort": ("i", _int_range(0, 65535)),
    "tinnoLogUploadServer": ("s", _host(allow_empty=True)),
    "tinnoCmDoc31AccessSshEnable": ("i", _bool01),
    "tinnoADEnable": ("i", _bool01),
    "tinnoADNewProcCPUThreshold": ("i", _int_range(1, 100)),
    "tinnoADNewProcMemThreshold": ("i", _int_range(1, 100)),
    "tinnoADCorrectiveActionEnable": ("i", _bool01),
}

# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------
_HIST_RE = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*-\s*([A-Za-z0-9_]+)(?:\s*-\s*([A-Za-z0-9_]+))?\s*$')


def parse_history(raw):
    """'<ts> - <TRIGGER>[ - <STATUS>], ...' -> [{timestamp, trigger, status}], oldest first."""
    out = []
    for entry in (raw or "").split(","):
        m = _HIST_RE.match(entry.strip())
        if m:
            out.append({"timestamp": m.group(1), "trigger": m.group(2), "status": m.group(3)})
    return out


def parse_process_data(raw):
    """tinnoADProcessData 'PID CMD CPU MEM' lines -> [{pid, cmd, cpu, mem}]."""
    rows = []
    for line in (raw or "").splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        try:
            rows.append({"pid": int(parts[0]), "cmd": " ".join(parts[1:-2]),
                         "cpu": float(parts[-2]), "mem": float(parts[-1])})
        except ValueError:
            continue
    return rows


def parse_anomaly_history(raw):
    """tinnoADAnomalyHistory lines 'TS|PID|RES|CPU|MEM|ACTION|CMD' (newest first)."""
    out = []
    for line in (raw or "").splitlines():
        parts = line.split("|", 6)
        if len(parts) < 7 or not re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", parts[0]):
            continue
        out.append({"timestamp": parts[0], "pid": _to_int(parts[1]), "resource": parts[2],
                    "cpu": _to_float(parts[3]), "mem": _to_float(parts[4]),
                    "action": parts[5], "cmd": parts[6]})
    return out


def format_last_action_time(raw):
    """lastactiontime is 'MM-DD-YY HH:MM:SS' (date +"%m-%d-%y %T"); '0'/'' = never."""
    raw = (raw or "").strip()
    if raw in ("", "0"):
        return None
    for fmt in ("%m-%d-%y %H:%M:%S", "%Y%m%d%H%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return time.strftime("%Y-%m-%d %H:%M", time.strptime(raw, fmt))
        except ValueError:
            continue
    return raw


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def get_device_state():
    cfg = load_config()
    try:
        cols = snmp.walk_tinno(cfg["cm_ip"], cfg["snmp_community"], int(cfg.get("snmp_instance", 2)))
    except SnmpError as e:
        logger.error("SNMP walk failed: %s", e)
        return {"ok": False, "error": str(e), "host": cfg["cm_ip"]}

    raw = {key: cols.get(col) for key, col in COLUMNS.items()}

    last_anomaly = None
    ts = raw.get("tinnoADProcessTimestamp") or ""
    if ts and not ts.startswith("0000") and (_to_int(raw.get("tinnoADProcessID")) or 0) > 0:
        last_anomaly = {
            "timestamp": ts,
            "pid": _to_int(raw.get("tinnoADProcessID")),
            "cmd": raw.get("tinnoADProcessCMD") or "",
            "cpu": _to_float(raw.get("tinnoADCPUUsage")),
            "mem": _to_float(raw.get("tinnoADMemUsage")),
            "cpu_avg": _to_float(raw.get("tinnoADCPUAvg")),
            "cpu_min": _to_float(raw.get("tinnoADCPUMin")),
            "cpu_max": _to_float(raw.get("tinnoADCPUMax")),
            "mem_avg": _to_float(raw.get("tinnoADMemAvg")),
            "mem_min": _to_float(raw.get("tinnoADMemMin")),
            "mem_max": _to_float(raw.get("tinnoADMemMax")),
        }

    history = parse_anomaly_history(raw.get("tinnoADAnomalyHistory"))
    history_mib = raw.get("tinnoADAnomalyHistory") is not None
    if not history and last_anomaly:
        # firmware without tinnoADAnomalyHistory: at least the latest one
        history = [dict(last_anomaly, resource="", action="")]

    return {
        "ok": True,
        "host": cfg["cm_ip"],
        "ad_history": history,
        "ad_history_mib": history_mib,
        "values": raw,
        "last_action_time": format_last_action_time(raw.get("tinnoLastActionTakenTime")),
        "reboot_history": parse_history(raw.get("tinnoHistoricalRebootReason")),
        "upload_history": parse_history(raw.get("tinnoLogUploaderStatus")),
        "ad_top_processes": parse_process_data(raw.get("tinnoADProcessData")),
        "ad_last_anomaly": last_anomaly,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def api_state():
    return jsonify(get_device_state())


@app.route("/api/usage")
def api_usage():
    cfg = load_config()
    threshold = None
    try:
        key = oid_of("tinnoSHSpeedTestThreshold")
        threshold = _to_float(snmp.get_values(cfg["cm_ip"], cfg["snmp_community"], [key]).get(key))
    except SnmpError as e:
        logger.debug("threshold read failed: %s", e)
    return jsonify(dict(
        cpu=read_log_data('cpu_usage.log', max_points=60),
        memory=read_log_data('mem_usage.log', max_points=60),
        throughput=read_log_data('throughput.log', max_points=60),
        speedtest_threshold=threshold))


@app.route("/api/wan0_status")
def api_wan0_status():
    return jsonify(read_wan0_status())


@app.route("/api/snmpset", methods=["POST"])
def api_snmpset():
    data = request.get_json(silent=True) or {}
    key = data.get("oid_name")
    value = data.get("value")
    if key not in WRITABLE:
        return jsonify({"status": "error", "error": "This setting cannot be changed here."}), 400
    typ, check = WRITABLE[key]
    value = "" if value is None else str(value).strip()
    err = check(value)
    if err:
        return jsonify({"status": "error", "error": "Value %s." % err}), 400
    cfg = load_config()
    community = cfg.get("snmp_write_community") or cfg["snmp_community"]
    try:
        output = snmp.set_value(cfg["cm_ip"], community, oid_of(key), typ, value)
        logger.info("SNMP SET %s = %r: %s", key, value, output.strip())
        return jsonify({"status": "success", "output": output})
    except SnmpError as e:
        logger.error("SNMP SET %s failed: %s", key, e)
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/anomaly_report")
def api_anomaly_report():
    ts = request.args.get("ts", "")
    pid = request.args.get("pid", "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", ts) or not pid.isdigit():
        return jsonify({"ok": False, "error": "bad anomaly reference"}), 400
    ok, result = device_tests.fetch_anomaly_report(load_config(), oid_of, ts, int(pid))
    if not ok:
        return jsonify({"ok": False, "error": result})
    return jsonify(dict(ok=True, **result))


@app.route("/api/speedtest", methods=["POST"])
def api_speedtest():
    cfg = load_config()
    community = cfg.get("snmp_write_community") or cfg["snmp_community"]
    try:
        snmp.set_value(cfg["cm_ip"], community, oid_of("tinnoSpeedtestStart"), "i", 1)
        return jsonify({"status": "started"})
    except SnmpError as e:
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/speedtest/status")
def api_speedtest_status():
    cfg = load_config()
    keys = ("tinnoSpeedTestStatus", "tinnoSpeedtestthroughput", "tinnoSpeedtestStart")
    try:
        vals = snmp.get_values(cfg["cm_ip"], cfg["snmp_community"], [oid_of(k) for k in keys])
        return jsonify({"ok": True, **{k: vals.get(oid_of(k)) for k in keys}})
    except SnmpError as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/test/<name>", methods=["POST"])
def api_start_test(name):
    if name not in device_tests.TESTS:
        return jsonify({"status": "error", "error": "unknown test"}), 404
    ok, msg = device_tests.start(name, load_config(), oid_of)
    return jsonify({"status": "started" if ok else "error", "error": None if ok else msg}), \
        (202 if ok else 409)


@app.route("/api/test/status")
def api_test_status():
    return jsonify(device_tests.status())


@app.route("/api/test/cancel", methods=["POST"])
def api_test_cancel():
    device_tests.cancel()
    return jsonify({"status": "cancelling"})


# ---------------------------------------------------------------------------
# WAN status file written by main.py
# ---------------------------------------------------------------------------
def read_wan0_status():
    unknown = {
        "timestamp": "Unknown", "ip_address": "Unknown", "status": "Unknown",
        "rx_packets": "0", "tx_packets": "0", "rx_dropped": "0", "tx_dropped": "0",
    }
    try:
        with open(os.path.join('logs', 'wan0_stats.log'), 'r') as file:
            lines = file.readlines()
        if not lines:
            return unknown
        m = re.search(
            r'(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\s*'
            r'IP address:(?P<ip>[^\s]+)\s+'
            r'RX packets:(?P<rx>\d+)\s+'
            r'TX packets:(?P<tx>\d+)\s+'
            r'RX dropped:(?P<rx_d>\d+)\s+'
            r'TX dropped:(?P<tx_d>\d+)\s+'
            r'Reachable:(?P<reachable>True|False)',
            lines[-1].strip())
        if not m:
            return unknown
        return {
            "timestamp": m.group('timestamp'),
            "ip_address": m.group('ip'),
            "status": "Connected" if m.group('reachable') == "True" else "Disconnected",
            "rx_packets": m.group('rx'), "tx_packets": m.group('tx'),
            "rx_dropped": m.group('rx_d'), "tx_dropped": m.group('tx_d'),
        }
    except OSError:
        return unknown


if __name__ == "__main__":
    app.run(debug=False, host='0.0.0.0', port=5050, threaded=True)
