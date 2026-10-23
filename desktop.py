import sys, os, threading, socket, webview, datetime

PERSIST_DIR = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) \
              else os.path.dirname(os.path.abspath(__file__))
os.chdir(PERSIST_DIR)

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
        ("free_memory.log", "kB"),
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
    webview.create_window(title='Dashboard', url=f'http://127.0.0.1:{port}',
                           width=1366, height=860, resizable=True, min_size=(800, 600))
    webview.start()


if __name__ == '__main__':
    main()
