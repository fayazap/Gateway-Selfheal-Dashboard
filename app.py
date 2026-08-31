from flask import Flask, render_template, jsonify, request
import subprocess
import re
import socket
import paramiko
import time
import logging
import logging.handlers
import threading
from functools import wraps
import argparse

from utils import log_value, read_log_data

# Set up argument parser. Defaults are just a safety net for an unsupported
# bare invocation - start.sh (the only entry point this app is actually run
# through, in Docker or standalone) always passes all four flags explicitly,
# resolving them from its own env-var defaults, so an os.getenv() layer here
# would just duplicate that and never actually take effect.
parser = argparse.ArgumentParser(description="SNMP Modem Monitoring Flask App")
parser.add_argument("--community", default="dilip-one", help="SNMP community string for read and write (default: dilip-one)")
parser.add_argument("--host", default="192.168.246.100", help="SNMP host address (default: 192.168.246.100)")
parser.add_argument("--mta-community", default="private", help="MTA community string (default: private)")
parser.add_argument("--mta-ip", default="192.168.246.101", help="MTA IP address (default: 192.168.246.101)")
args = parser.parse_args()

# Assign arguments to variables
SNMP_COMMUNITY_READ = args.community
SNMP_COMMUNITY_WRITE = args.community
SNMP_HOST = args.host
MTA_COMMUNITY = args.mta_community
MTA_IP = args.mta_ip

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.handlers.RotatingFileHandler('modem_monitor.log', maxBytes=1_000_000, backupCount=3),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# SNMP OID Mapping
OID_LIST = {
    "tinnoSelfhealEnable": "1.3.6.1.4.1.62596.1.1.1.25",
    "tinnoRMInterval": "1.3.6.1.4.1.62596.1.1.1.27",
    "tinnoAvgCPUThreshold": "1.3.6.1.4.1.62596.1.1.1.30",
    "tinnoAvgMemoryThreshold": "1.3.6.1.4.1.62596.1.1.1.28",
    "tinnoLastRebootReason": "1.3.6.1.4.1.62596.1.1.1.47",
    "tinnoLastActionTakenTime": "1.3.6.1.4.1.62596.1.1.1.49",
    "tinnoIPv4PingServer": "1.3.6.1.4.1.62596.1.1.1.38",
    "tinnoConnTestPingInterval": "1.3.6.1.4.1.62596.1.1.1.36",
    "tinnoSHSpeedTestEnable": "1.3.6.1.4.1.62596.1.1.1.40",
    "tinnoSHSpeedTestInterval": "1.3.6.1.4.1.62596.1.1.1.41",
    "tinnoSHSpeedTestThreshold": "1.3.6.1.4.1.62596.1.1.1.42",
    "tinnoSHIsLowThroughput": "1.3.6.1.4.1.62596.1.1.1.43",
    "tinnoLastRebootCounter": "1.3.6.1.4.1.62596.1.1.1.48",
    "tinnoHistoricalRebootReason": "1.3.6.1.4.1.62596.1.1.1.50",
    "ifInDiscards": "1.3.6.1.2.1.2.2.1.13.2",
    "ifOutDiscards": "1.3.6.1.2.1.2.2.1.19.2",
    "tinnoCmDoc31AccessSshEnable": "1.3.6.1.4.1.62596.1.1.1.12.2",
    "tinnoCmDoc31AccessTechnicianPassword": "1.3.6.1.4.1.62596.1.1.1.4",
    "tinnoSpeedtestUrl": "1.3.6.1.4.1.62596.1.1.1.16.2",
    "tinnoSpeedtestServerPort": "1.3.6.1.4.1.62596.1.1.1.17.2",
    "tinnoSHConnTestEnable": "1.3.6.1.4.1.62596.1.1.1.35.2",
    "tinnoSHtftpserver": "1.3.6.1.4.1.62596.1.1.1.53.2",
    "tinnoLogUploaderStatus": "1.3.6.1.4.1.62596.1.1.1.54"
}

