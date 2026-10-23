# Selfheal Dashboard

This repository contains the Selfheal Dashboard application.

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed on your system.

## Build the Image
Navigate to the repository folder where the `Dockerfile` is located and open a terminal. Execute the following command to build the Docker image:

```bash
docker build -t selfheal-dashboard .
```

## Run the Container
Run the Docker image by providing the necessary environment variables for your SNMP and MTA properties:

```bash
docker run -p 5050:5050 -e SNMP_COMMUNITY=<CM_community_string> -e SNMP_HOST=<CM_IP_Address> -e MTA_COMMUNITY=<MTA_community_string> -e MTA_IP=<MTA_IP_Address> selfheal-dashboard
```

**Example:**
```bash
docker run -p 5050:5050 -e SNMP_COMMUNITY=public -e SNMP_HOST=192.168.246.35 -e MTA_COMMUNITY=private -e MTA_IP=192.168.246.101 selfheal-dashboard
```

## Access the Dashboard
Once the container is running smoothly, browse to [http://127.0.0.1:5050/](http://127.0.0.1:5050/) in your web browser to see the dashboard.
 
## Windows desktop build (D3.1-installer branch)

This branch packages the dashboard as a standalone Windows app (`dashboard.exe`) using PyInstaller and pywebview, with no Docker needed.

- `desktop.py` is the entry point. It starts Flask on a free local port, runs the SNMP poller (`main.run_monitor_loop`) in a background thread and opens the dashboard in a native window.
- Device settings come from `config.json` next to the exe (defaults in `config_loader.py`).
- SNMP is done with the bundled Net-SNMP Windows binaries in `snmp_bin/` (resolved by `snmp_bin_path.py`).
- Logs are written to `logs/` next to the exe.

Build (Windows, Python 3.x):

```
pip install flask "paramiko==4.0.0" pywebview pyinstaller
pyinstaller dashboard.spec
```

Ship `dist\dashboard.exe` together with `config.json` and the `snmp_bin\` folder in the same directory. The target PC needs the Microsoft Edge WebView2 runtime.
