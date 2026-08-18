import logging
import time
import re
import subprocess
import platform
import argparse

from utils import log_value

# Set up argument parser. Defaults are just a safety net for an unsupported
# bare invocation - start.sh (the only entry point this app is actually run
# through, in Docker or standalone) always passes both flags explicitly,
# resolving them from its own env-var defaults, so an os.getenv() layer here
# would just duplicate that and never actually take effect.
parser = argparse.ArgumentParser(description="SNMP Modem Statistics Collector")
parser.add_argument("--community", default="dilip-one", help="SNMP community string (default: dilip-one)")
parser.add_argument("--host", default="192.168.246.100", help="SNMP host address (default: 192.168.246.100)")
args = parser.parse_args()

# Assign arguments to variables
SNMP_COMMUNITY_READ = args.community
SNMP_HOST = args.host

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
    """Parse Free Memory in kB from SNMP tinnoLiveMemoryStat output."""
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
    """Parse ifInUcastPkts, ifOutUcastPkts, ifInDiscards, and ifOutDiscards from SNMP output."""
    in_match = re.search(r"(?:IF-MIB::ifInUcastPkts\.2|iso\.3\.6\.1\.2\.1\.2\.2\.1\.11\.2)\s*=\s*Counter32:\s*(\d+)", snmp_output)
    out_match = re.search(r"(?:IF-MIB::ifOutUcastPkts\.2|iso\.3\.6\.1\.2\.1\.2\.2\.1\.17\.2)\s*=\s*Counter32:\s*(\d+)", snmp_output)
    in_discards_match = re.search(r"(?:IF-MIB::ifInDiscards\.2|iso\.3\.6\.1\.2\.1\.2\.2\.1\.13\.2)\s*=\s*Counter32:\s*(\d+)", snmp_output)
    out_discards_match = re.search(r"(?:IF-MIB::ifOutDiscards\.2|iso\.3\.6\.1\.2\.1\.2\.2\.1\.19\.2)\s*=\s*Counter32:\s*(\d+)", snmp_output)
    if in_match and out_match and in_discards_match and out_discards_match:
        return (
            int(in_match.group(1)),
            int(out_match.group(1)),
            int(in_discards_match.group(1)),
            int(out_discards_match.group(1))
        )
    logging.warning("Could not parse packet counts from SNMP output")
    logging.info(f"Raw SNMP output for packet counts: {repr(snmp_output)}")  # Log raw output for debugging
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

def get_modem_stats(hostname=SNMP_HOST):
    results = {}
    is_reachable = check_host_reachability(hostname)
    ip_address = hostname if is_reachable else "Unknown"

    snmp_commands = {
        "CPU Usage": ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.4.1.62596.1.1.1.51"],
        "Memory Usage": ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.4.1.62596.1.1.1.52"],
        "Throughput": ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.4.1.62596.1.1.1.24"],
        "WAN0 Packets": [
            ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.2.1.2.2.1.11.2"],
            ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.2.1.2.2.1.17.2"],
            ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.2.1.2.2.1.13.2"],
            ["snmpwalk", "-v", "2c", "-c", SNMP_COMMUNITY_READ, hostname, "1.3.6.1.2.1.2.2.1.19.2"]
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
        log_value("free_memory.log", results["Memory Usage"], "kB", is_last_known=True)
        log_value("throughput.log", results["Throughput"], "Mbps", is_last_known=True)
        log_value("wan0_stats.log",
                  f"IP address:{ip_address} RX packets:{last_known_values['WAN0 Packets']['in_packets']} "
                  f"TX packets:{last_known_values['WAN0 Packets']['out_packets']} "
                  f"RX dropped:{last_known_values['WAN0 Dropped Packets']['in_discards']} "
                  f"TX dropped:{last_known_values['WAN0 Dropped Packets']['out_discards']} Reachable:{is_reachable}",
                  "", overwrite=True, is_last_known=True)
        print(f"\n[OUTPUT] CPU Usage:\n{results['CPU Usage']}% (last known)")
        print(f"\n[OUTPUT] Memory Usage:\n{results['Memory Usage']} kB (last known)")
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
            logging.info(f"Parsed Memory Usage: {memory_usage} kB")
            log_value("free_memory.log", memory_usage, "kB")
        else:
            results["Memory Usage"] = last_known_values["Memory Usage"]
            log_value("free_memory.log", results["Memory Usage"], "kB", is_last_known=True)
            logging.warning("Using last known Memory Usage")
        print(f"\n[OUTPUT] Memory Usage:\n{results['Memory Usage']} kB")
    except subprocess.CalledProcessError as e:
        logging.error(f"SNMP Memory Usage command failed: {e.stderr}")
        results["Memory Usage"] = last_known_values["Memory Usage"]
        log_value("free_memory.log", results["Memory Usage"], "kB", is_last_known=True)
        print(f"\n[OUTPUT] Memory Usage:\n{results['Memory Usage']} kB (last known)")

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

    # WAN0 Packets
    try:
        combined_output = ""
        for cmd in snmp_commands["WAN0 Packets"]:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            combined_output += result.stdout + "\n"
        in_packets, out_packets, in_discards, out_discards = parse_packet_counts(combined_output)
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

if __name__ == "__main__":
    try:
        while True:
            get_modem_stats()
            logging.info("Waiting 5 seconds before next poll...")
            time.sleep(5)
    except KeyboardInterrupt:
        logging.info("Script terminated by user.")
    except Exception as e:
        logging.error(f"Script terminated due to error: {e}")