VALUE_MAPPINGS = {
    "tinnoSelfhealEnable": {"0": "Disabled", "1": "Enabled"},
    "tinnoSHSpeedTestEnable": {"0": "Disabled", "1": "Enabled"},
    "tinnoLastRebootReason": {
        "0": "Power Cycle",
        "1": "High CPU Usage",
        "2": "Memory Overload",
        "3": "Firmware Issue",
        "4": "Network Failure"
    },
    "tinnoHistoricalRebootReason": {
        "CPU_THRESHOLD": "High CPU Usage",
        "POWER_CYCLE": "Power Cycle",
        "MEMORY_OVERLOAD": "Memory Overload",
        "FIRMWARE_ISSUE": "Firmware Issue",
        "NETWORK_FAILURE": "Network Failure"
    },
    "deviceDQosLiteDirection": {
        "0": "Disabled",
        "1": "Send and Receive",
        "2": "Send Only"
    },
    "tinnoCmDoc31AccessSshEnable": {"0": "Disabled", "1": "Enabled"},
    "tinnoSHConnTestEnable": {"0": "Disabled", "1": "Enabled"}
}

# Human-readable labels for OID_LIST entries, used by get_snmp_data(). Kept
# as a single module-level dict instead of being redefined in each of
# get_snmp_data()'s try/except branches.
DISPLAY_NAMES = {
    "tinnoSelfhealEnable": "Self-Healing Status",
    "tinnoRMInterval": "Monitoring Interval",
    "tinnoAvgCPUThreshold": "CPU Threshold",
    "tinnoAvgMemoryThreshold": "Avg Memory Threshold",
    "tinnoLastRebootReason": "Last Reboot",
    "tinnoLastActionTakenTime": "Last Action Taken",
    "tinnoIPv4PingServer": "IPv4 Ping Server",
    "tinnoConnTestPingInterval": "Ping Test Interval",
    "tinnoSHSpeedTestEnable": "Speed Test Status",
    "tinnoSHSpeedTestInterval": "Speed Test Interval",
    "tinnoSHSpeedTestThreshold": "Speed Test Threshold",
    "tinnoSHIsLowThroughput": "Low Throughput Status",
    "tinnoLastRebootCounter": "Last Reboot Counter",
    "tinnoHistoricalRebootReason": "Historical Reboot Reasons",
    "ifInDiscards": "Incoming Discarded Packets",
    "ifOutDiscards": "Outgoing Discarded Packets",
    "tinnoCmDoc31AccessSshEnable": "SSH Access Enable",
    "tinnoCmDoc31AccessTechnicianPassword": "Technician Password",
    "tinnoSpeedtestUrl": "Speed Test Server",
    "tinnoSpeedtestServerPort": "Speed Test Server Port",
    "tinnoSHConnTestEnable": "Connectivity Test Enable",
    "tinnoSHtftpserver": "TFTP Log Server",
    "tinnoLogUploaderStatus": "Diagnostic Log Upload"
}

# SNMP Settings
DEVICE_DQOS_OID = "1.3.6.1.4.1.17318.1.25.50.30.100.0"

# Memory leak settings
MEMORY_LEAK_PORT = 22
MEMORY_LEAK_USERNAME = "root"
MEMORY_LEAK_PASSWORD = "tInNo551@Cm"
# The modem runs an old Dropbear (2019) SSH server that only offers the
# legacy "ssh-rsa" host-key type (confirmed via `ssh -vvv`). paramiko 5.x
# dropped "ssh-rsa" support entirely (and "ssh-dss" even earlier, in 4.x) -
# requirements.txt/Dockerfile must pin paramiko==4.0.0, the newest release
# that still recognizes it. Without that pin, setting key_types below to
# include an algorithm paramiko doesn't know raises ValueError("unknown
# cipher") - a misleading message from paramiko's SecurityOptions setter,
# which reuses that string for every unrecognized algorithm, not just
# ciphers.
MEMORY_LEAK_HOST_KEY_TYPES = [
    "ssh-rsa", "rsa-sha2-256", "rsa-sha2-512",
    "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
    "ssh-ed25519",
]
memory_leak_running = False
memory_leak_lock = threading.Lock()

