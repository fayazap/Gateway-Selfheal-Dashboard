"""main.py — background poller for the dashboard charts and WAN card.

Every poll_interval seconds:
    tinnoLiveCPUStat (%, averaged over two reads 5 s apart)  -> logs/cpu_usage.log
    tinnoLiveMemoryStat (%)                                  -> logs/mem_usage.log
    tinnoSpeedtestthroughput (Mbps)                          -> logs/throughput.log
    ifTable counters of ifIndex 2 + ping reachability       -> logs/wan0_stats.log
When the modem does not answer, the last known values are logged and marked.
"""
import logging
import platform
import subprocess
import time

import snmp
from snmp import SnmpError, TINNO_CFG_ENTRY
from utils import log_value
from config_loader import load_config

logging.basicConfig(level=logging.INFO)

COL_THROUGHPUT, COL_CPU, COL_MEM = 24, 51, 52
IF_IN_UCAST, IF_OUT_UCAST, IF_IN_DISCARDS, IF_OUT_DISCARDS = 11, 17, 13, 19

last_known = {"cpu": 0.0, "mem": 0.0, "throughput": 0,
              "rx": 0, "tx": 0, "rx_d": 0, "tx_d": 0}


def check_host_reachability(hostname):
    if platform.system().lower() == "windows":
        cmd = ["ping", "-n", "2", "-w", "1000", hostname]
    else:
        cmd = ["ping", "-c", "2", "-W", "1", hostname]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10,
                           creationflags=snmp.NO_WINDOW)
        return "TTL=" in r.stdout or "ttl=" in r.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False


def _num(v, cast=float):
    try:
        return cast(float(v))
    except (TypeError, ValueError):
        return None


def get_modem_stats(host, community, instance=2):
    pingable = check_host_reachability(host)
    tinno = lambda col: "%s.%d.%d" % (TINNO_CFG_ENTRY, col, instance)
    ifoid = lambda col: "1.3.6.1.2.1.2.2.1.%d.%d" % (col, instance)
    # SNMP is tried even when ping fails (ICMP may be filtered or ping missing);
    # the modem counts as reachable if either answers.
    stale = True
    try:
        first = snmp.get_values(host, community, [tinno(COL_CPU)])
        time.sleep(5)
        vals = snmp.get_values(host, community, [
            tinno(COL_CPU), tinno(COL_MEM), tinno(COL_THROUGHPUT),
            ifoid(IF_IN_UCAST), ifoid(IF_OUT_UCAST),
            ifoid(IF_IN_DISCARDS), ifoid(IF_OUT_DISCARDS)])
        cpus = [c for c in (_num(first.get(tinno(COL_CPU))), _num(vals.get(tinno(COL_CPU))))
                if c is not None]
        if cpus:
            last_known["cpu"] = sum(cpus) / len(cpus)
        for key, oid, cast in (("mem", tinno(COL_MEM), float),
                               ("throughput", tinno(COL_THROUGHPUT), int),
                               ("rx", ifoid(IF_IN_UCAST), int),
                               ("tx", ifoid(IF_OUT_UCAST), int),
                               ("rx_d", ifoid(IF_IN_DISCARDS), int),
                               ("tx_d", ifoid(IF_OUT_DISCARDS), int)):
            v = _num(vals.get(oid), cast)
            if v is not None:
                last_known[key] = v
        stale = False
    except SnmpError as e:
        logging.warning("SNMP poll of %s failed: %s", host, e)
    reachable = pingable or not stale

    log_value("cpu_usage.log", last_known["cpu"], "%", is_last_known=stale)
    log_value("mem_usage.log", last_known["mem"], "%", is_last_known=stale)
    log_value("throughput.log", last_known["throughput"], "Mbps", is_last_known=stale)
    log_value("wan0_stats.log",
              "IP address:%s RX packets:%d TX packets:%d RX dropped:%d TX dropped:%d Reachable:%s"
              % (host if reachable else "Unknown", last_known["rx"], last_known["tx"],
                 last_known["rx_d"], last_known["tx_d"], reachable),
              "", overwrite=True, is_last_known=stale)
    logging.info("poll %s: CPU %.1f%% MEM %.1f%% throughput %s Mbps%s", host, last_known["cpu"],
                 last_known["mem"], last_known["throughput"], " (last known)" if stale else "")
    return dict(last_known, stale=stale)


def run_monitor_loop(poll_interval=10):
    """Poll forever. Re-reads config.json each iteration so a device IP or
    community changed in config.json takes effect on the next poll."""
    while True:
        try:
            cfg = load_config()
            get_modem_stats(cfg["cm_ip"], cfg["snmp_community"], int(cfg.get("snmp_instance", 2)))
        except Exception as e:                       # noqa: BLE001 - keep polling
            logging.error("Monitor loop error: %s", e)
        time.sleep(poll_interval)


if __name__ == "__main__":
    try:
        run_monitor_loop()
    except KeyboardInterrupt:
        pass
