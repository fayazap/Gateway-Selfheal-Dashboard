"""snmp.py — thin wrappers around the net-snmp command-line tools.

The whole tinnoCfgEntry row is read with ONE snmpwalk (≈0.3 s on the D4.0
eMTA) instead of one snmpwalk process per object, and parsed into
{column: value}. Multi-line strings (tinnoADProcessData) and Hex-STRING
values are handled.
"""
import re
import subprocess
import logging

from snmp_bin_path import get_bin_path

logger = logging.getLogger(__name__)

TINNO_CFG_ENTRY = "1.3.6.1.4.1.62596.1.1.1"
SNMP_TIMEOUT = 20      # seconds for a whole command (walk of ~75 objects)

_LINE_RE = re.compile(r'^\.?1\.3\.6\.1\.4\.1\.62596\.1\.1\.1\.(\d+)\.(\d+)\s*=\s*(.*)$')
_ANY_OID_RE = re.compile(r'^\.?\d+(\.\d+)+\s*=')


class SnmpError(Exception):
    pass

# In the installed (windowed) app every console tool would otherwise flash a
# console window; CREATE_NO_WINDOW only exists on Windows.
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

def _run(args, timeout=SNMP_TIMEOUT):
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                             errors="replace", creationflags=NO_WINDOW)
    except FileNotFoundError:
        raise SnmpError("%s not found" % args[0])
    except subprocess.TimeoutExpired:
        raise SnmpError("timeout")
    if out.returncode != 0:
        msg = (out.stderr or out.stdout or "").strip() or "exit %d" % out.returncode
        if "Timeout" in msg:
            msg = "the modem did not answer SNMP (check the IP address and community)"
        raise SnmpError(msg)
    if "Timeout: No Response" in out.stdout or "Timeout: No Response" in out.stderr:
        raise SnmpError("the modem did not answer SNMP")
    return out.stdout


def _decode_value(typed):
    """'INTEGER: 1' -> '1', 'STRING: "a b"' -> 'a b', 'Hex-STRING: 41 42' -> 'AB'."""
    if ":" not in typed:
        v = typed.strip()
        return "" if v in ('""', "") else v.strip('"')
    typ, val = typed.split(":", 1)
    typ = typ.strip()
    val = val.strip()
    if typ == "Hex-STRING":
        try:
            return bytes(int(b, 16) for b in val.split()).decode("utf-8", "replace").rstrip("\x00")
        except ValueError:
            return val
    if typ in ("STRING", "OCTET STRING"):
        if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
            val = val[1:-1]
        return val.replace('\\"', '"')
    # INTEGER: 1 / INTEGER: enable(1) / Counter32: 5 / Gauge32: 3
    m = re.search(r'\((-?\d+)\)\s*$', val)
    return m.group(1) if m else val


def walk_tinno(host, community, instance=2):
    """{column_number: value_string} for every tinnoCfgEntry object of the
    given instance. Raises SnmpError when the modem does not answer."""
    out = _run([get_bin_path("snmpwalk.exe"), "-v", "2c", "-c", community,
                "-On", "-t", "3", "-r", "1", host, TINNO_CFG_ENTRY])
    records = []                     # [col, inst, raw_text]
    for line in out.splitlines():
        m = _LINE_RE.match(line)
        if m:
            records.append([int(m.group(1)), int(m.group(2)), m.group(3)])
        elif records and not _ANY_OID_RE.match(line):
            records[-1][2] += "\n" + line          # continuation of a multi-line string
    values = {}
    for col, inst, raw in records:
        if inst == instance:
            values[col] = _decode_value(raw)
    if not values:
        raise SnmpError("no tinnoCfgEntry values returned")
    return values


def get_values(host, community, oids):
    """snmpget several full OIDs in one call -> {oid: value} (missing ones omitted)."""
    out = _run([get_bin_path("snmpget.exe"), "-v", "2c", "-c", community,
                "-On", "-t", "3", "-r", "1", host] + list(oids))
    result = {}
    for line in out.splitlines():
        if "=" not in line:
            continue
        oid, typed = line.split("=", 1)
        oid = oid.strip().lstrip(".")
        if "No Such" in typed:
            continue
        result[oid] = _decode_value(typed.strip())
    return result


def set_value(host, community, oid, typ, value):
    try:
        return _run([get_bin_path("snmpset.exe"), "-v", "2c", "-c", community,
                     "-t", "5", "-r", "1", host, oid, typ, str(value)])
    except SnmpError as e:
        if "did not answer" in str(e) or str(e) == "timeout":
            # Reads work, so a silent SET almost always means the agent dropped the
            # request: wrong write community (SNMPv2c agents do not reply to it).
            raise SnmpError("the modem did not answer the SNMP SET - check "
                            "snmp_write_community in config.json")
        raise