def async_endpoint(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        thread = threading.Thread(target=f, args=args, kwargs=kwargs, daemon=True)
        thread.start()
        return jsonify({"status": "Operation started"}), 202
    return decorated_function

def read_until_prompt(channel, prompt="#", timeout=20):
    buffer = ""
    start_time = time.time()
    while True:
        if channel.recv_ready():
            buffer += channel.recv(4096).decode(errors="ignore")
            if prompt in buffer:
                buffer = buffer[:buffer.index(prompt)].strip()
                break
        if time.time() - start_time > timeout:
            logger.warning(f"Timed out waiting for prompt '{prompt}'")
            break
        time.sleep(0.2)
    return buffer

def parse_free_memory(memory_str):
    match = re.search(r"Mem:\s+\d+\s+\d+\s+(\d+)", memory_str)
    if match:
        free_mem = int(match.group(1))
        return free_mem
    logger.warning("Could not parse free memory from free -m output")
    return 0

memory_leak_status = {"running": False, "last_result": None, "leak_pid": None}

def cause_memory_leak():
    global memory_leak_running
    with memory_leak_lock:
        if memory_leak_running:
            logger.warning("Memory leak operation already in progress")
            return False
        memory_leak_running = True
        memory_leak_status["running"] = True
        memory_leak_status["last_result"] = None
        memory_leak_status["leak_pid"] = None

    try:
        # The modem's Dropbear SSH daemon is off unless
        # tinnoCmDoc31AccessSshEnable is explicitly set to 1 - confirmed live
        # via snmpwalk (reads 0 by default) and by watching port 22 open
        # immediately after this snmpset. Without this, ssh.connect() gets
        # "[Errno 111] Connection refused" because nothing is listening.
        for attempt in range(3):
            try:
                logger.info(f"Enabling SSH access (Attempt {attempt + 1})...")
                subprocess.check_output(
                    [
                        "snmpset", "-v", "2c", "-c", SNMP_COMMUNITY_WRITE, SNMP_HOST,
                        OID_LIST["tinnoCmDoc31AccessSshEnable"], "i", "1"
                    ],
                    universal_newlines=True
                )
                logger.info("SSH access enabled successfully.")
                time.sleep(2)
                break
            except subprocess.CalledProcessError as e:
                logger.warning(f"SSH enable attempt {attempt + 1} failed. Reason: {e}")
                if attempt == 2:
                    logger.error("Failed to enable SSH after 3 attempts.")
                    memory_leak_status["running"] = False
                    memory_leak_running = False
                    return False
                time.sleep(2)

        logger.info(f"Connecting to {SNMP_HOST}:{MEMORY_LEAK_PORT}...")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        for attempt in range(3):
            transport = None
            try:
                sock = socket.create_connection((SNMP_HOST, MEMORY_LEAK_PORT), timeout=10)
                transport = paramiko.Transport(sock)
                # Allow the legacy host-key types this old Dropbear offers
                # (paramiko no longer accepts them by default).
                transport.get_security_options().key_types = MEMORY_LEAK_HOST_KEY_TYPES
                transport.connect(username=MEMORY_LEAK_USERNAME, password=MEMORY_LEAK_PASSWORD)
                ssh._transport = transport
                logger.info("SSH connection established successfully.")
                break
            except Exception as e:
                if transport is not None:
                    transport.close()
                if attempt < 2:
                    logger.warning(f"SSH connection attempt {attempt + 1} failed. Retrying... Reason: {e}")
                    time.sleep(2)
                else:
                    logger.error(f"SSH connection attempt {attempt + 1} failed. No more retries. Reason: {e}")
                    memory_leak_status["running"] = False
                    memory_leak_running = False
                    return False

        channel = ssh.invoke_shell()
        time.sleep(1)
        read_until_prompt(channel, "mainMenu>", timeout=20)
        logger.info("Entered main menu, switching to shell...")

        channel.send("shell\n")
        read_until_prompt(channel, "#")

        channel.send("free -m\n")
        initial_mem = parse_free_memory(read_until_prompt(channel, "#"))
        logger.info(f"Initial free memory: {initial_mem} KB")
        log_value("memory_leak_modem.log", initial_mem, "KB")

        channel.send("dd --help\n")
        dd_output = read_until_prompt(channel, "#")
        use_dd = "dd" in dd_output or "BusyBox" in dd_output

        script_content = (
            "#!/bin/sh\n"
            "while true; do\n"
            f"    {'dd if=/dev/zero of=/tmp/leakfile bs=700k count=1 conv=notrunc oflag=append' if use_dd else 'leak=$leak$(cat /dev/zero | head -c 700k)'}\n"
            "    sleep 1\n"
            "done\n"
        )
        channel.send(f"echo '{script_content}' > /tmp/memory_leak.sh\n")
        read_until_prompt(channel, "#")
        logger.info("Created /tmp/memory_leak.sh")

        channel.send("chmod +x /tmp/memory_leak.sh\n")
        read_until_prompt(channel, "#")
        logger.info("Made /tmp/memory_leak.sh executable")

        channel.send("/tmp/memory_leak.sh &\n")
        time.sleep(2)
        read_until_prompt(channel, "#")
        logger.info("Started memory_leak.sh in background")

        channel.send("echo $! > /tmp/memory_leak.pid\n")
        read_until_prompt(channel, "#")
        time.sleep(1)
        channel.send("cat /tmp/memory_leak.pid\n")
        pid_output = read_until_prompt(channel, "#").strip()

        pid_lines = [line for line in pid_output.splitlines() if line.strip().isdigit()]
        leak_pid = int(pid_lines[0]) if pid_lines else None
        if leak_pid:
            logger.info(f"Memory leak script PID: {leak_pid}")
            memory_leak_status["leak_pid"] = leak_pid
        else:
            channel.send("ps | grep memory_leak.sh | grep -v grep | awk '{print $1}'\n")
            pid_output = read_until_prompt(channel, "#").strip()
            leak_pid = int(pid_output) if pid_output.strip().isdigit() else None
            if leak_pid:
                logger.info(f"Memory leak script PID (from ps): {leak_pid}")
                memory_leak_status["leak_pid"] = leak_pid
            else:
                logger.warning("Could not retrieve memory leak script PID")
                raise Exception("Failed to get PID of memory leak script")

        for i in range(50):
            channel.send("free -m\n")
            mem_output = read_until_prompt(channel, "#")
            free_mem = parse_free_memory(mem_output)
            logger.info(f"Iteration {i+1}: Free memory: {free_mem} KB")
            log_value("memory_leak_modem.log", free_mem, "KB")
            if free_mem < 20000:
                logger.warning("Free memory critically low, stopping...")
                break
            time.sleep(5)

        logger.info("Attempting to stop memory leak...")
        channel.send(f"kill -9 {leak_pid}\n")
        read_until_prompt(channel, "#")
        logger.info(f"Killed memory_leak process PID {leak_pid}")

        channel.close()
        ssh.close()
        logger.info("SSH connection closed.")
        logger.info("Memory leak test completed successfully")
        memory_leak_status["last_result"] = f"success: Memory Leaking Process (PID {leak_pid}) Detected and Stopped"
        # Close SSH access back down now that the test is done, mirroring the
        # enable step above, so the modem isn't left reachable on port 22.
        for attempt in range(3):
            try:
                logger.info(f"Disabling SSH access (Attempt {attempt + 1})...")
                subprocess.check_output(
                    [
                        "snmpset", "-v", "2c", "-c", SNMP_COMMUNITY_WRITE, SNMP_HOST,
                        OID_LIST["tinnoCmDoc31AccessSshEnable"], "i", "0"
                    ],
                    universal_newlines=True
                )
                logger.info("SSH access disabled successfully.")
                time.sleep(2)
                break
            except subprocess.CalledProcessError as e:
                logger.warning(f"SSH disable attempt {attempt + 1} failed. Reason: {e}")
                if attempt == 2:
                    logger.error("Failed to disable SSH after 3 attempts.")
                time.sleep(2)
        return True

    except paramiko.AuthenticationException:
        logger.error("Authentication failed.")
        memory_leak_status["last_result"] = "failed: Authentication error"
        return False
    except paramiko.SSHException as e:
        logger.error(f"SSH error: {e}")
        memory_leak_status["last_result"] = f"failed: SSH error - {str(e)}"
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"SNMP set command failed: {e}")
        memory_leak_status["last_result"] = f"failed: SNMP set error - {str(e)}"
        return False
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        memory_leak_status["last_result"] = f"failed: Unexpected error - {str(e)}"
        return False
    finally:
        with memory_leak_lock:
            memory_leak_running = False
            memory_leak_status["running"] = False

