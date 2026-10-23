import logging
import time
import re
import subprocess
from snmp_bin_path import get_bin_path
import platform

from utils import log_value
from config_loader import load_config

logging.basicConfig(level=logging.INFO)

# Initialize last known values
last_known_values = {
    "CPU Usage": 0.0,
    "Memory Usage": 0.0,
    "Throughput": 0,
    "WAN0 Packets": {"in_packets": 0, "out_packets": 0},
    "WAN0 Dropped Packets": {"in_discards": 0, "out_discards": 0}
}

def parse_snmp_cpu_usage(snmp_output):
    """Parse CPU usage percentage from SNMP tinnoLiveCPUStat output."""
    match = re.search(r"INTEGER:\s*(\d+)", snmp_output)
    if match:
        return float(match.group(1))
    logging.warning("Could not parse CPU usage from SNMP output")
    return None

def parse_snmp_memory_usage(snmp_output):
    """Parse memory usage percentage from SNMP tinnoLiveMemoryStat output (OID .52)."""
    match = re.search(r"INTEGER:\s*(\d+)", snmp_output)
    if match:
        return float(match.group(1))
    logging.warning("Could not parse memory usage from SNMP output")
    return None

def parse_throughput(snmp_output):
    """Parse throughput from SNMP command output."""
    logging.info(f"Raw SNMP output: {repr(snmp_output)}")
    match = re.search(r"62596\.1\.1\.1\.24\.\d+\s*=\s*INTEGER:\s*(\d+)", snmp_output)
    if match:
        return int(match.group(1))
    logging.warning("Could not parse throughput from SNMP output")
    return None

def parse_packet_counts(snmp_output):
    """Parse a single counter value from snmpget output.
    snmpget returns exactly one OID per call, so we just extract the integer
    from whichever Counter32/INTEGER line is present."""
    # Matches both snmpget and snmpwalk output formats:
    #   IF-MIB::ifInUcastPkts.2 = Counter32: 12345
    #   iso.3.6.1.2.1.2.2.1.11.2 = Counter32: 12345
    match = re.search(r"=\s*(?:Counter32|INTEGER):\s*(\d+)", snmp_output)
    if match:
        return int(match.group(1))
    logging.warning(f"Could not parse counter from SNMP output: {repr(snmp_output)}")
    return None


def parse_wan_packets(outputs):
    """Parse WAN packet counts from a list of four snmpget outputs
    (in_packets, out_packets, in_discards, out_discards)."""
    results = [parse_packet_counts(o) for o in outputs]
    if all(v is not None for v in results):
        return tuple(results)
    return None, None, None, None

def check_host_reachability(hostname):
    """Check if the host is reachable using ping."""
    try:
        if platform.system().lower() == "windows":
            ping_cmd = ["ping", "-n", "3", hostname]
        else:
            ping_cmd = ["ping", "-c", "3", hostname]
        result = subprocess.run(ping_cmd, capture_output=True, text=True, check=True)
        if "TTL=" in result.stdout or "ttl=" in result.stdout:
            logging.info(f"Ping to {hostname} succeeded")
            return True
        else:
            logging.warning(f"Ping to {hostname} failed: {result.stdout}")
            return False
    except subprocess.CalledProcessError as e:
        logging.error(f"Ping to {hostname} failed: {e.stderr}")
        return False

