import sys, os

PERSIST_DIR = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) \
              else os.path.dirname(os.path.abspath(__file__))
os.chdir(PERSIST_DIR)

# The installed app is built without a console (dashboard.spec, console=False),
# so there is no stdout / stderr. Send them to logs/dashboard.log - before
# anything that prints or logs is imported.
if sys.stdout is None or sys.stderr is None:
    os.makedirs("logs", exist_ok=True)
    _log_path = os.path.join("logs", "dashboard.log")
    try:
        if os.path.getsize(_log_path) > 2 * 1024 * 1024:
            os.replace(_log_path, _log_path + ".1")
    except OSError:
        pass
    sys.stdout = sys.stderr = open(_log_path, "a", buffering=1, encoding="utf-8", errors="replace")

import threading, socket, webview, datetime

from app import app
from main import run_monitor_loop
from config_loader import load_config

LOGS_DIR = "logs"

def init_log_files():
    """Pre-create log files with safe defaults so the dashboard never shows
    'Not Available' on the very first load before the poller's first cycle."""
    os.makedirs(LOGS_DIR, exist_ok=True)
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cfg = load_config()

    # wan0_stats.log — needs a parseable line for read_wan0_status()
    wan_path = os.path.join(LOGS_DIR, "wan0_stats.log")
    if not os.path.exists(wan_path):
        with open(wan_path, "w") as f:
            f.write(
                f"{now}, IP address:{cfg.get('cm_ip', 'Unknown')} "
                f"RX packets:0 TX packets:0 "
                f"RX dropped:0 TX dropped:0 Reachable:False\n"
            )

    # chart log files — read by read_log_data()
    for log_file, unit in [
        ("cpu_usage.log",   "%"),
        ("mem_usage.log",   "%"),
        ("throughput.log",  "Mbps"),
    ]:
        path = os.path.join(LOGS_DIR, log_file)
        if not os.path.exists(path):
            with open(path, "w") as f:
                f.write(f"{now}, 0 {unit}\n")


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def start_flask(port):
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False, threaded=True)


def main():
    init_log_files()
    port = find_free_port()
    threading.Thread(target=start_flask, args=(port,), daemon=True).start()
    threading.Thread(target=run_monitor_loop, daemon=True).start()
    webview.create_window(title='AI based Self healing Dashboard (D4.0)', url=f'http://127.0.0.1:{port}',
                           width=1366, height=860, resizable=True, min_size=(800, 600))
    webview.start()


if __name__ == '__main__':
    main()