def get_snmp_data():
    data = []
    try:
        for name, oid in OID_LIST.items():
            try:
                result = subprocess.check_output(
                    ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, SNMP_HOST, oid],
                    universal_newlines=True
                )
                if name == "tinnoHistoricalRebootReason":
                    match = re.search(r'STRING: "(.+)"', result)
                    if match:
                        raw_value = match.group(1).strip()
                        reasons = [r.strip() for r in raw_value.split(",") if r.strip()][:10]
                        mapped_reasons = []
                        for reason in reasons:
                            timestamp, reason_code = re.match(r'(.+?) - (.+)', reason).groups()
                            mapped_reason = VALUE_MAPPINGS.get(name, {}).get(reason_code, reason_code)
                            mapped_reasons.append(f"{timestamp} - {mapped_reason}")
                        value = mapped_reasons
                    else:
                        value = ["No data"]
                else:
                    match = re.search(r"= (.+?): (.+)", result)
                    if match:
                        raw_value = match.group(2).strip()
                        if len(raw_value) >= 2 and raw_value[0] == '"' and raw_value[-1] == '"':
                            raw_value = raw_value[1:-1]
                        if name in ["tinnoRMInterval", "tinnoConnTestPingInterval", "tinnoSHSpeedTestInterval"]:
                            value = f"{raw_value} minutes"
                        elif name == "tinnoSHSpeedTestThreshold":
                            value = f"{raw_value} Mbps"
                        elif name == "tinnoAvgCPUThreshold":
                            value = f"{raw_value} %"
                        elif name == "tinnoLogUploaderStatus":
                            # "<last-run-time> - <RESULT> [<detail>]", or an
                            # empty string when no diagnostic-log upload has
                            # been attempted yet. Passed through verbatim - the
                            # dashboard parses the timestamp/result client-side
                            # to slot it into the Self-Healing Events list.
                            value = raw_value
                        elif name == "tinnoLastActionTakenTime":
                            try:
                                value = time.strftime("%Y-%m-%d %H:%M", time.strptime(raw_value, "%Y%m%d%H%M"))
                            except ValueError:
                                value = raw_value
                        else:
                            value = VALUE_MAPPINGS.get(name, {}).get(raw_value, raw_value)
                    else:
                        value = "No data"
                display_name = DISPLAY_NAMES.get(name, name)
                data.append({"name": display_name, "value": value, "key": name})
            except subprocess.CalledProcessError as e:
                logger.error(f"SNMP command failed for {name}: {e}")
                display_name = DISPLAY_NAMES.get(name, name)
                error_value = ["Unable to connect to modem"] if name == "tinnoHistoricalRebootReason" else "Unable to connect to modem"
                data.append({"name": display_name, "value": error_value})
            except Exception as e:
                logger.error(f"Unexpected error for {name}: {e}")
                display_name = DISPLAY_NAMES.get(name, name)
                error_value = ["Unable to connect to modem"] if name == "tinnoHistoricalRebootReason" else "Unable to connect to modem"
                data.append({"name": display_name, "value": error_value})
    except Exception as e:
        logger.error(f"General SNMP error: {e}")
    return data

