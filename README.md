# eMTA Self-Healing Dashboard — DOCSIS 4.0

Web dashboard for the D4.0 eMTA (RDK-B, Puma 8) self-heal feature and the AI
Anomaly Detection (AD) agent. Everything is read and set over SNMP
(TINNO-MIB `tinnoCfgEntry`, instance `.2`); anomaly details and the AD test use SSH.

## Pages

**Health** — three parts, one per self-heal function, plus one event timeline:

- *Resource Monitoring* — AI Anomaly Detection is the resource monitor; the self-heal
  CPU/memory thresholds are shown as the safety net on the live gauges. Shows the model
  state (learning / trained, days of data), anomaly count, corrective action, the last 10
  anomalies, a CPU/memory chart and the top processes. **Click an anomaly** to open its
  details: why it was flagged (value vs limit, samples in a row, baseline for known
  processes), usage in the minutes before detection, the process state at detection
  (VmRSS, threads, FDs, parent, run time), what AD did and the log upload. *Run AD test*
  starts a new process over the memory limit and waits for AD to report it.
- *Connectivity Test* — schedule, ping servers, action on failure, reboots today and the
  recent failures.
- *Throughput Test* — last result, threshold, schedule, server, a throughput chart and
  *Run speed test now* (tinnoSpeedtestStart).
- *Events* — reboots, log uploads (including the AD triggers) and anomalies, filterable by
  function. AD entries open the anomaly details.

**Settings** — the same three parts plus a General strip (self-heal on/off, TFTP log server,
maintenance window, SSH). Change any fields, then Save once; values are validated before
the SNMP SET.


### Anomaly details — what the modem must provide

| Data | Source | Needs |
|---|---|---|
| List of the last 10 anomalies | `tinnoADAnomalyHistory` (.77) | patch 1048 |
| Model state / days | `tinnoADModelStatus` (.78), `tinnoADModelDays` (.79) | patch 1048 |
| Full report per anomaly | `/log/anomaly_logs/reports/*.txt` on the modem, read over SSH when opened, then cached in `logs/ad_reports/` | AD patch 0017 |

Without 1048 the list is built from the AD log uploads and the latest anomaly (existing MIBs); details still open when the report is on the modem.

## Configuration — `config.json`

| Key | Meaning |
|---|---|
| `cm_ip` | Modem (CM) IP address |
| `snmp_community` / `snmp_write_community` | Read / write communities |
| `snmp_instance` | Instance of the tinnoCfgEntry objects (CATV MAC ifIndex, 2) |
| `ssh_username` / `ssh_password` / `ssh_port` | SSH login for anomaly details and the AD test |

In Docker, the environment variables `SNMP_HOST`, `SNMP_COMMUNITY`,
`SNMP_WRITE_COMMUNITY`, `SSH_USERNAME`, `SSH_PASSWORD` and `SSH_PORT` override `config.json`.

## Run

**Windows desktop app** (PyInstaller): `pyinstaller dashboard.spec`, then put
`config.json` and the `snmp_bin` folder next to `dist/dashboard.exe`.

**Python**: `pip install -r requirements.txt`, then `python desktop.py` (window) or
`python main.py` + `python app.py` (browser at http://127.0.0.1:5050/).
On Linux the system net-snmp tools are used (`apt install snmp`).

**Docker**:
```bash
docker build -t selfheal-dashboard .
docker run -p 5050:5050 -e SNMP_HOST=192.168.100.1 -e SNMP_COMMUNITY=public \
    -e SNMP_WRITE_COMMUNITY=private -e SSH_PASSWORD=<password> selfheal-dashboard
```

Chart.js, the icon font and the web fonts load from a CDN. Without internet the dashboard still
works; only the charts and icons are missing.
