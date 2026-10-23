# Building and Shipping the Windows Installer (D3.1)

This guide explains how to turn the `D3.1-installer` branch into a Windows package (`dashboard.exe` plus support files) and how to deliver it to a customer.

The package is a **portable app**: the customer unzips it and runs `dashboard.exe`. It needs no installation, Python or Docker.

---

## 1. How the package works

| File / folder | Purpose |
|---|---|
| `dashboard.exe` | The whole app (Flask server, SNMP poller and a native window), built with PyInstaller from `desktop.py` |
| `config.json` | Modem IPs and SNMP community strings. The customer edits this file |
| `snmp_bin\` | Net-SNMP Windows tools (`snmpget.exe`, `snmpwalk.exe`, `snmpset.exe`) that the app calls |
| `logs\` | Created on first run: chart data (`cpu_usage.log`, `free_memory.log`, `throughput.log`, `wan0_stats.log`, ...) |
| `modem_monitor.log` | Created on first run: application log, rotated at 1 MB with 3 backups |

`dashboard.exe` looks for `config.json` and `snmp_bin\` **in its own folder**, so those three items must always be shipped together.

---

## 2. One-time setup on the build PC

Requirements:

- Windows 10/11 (64-bit)
- Python 3.10 or newer (the current builds use Python 3.14)
- Git

Install the Python dependencies:

```bat
python -m pip install flask "paramiko==4.0.0" pywebview pyinstaller
```

> **paramiko must stay at 4.0.0.** paramiko 5.x removed the `ssh-rsa` host-key type, which is the only one the modem's old Dropbear SSH server offers. With paramiko 5.x, the Memory Leak Test can't connect.

> If the `pyinstaller` command is "not recognized", either always use `python -m PyInstaller ...` (as below), or add Python's `Scripts` folder to your PATH, e.g.
> `C:\Users\<you>\AppData\Local\Python\pythoncore-3.14-64\Scripts`.

---

## 3. Build the exe

```bat
git clone https://github.com/fayazap/Gateway-Selfheal-Dashboard.git --branch D3.1-installer
cd Gateway-Selfheal-Dashboard
python -m PyInstaller --clean -y dashboard.spec
```

The result is `dist\dashboard.exe` (about 20 MB). `build\` holds intermediate files only and is never shipped.

### Test before shipping

Run it from source first if you changed code:

```bat
python desktop.py
```

Then test the built exe the same way the customer will use it (see step 4): assemble the release folder, start `dashboard.exe` and check that:

- the dashboard window opens and the CPU, memory and throughput charts fill in within about 10 seconds
- the SNMP data tab shows values, not "Unable to connect to modem"
- the WAN Interface Status shows `Reachable: True`
- the Configuration tab "Update" buttons work (if the customer will use them)

---

## 4. Assemble the release package

From the repo root, after the build:

```bat
set REL=D3.1 Selfheal Dashboard v1.0
mkdir "release\%REL%"
copy dist\dashboard.exe          "release\%REL%\"
copy config.json                 "release\%REL%\"
xcopy /E /I /Y snmp_bin          "release\%REL%\snmp_bin"
```

Then, in `release\%REL%\`:

1. **Edit `config.json`** with the customer's defaults (see section 6). Don't ship your lab IPs by mistake.
2. **Add `Changes.txt`** with release notes: one line per change since the last release (the commit subjects from `git log --oneline <last-release>..HEAD` are a good start).
3. **Check that no runtime files have slipped in**: there must be no `logs\` folder, `modem_monitor.log*`, `build\` or `__pycache__\`. They are created on the customer's PC on first run.

Final layout:

```
D3.1 Selfheal Dashboard v1.0\
├── dashboard.exe
├── config.json
├── Changes.txt
└── snmp_bin\
    ├── snmpget.exe
    ├── snmpset.exe
    └── snmpwalk.exe