def set_qos_direction():
    try:
        in_discards = run_snmp_integer(OID_LIST["ifInDiscards"])
        out_discards = run_snmp_integer(OID_LIST["ifOutDiscards"])

        # Drive deviceDQosLiteDirection off of the current discard counters
        # each time: 1 (sendRecv) while discards are present, back down to 0
        # once they clear. Previously this only ever set it to 1 and never
        # turned it back off, so the MTA could be left with QoS-lite "on"
        # indefinitely while the dashboard's displayed status silently
        # reverted to "Disabled" the next time discards happened to read 0.
        discards_present = (in_discards or 0) > 0 or (out_discards or 0) > 0
        desired_value = "1" if discards_present else "0"
        adjusted = False
        try:
            subprocess.check_output(
                ["snmpset", "-v", "2c", "-c", MTA_COMMUNITY, MTA_IP, DEVICE_DQOS_OID, "i", desired_value],
                universal_newlines=True
            )
            logger.info(
                f"Set deviceDQosLiteDirection to {'sendRecv (1)' if discards_present else 'disabled (0)'} "
                f"({'discards present' if discards_present else 'no discards'})"
            )
            adjusted = discards_present
        except FileNotFoundError:
            logger.warning("snmpset is not installed or not found in PATH; skipping DQoS adjustment")
        except subprocess.CalledProcessError as e:
            logger.warning(f"DQoS adjustment failed but discard counters are still available: {e.output}")

        # Read back the device's actual state rather than assuming the set
        # above took effect, so the display can't drift from reality.
        qos_display = "Enabled" if discards_present else "Disabled"
        try:
            qos_result = subprocess.check_output(
                ["snmpwalk", "-v", "2c", "-c", MTA_COMMUNITY, MTA_IP, DEVICE_DQOS_OID],
                universal_newlines=True
            )
            qos_match = re.search(r"= INTEGER: (\d+)", qos_result)
            if qos_match:
                qos_display = "Disabled" if qos_match.group(1) == "0" else "Enabled"
        except FileNotFoundError:
            logger.warning("snmpwalk is not installed or not found in PATH; DQoS state marked unavailable")
            qos_display = "Unavailable"
        except subprocess.CalledProcessError as e:
            logger.warning(f"Unable to read DQoS state: {e.output}")
            qos_display = "Unavailable"

        return {
            "in_discards": in_discards if in_discards is not None else 0,
            "out_discards": out_discards if out_discards is not None else 0,
            "qos_direction": qos_display,
            "adjusted_due_to_discards": adjusted
        }
    except Exception as e:
        logger.error(f"Error in set_qos_direction: {e}")
        return {
            "in_discards": 0,
            "out_discards": 0,
            "qos_direction": "Unavailable",
            "adjusted_due_to_discards": False
        }