def get_modem_stats(hostname, community):
    results = {}
    is_reachable = check_host_reachability(hostname)
    ip_address = hostname if is_reachable else "Unknown"

    snmp_commands = {
        "CPU Usage": [get_bin_path("snmpwalk.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.4.1.62596.1.1.1.51"],
        "Memory Usage": [get_bin_path("snmpwalk.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.4.1.62596.1.1.1.52"],
        "Throughput": [get_bin_path("snmpwalk.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.4.1.62596.1.1.1.24"],
        "WAN0 Packets": [
            [get_bin_path("snmpget.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.2.1.2.2.1.11.2"],
            [get_bin_path("snmpget.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.2.1.2.2.1.17.2"],
            [get_bin_path("snmpget.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.2.1.2.2.1.13.2"],
            [get_bin_path("snmpget.exe"), "-v", "2c", "-c", community, hostname, "1.3.6.1.2.1.2.2.1.19.2"]
        ]
    }

    if not is_reachable:
        logging.warning(f"Host {hostname} is not reachable. Using last known values.")
        results["CPU Usage"] = last_known_values["CPU Usage"]
        results["Memory Usage"] = last_known_values["Memory Usage"]
        results["Throughput"] = last_known_values["Throughput"]
        results["WAN0 Packets"] = f"RX packets:{last_known_values['WAN0 Packets']['in_packets']} TX packets:{last_known_values['WAN0 Packets']['out_packets']}"
        results["WAN0 Dropped Packets"] = f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']}"
        log_value("cpu_usage.log", results["CPU Usage"], "%", is_last_known=True)
        log_value("mem_usage.log", results["Memory Usage"], "%", is_last_known=True)
        log_value("throughput.log", results["Throughput"], "Mbps", is_last_known=True)
        log_value("wan0_stats.log",
                  f"IP address:{ip_address} RX packets:{last_known_values['WAN0 Packets']['in_packets']} "
                  f"TX packets:{last_known_values['WAN0 Packets']['out_packets']} "
                  f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} "
                  f"TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']} Reachable:{is_reachable}",
                  "", overwrite=True, is_last_known=True)
        print(f"\n[OUTPUT] CPU Usage:\n{results['CPU Usage']}% (last known)")
        print(f"\n[OUTPUT] Memory Usage:\n{results['Memory Usage']}% (last known)")
        print(f"\n[OUTPUT] Throughput:\n{results['Throughput']} Mbps (last known)")
        print(f"\n[OUTPUT] WAN0 Packets:\n{results['WAN0 Packets']} (last known)")
        print(f"\n[OUTPUT] WAN0 Dropped Packets:\n{results['WAN0 Dropped Packets']} (last known)")
        return results

    # CPU Usage
    try:
        # First CPU usage sample
        result1 = subprocess.run(snmp_commands["CPU Usage"], capture_output=True, text=True, check=True)
        cpu_usage1 = parse_snmp_cpu_usage(result1.stdout)
        logging.info(f"First CPU Usage sample: {cpu_usage1}%")
        
        # Wait 5 seconds
        time.sleep(5)
        
        # Second CPU usage sample
        result2 = subprocess.run(snmp_commands["CPU Usage"], capture_output=True, text=True, check=True)
        cpu_usage2 = parse_snmp_cpu_usage(result2.stdout)
        logging.info(f"Second CPU Usage sample: {cpu_usage2}%")

        # Calculate average
        if cpu_usage1 is not None and cpu_usage2 is not None:
            cpu_usage = (cpu_usage1 + cpu_usage2) / 2
            results["CPU Usage"] = cpu_usage
            last_known_values["CPU Usage"] = cpu_usage
            logging.info(f"Averaged CPU Usage: {cpu_usage}%")
            log_value("cpu_usage.log", cpu_usage, "%")
        elif cpu_usage1 is not None:
            cpu_usage = cpu_usage1
            results["CPU Usage"] = cpu_usage
            last_known_values["CPU Usage"] = cpu_usage
            logging.warning("Second CPU sample failed, using first sample")
            log_value("cpu_usage.log", cpu_usage, "%", is_last_known=True)
        elif cpu_usage2 is not None:
            cpu_usage = cpu_usage2
            results["CPU Usage"] = cpu_usage
            last_known_values["CPU Usage"] = cpu_usage
            logging.warning("First CPU sample failed, using second sample")
            log_value("cpu_usage.log", cpu_usage, "%", is_last_known=True)
        else:
            results["CPU Usage"] = last_known_values["CPU Usage"]
            log_value("cpu_usage.log", results["CPU Usage"], "%", is_last_known=True)
            logging.warning("Both CPU samples failed, using last known CPU Usage")
        print(f"\n[OUTPUT] CPU Usage:\n{results['CPU Usage']}%")
    except subprocess.CalledProcessError as e:
        logging.error(f"SNMP CPU Usage command failed: {e.stderr}")
        results["CPU Usage"] = last_known_values["CPU Usage"]
        log_value("cpu_usage.log", results["CPU Usage"], "%", is_last_known=True)
        print(f"\n[OUTPUT] CPU Usage:\n{results['CPU Usage']}% (last known)")

    # Memory Usage
    try:
        result = subprocess.run(snmp_commands["Memory Usage"], capture_output=True, text=True, check=True)
        memory_usage = parse_snmp_memory_usage(result.stdout)
        if memory_usage is not None:
            results["Memory Usage"] = memory_usage
            last_known_values["Memory Usage"] = memory_usage
            logging.info(f"Parsed Memory Usage: {memory_usage}%")
            log_value("mem_usage.log", memory_usage, "%")
        else:
            results["Memory Usage"] = last_known_values["Memory Usage"]
            log_value("mem_usage.log", results["Memory Usage"], "%", is_last_known=True)
            logging.warning("Using last known Memory Usage")
        print(f"\n[OUTPUT] Memory Usage:\n{results['Memory Usage']}%")
    except subprocess.CalledProcessError as e:
        logging.error(f"SNMP Memory Usage command failed: {e.stderr}")
        results["Memory Usage"] = last_known_values["Memory Usage"]
        log_value("mem_usage.log", results["Memory Usage"], "%", is_last_known=True)
        print(f"\n[OUTPUT] Memory Usage:\n{results['Memory Usage']}% (last known)")

    # Throughput
    try:
        result = subprocess.run(snmp_commands["Throughput"], capture_output=True, text=True, check=True)
        throughput = parse_throughput(result.stdout)
        if throughput is not None:
            results["Throughput"] = throughput
            last_known_values["Throughput"] = throughput
            logging.info(f"Parsed Throughput: {throughput} Mbps")
            log_value("throughput.log", throughput, "Mbps")
            print(f"\n[OUTPUT] Throughput:\n{throughput} Mbps")
        else:
            results["Throughput"] = last_known_values["Throughput"]
            log_value("throughput.log", results["Throughput"], "Mbps", is_last_known=True)
            logging.warning("Using last known Throughput")
            print(f"\n[OUTPUT] Throughput:\n{results['Throughput']} Mbps (last known)")
    except subprocess.CalledProcessError as e:
        logging.error(f"SNMP Throughput command failed: {e.stderr}")
        results["Throughput"] = last_known_values["Throughput"]
        log_value("throughput.log", results["Throughput"], "Mbps", is_last_known=True)
        print(f"\n[OUTPUT] Throughput:\n{results['Throughput']} Mbps (last known)")

    # WAN0 Packets — each OID fetched with snmpget (direct GET) to avoid
    # snmpwalk walking past the .2 instance to the next interface index
    try:
        wan_outputs = []
        for cmd in snmp_commands["WAN0 Packets"]:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            wan_outputs.append(result.stdout)
        in_packets, out_packets, in_discards, out_discards = parse_wan_packets(wan_outputs)
        if None not in (in_packets, out_packets, in_discards, out_discards):
            results["WAN0 Packets"] = f"RX packets:{in_packets} TX packets:{out_packets}"
            results["WAN0 Dropped Packets"] = f"RX dropped:{in_discards} TX dropped:{out_discards}"
            last_known_values["WAN0 Packets"] = {"in_packets": in_packets, "out_packets": out_packets}
            last_known_values["WAN0 Dropped Packets"] = {"in_discards": in_discards, "out_discards": out_discards}
            logging.info(f"Parsed WAN0 Packets: RX={in_packets}, TX={out_packets}")
            logging.info(f"Parsed WAN0 Dropped Packets: RX={in_discards}, TX={out_discards}")
            log_value("wan0_stats.log",
                      f"IP address:{ip_address} RX packets:{in_packets} TX packets:{out_packets} "
                      f"RX dropped:{in_discards} TX dropped:{out_discards} Reachable:{is_reachable}",
                      "", overwrite=True)
        else:
            results["WAN0 Packets"] = f"RX packets:{last_known_values['WAN0 Packets']['in_packets']} TX packets:{last_known_values['WAN0 Packets']['out_packets']}"
            results["WAN0 Dropped Packets"] = f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']}"
            log_value("wan0_stats.log",
                      f"IP address:{ip_address} RX packets:{last_known_values['WAN0 Packets']['in_packets']} "
                      f"TX packets:{last_known_values['WAN0 Packets']['out_packets']} "
                      f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} "
                      f"TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']} Reachable:{is_reachable}",
                      "", overwrite=True, is_last_known=True)
            logging.warning("Using last known WAN0 Packets")
        print(f"\n[OUTPUT] WAN0 Packets:\n{results['WAN0 Packets']}")
        print(f"\n[OUTPUT] WAN0 Dropped Packets:\n{results['WAN0 Dropped Packets']}")
    except subprocess.CalledProcessError as e:
        logging.error(f"SNMP WAN0 Packets/Dropped Packets command failed: {e.stderr}")
        results["WAN0 Packets"] = f"RX packets:{last_known_values['WAN0 Packets']['in_packets']} TX packets:{last_known_values['WAN0 Packets']['out_packets']}"
        results["WAN0 Dropped Packets"] = f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']}"
        log_value("wan0_stats.log",
                  f"IP address:{ip_address} RX packets:{last_known_values['WAN0 Packets']['in_packets']} "
                  f"TX packets:{last_known_values['WAN0 Packets']['out_packets']} "
                  f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} "
                  f"TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']} Reachable:{is_reachable}",
                  "", overwrite=True, is_last_known=True)
        print(f"\n[OUTPUT] WAN0 Packets:\n{results['WAN0 Packets']} (last known)")
        print(f"\n[OUTPUT] WAN0 Dropped Packets:\n{results['WAN0 Dropped Packets']} (last known)")

    return results

def run_monitor_loop(poll_interval=5):
    """Poll forever. Re-reads config.json each iteration so a device IP or
    community changed via the dashboard's Settings takes effect on this
    loop's very next poll, without needing to restart the app."""
    try:
        while True:
            cfg = load_config()
            get_modem_stats(cfg["cm_ip"], cfg["snmp_community"])
            logging.info(f"Waiting {poll_interval} seconds before next poll...")
            time.sleep(poll_interval)
    except KeyboardInterrupt:
        logging.info("Monitor loop terminated by user.")
    except Exception as e:
        logging.error(f"Monitor loop terminated due to error: {e}")

if __name__ == "__main__":
    run_monitor_loop()