```

Zip it with PowerShell (or right-click → *Send to → Compressed (zipped) folder*):

```powershell
Compress-Archive -Path "release\D3.1 Selfheal Dashboard v1.0" -DestinationPath "release\D3.1 Selfheal Dashboard v1.0.zip" -Force
```

---

## 5. Ship to the customer

1. **Tag the release** so the shipped build can always be reproduced:
   ```bat
   git tag -a d3.1-installer-v1.0 -m "D3.1 Selfheal Dashboard v1.0"
   git push origin d3.1-installer-v1.0
   ```
2. **Deliver the zip** by your usual channel (shared drive, email, or attach it to a GitHub Release for the tag above). Don't commit the zip or `dist\` to the repo: `.gitignore` already excludes them.
3. **Send the customer the instructions** in section 7 (you can paste them into the email).

---

## 6. `config.json` reference

```json
{
    "cm_ip": "192.168.0.1",
    "snmp_community": "public",
    "snmp_write_community": "private",
    "snmp_version": "2c",
    "snmp_port": 161,
    "mta_community": "dilip-one",
    "mta_ip": "192.168.246.73",
    "ssh_username": "root",
    "ssh_password": "********",
    "ssh_port": 22
}
```

| Key | Used for |
|---|---|
| `cm_ip` | Cable modem IP: all SNMP polling, ping reachability and the Memory Leak Test SSH target |
| `snmp_community` | SNMP read community |
| `snmp_write_community` | SNMP write community for the Configuration tab and SSH enable/disable (falls back to `snmp_community` if missing) |
| `mta_community`, `mta_ip` | MTA SNMP access (DQoS, currently disabled in the UI) |
| `snmp_version`, `snmp_port`, `ssh_username`, `ssh_password`, `ssh_port` | **Currently not read by the code.** SNMP always uses v2c on port 161, and the SSH credentials are hard-coded in `app.py`. Keep the keys for future use |

Any key missing from `config.json` falls back to the defaults in `config_loader.py`.

> **Restart the app after editing `config.json`.** The background poller picks up changes on its next cycle, but the dashboard pages and SNMP set commands only read the file at startup.

---

## 7. Customer instructions (copy into your email)

> **Installing**
> 1. Unzip the package to any folder you can write to, e.g. `C:\SelfhealDashboard`. Don't run it from inside the zip, and avoid `C:\Program Files` (the app writes its logs next to the exe).
> 2. Open `config.json` in Notepad and set `cm_ip` to your modem's IP address and the SNMP community strings for your network. Save the file.
> 3. Double-click `dashboard.exe`. A console window and the dashboard window will open. Keep the console window open: closing it closes the app.
>
> **Requirements**
> - Windows 10 or 11, 64-bit
> - Microsoft Edge WebView2 Runtime (already present on most Windows 10/11 PCs; if the window stays blank, install it from https://developer.microsoft.com/microsoft-edge/webview2/)
> - The PC must reach the modem over the network: SNMP (UDP 161), ping (ICMP), and SSH (TCP 22) for the Memory Leak Test
>
> **First run notes**
> - Windows SmartScreen may say "Windows protected your PC" because the exe is not code-signed. Click **More info → Run anyway**.
> - Windows Firewall may ask about network access. Allow it on private networks.
>
> **If something goes wrong**, please send us `modem_monitor.log` and the `logs` folder from the app folder.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `'pyinstaller' is not recognized` | Use `python -m PyInstaller dashboard.spec` (see section 2) |
| Exe starts then closes immediately | Run it from a Command Prompt to see the error. Usually `config.json` has a JSON syntax error (e.g. a trailing comma) |
| Window opens but stays blank | WebView2 Runtime is missing. Install it (section 7) |
| Every value shows "Unable to connect to modem" | Wrong `cm_ip` or community string, `snmp_bin\` missing next to the exe, or a firewall blocking UDP 161 |
| WAN status shows `Reachable: False` | The PC can't ping `cm_ip` (ICMP blocked or wrong IP) |
| Memory Leak Test fails to connect over SSH | Check that paramiko 4.0.0 was used for the build, and that `snmp_write_community` is correct (SSH is enabled through an SNMP set first) |
| Antivirus quarantines `dashboard.exe` | A known false positive with PyInstaller onefile + UPX builds. Whitelist it, or rebuild with `upx=False` in `dashboard.spec` |
| TFTP Log Server / Diagnostic Log Upload show wrong values | Modem firmware and dashboard MIBs don't match. This build uses `tinnoLogUploadServer` (`.1.75.2`) and `tinnoLogUploadStatus` (`.1.76`) |

---

## 9. Keeping the installer up to date with D3.1

New dashboard features land on the `D3.1` branch first. To bring them into the installer:

```bat
git checkout D3.1-installer
git fetch origin
git merge origin/D3.1
```

When resolving conflicts, keep the installer-specific changes:

- `get_bin_path("snmpwalk.exe")` and its siblings, not bare `"snmpwalk"` / `"snmpset"`
- settings from `CONFIG[...]` (`config_loader`), not `argparse`
- `resource_path(...)` for `templates` / `static`
- log files under `logs\` (`utils._log_path`)

Then rebuild (section 3), bump the version in the release folder name, update `Changes.txt`, and tag the release.