def run_snmp_integer(oid):
    try:
        output = subprocess.check_output(
            ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, SNMP_HOST, oid],
            universal_newlines=True,
            stderr=subprocess.STDOUT
        )
        match = re.search(r"=\s*(?:Counter32|INTEGER):\s*(\d+)", output)
        return int(match.group(1)) if match else None
    except FileNotFoundError:
        logger.error("snmpwalk is not installed or not found in PATH.")
        return None
    except subprocess.CalledProcessError as e:
        logger.error(f"SNMP command failed for {oid}: {e.output}")
        return None
    except Exception as e:
        logger.error(f"Unexpected SNMP error for {oid}: {e}")
        return None


def get_snmp_raw_value(oid):
    """Fetch a single OID's raw value string via snmpwalk (quotes stripped),
    or None on failure. Used to read one or two values without paying for a
    full get_snmp_data() walk of every OID in OID_LIST."""
    try:
        output = subprocess.check_output(
            ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, SNMP_HOST, oid],
            universal_newlines=True,
            stderr=subprocess.STDOUT
        )
        match = re.search(r"= (.+?): (.+)", output)
        if not match:
            return None
        raw_value = match.group(2).strip()
        if len(raw_value) >= 2 and raw_value[0] == '"' and raw_value[-1] == '"':
            raw_value = raw_value[1:-1]
        return raw_value
    except FileNotFoundError:
        logger.error("snmpwalk is not installed or not found in PATH.")
        return None
    except subprocess.CalledProcessError as e:
        logger.error(f"SNMP command failed for {oid}: {e.output}")
        return None


def read_wan0_status():
    try:
        with open('wan0_stats.log', 'r') as file:
            lines = file.readlines()
            if not lines:
                logger.warning("wan0_stats.log is empty")
                return {
                    "timestamp": "Unknown",
                    "ip_address": "Unknown",
                    "status": "Unknown",
                    "rx_data": "Unknown",
                    "tx_data": "Unknown",
                    "rx_packets": "0",
                    "tx_packets": "0",
                    "rx_errors": "0",
                    "tx_errors": "0",
                    "rx_dropped": "0",
                    "tx_dropped": "0"
                }
            content = lines[-1].strip()
            match = re.search(
                r'(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\s*'
                r'IP address:(?P<ip>[^\s]+)\s+'
                r'RX packets:(?P<rx>\d+)\s+'
                r'TX packets:(?P<tx>\d+)\s+'
                r'RX dropped:(?P<rx_d>\d+)\s+'
                r'TX dropped:(?P<tx_d>\d+)\s+'
                r'Reachable:(?P<reachable>True|False)',
                content
            )
            if match:
                timestamp = match.group('timestamp')
                ip_address = match.group('ip')
                rx_packets = match.group('rx')
                tx_packets = match.group('tx')
                rx_dropped = match.group('rx_d')
                tx_dropped = match.group('tx_d')
                reachable = match.group('reachable')
                return {
                    "timestamp": timestamp,
                    "ip_address": ip_address,
                    "status": "Connected" if reachable == "True" else "Disconnected",
                    "rx_data": "Unknown",
                    "tx_data": "Unknown",
                    "rx_packets": rx_packets,
                    "tx_packets": tx_packets,
                    "rx_errors": "0",
                    "tx_errors": "0",
                    "rx_dropped": rx_dropped,
                    "tx_dropped": tx_dropped
                }
            else:
                logger.warning(f"Invalid format in wan0_stats.log: {content}")
    except FileNotFoundError:
        logger.error("wan0_stats.log not found")
    except Exception as e:
        logger.error(f"Error reading wan0_stats.log: {e}")
    return {
        "timestamp": "Unknown",
        "ip_address": "Unknown",
        "status": "Unknown",
        "rx_data": "Unknown",
        "tx_data": "Unknown",
        "rx_packets": "0",
        "tx_packets": "0",
        "rx_errors": "0",
        "tx_errors": "0",
        "rx_dropped": "0",
        "tx_dropped": "0"
    }

@app.route("/")
def index():
    snmp_data = get_snmp_data()
    return render_template("index.html", snmp_data=snmp_data)

@app.route("/api/snmp")
def api_snmp():
    return jsonify(get_snmp_data())

@app.route("/api/usage")
def api_usage():
    cpu_data = read_log_data('cpu_usage.log')
    memory_data = read_log_data('free_memory.log')
    throughput_data = read_log_data('throughput.log')

    # Fetch just the two threshold OIDs directly instead of walking all of
    # OID_LIST via get_snmp_data() (18 snmpwalk subprocess spawns) just to
    # string-match two display names out of the result. This endpoint is
    # polled every 10s by the frontend.
    cpu_threshold = 80  # Fallback default
    raw_cpu_threshold = get_snmp_raw_value(OID_LIST["tinnoAvgCPUThreshold"])
    if raw_cpu_threshold is not None:
        try:
            cpu_threshold = float(raw_cpu_threshold)
        except ValueError:
            pass

    speedtest_threshold = 100  # Fallback default
    raw_speedtest_threshold = get_snmp_raw_value(OID_LIST["tinnoSHSpeedTestThreshold"])
    if raw_speedtest_threshold is not None:
        try:
            speedtest_threshold = float(raw_speedtest_threshold)
        except ValueError:
            pass

    return jsonify({
        'cpu': cpu_data,
        'memory': memory_data,
        'throughput': throughput_data,
        'cpu_threshold': cpu_threshold,
        'speedtest_threshold': speedtest_threshold
    })

@app.route("/api/wan0_status")
def api_wan0_status():
    return jsonify(read_wan0_status())

@app.route("/api/qos_status")
def api_qos_status():
    return jsonify(set_qos_direction())

@app.route("/api/trigger_memory_leak", methods=["POST"])
@async_endpoint
def trigger_memory_leak():
    logger.info("Memory leak test triggered via API")
    success = cause_memory_leak()
    if success:
        logger.info("Memory leak test completed successfully")
    else:
        logger.error("Memory leak test failed")

@app.route("/api/snmpset", methods=["POST"])
def api_snmpset():
    data = request.json
    oid_name = data.get("oid_name")
    val_type = data.get("type")
    value = data.get("value")
    
    if oid_name not in OID_LIST:
        return jsonify({"error": "Invalid OID"}), 400
        
    oid = OID_LIST[oid_name]
    if not oid.endswith(".2"):
        oid += ".2"
        
    cmd = [
        "snmpset", "-v", "2c", "-c", SNMP_COMMUNITY_WRITE, SNMP_HOST,
        oid, val_type, str(value)
    ]
    try:
        output = subprocess.check_output(cmd, universal_newlines=True, stderr=subprocess.STDOUT)
        logger.info(f"SNMP SET successful for {oid_name}: {output}")
        return jsonify({"status": "success", "output": output})
    except subprocess.CalledProcessError as e:
        logger.error(f"SNMP SET failed for {oid_name}: {e.output}")
        return jsonify({"status": "error", "error": e.output}), 500

@app.route("/api/memory_leak_status")
def memory_leak_status_endpoint():
    return jsonify(memory_leak_status)

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5050)