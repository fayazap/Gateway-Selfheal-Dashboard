import { useState, useEffect, useRef } from "react";
import { Toast } from 'primereact/toast';
import loadingGif from '../assets/loading.gif';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";

const PRIMARY = "#037A53";
const DANGER = "#dc2626";
const WARNING = "#d97706";
const INFO = "#2563eb";
const MUTED = "#6b7280";

let K_SIGMA = "-";
let SUSTAIN_K = "-";
let NEW_CPU_THRESH = "-";
let NEW_MEM_THRESH = "-";

const BASELINES = {};

const PROCESS_RULES = [
  { match: [/anomaly-detection/i], name: "Anomaly Detection Engine", category: "AI Services" },
  { match: [/growmem_leak\.py/i, /growmem_leak/i, /simulate_anomaly\.py/i, /simulate_anomaly/i], name: "Memory Leak Script", category: "AI Services" },
  { match: [/\/usr\/bin\/python3 \/etc\/AI-ag/i, /AI-ag/i, /python3/i], name: "Python AI Agent Service", category: "AI Services" },
  { match: [/selfheal/i], name: "Self-Heal Manager", category: "AI Services" },
  { match: [/packet-interception/i], name: "Packet Inspection Service", category: "Security" },
  { match: [/ndpi/i], name: "Deep Packet Inspection Engine", category: "Security" },
  { match: [/tr181-security/i], name: "TR-181 Security Manager", category: "Security" },
  { match: [/tr181-firewall/i], name: "TR-181 Firewall Manager", category: "Security" },
  { match: [/acl-manager/i], name: "ACL Setup Manager", category: "Security" },
  { match: [/ipsec/i, /charon/i, /starter/i], name: "IPSec VPN Service", category: "Security" },
  { match: [/hostapd/i], name: "WiFi Access Point Manager", category: "Wireless" },
  { match: [/wld/i], name: "Wireless Driver Manager", category: "Wireless" },
  { match: [/mesh-manager/i], name: "Mesh Network Controller", category: "Wireless" },
  { match: [/channel-analyzer/i], name: "WiFi Channel Analyzer", category: "Wireless" },
  { match: [/wifi-sensing/i], name: "WiFi Sensing Service", category: "Wireless" },
  { match: [/mtlk_wlan/i, /wlan/i, /mtlk_monscan/i, /monscan/i], name: "WiFi Kernel Module / Monitor", category: "Wireless" },
  { match: [/wifi-schedul/i], name: "WiFi Scheduler (AMXRT)", category: "Wireless" },
  { match: [/dwpal_daemon/i], name: "DWPAL Daemon", category: "Wireless" },
  { match: [/dnsmasq/i], name: "DNS/DHCP Server", category: "Networking" },
  { match: [/odhcpd/i], name: "IPv6 DHCP Server", category: "Networking" },
  { match: [/odhcp6c/i], name: "IPv6 DHCP Client", category: "Networking" },
  { match: [/unbound/i, /umdns/i], name: "Unbound/UMDNS Proxy Agent", category: "Networking" },
  { match: [/wan-manager/i], name: "WAN Management Service", category: "Networking" },
  { match: [/routing-manager/i], name: "Routing Management Service", category: "Networking" },
  { match: [/multi_wan/i], name: "Multi WAN Controller", category: "Networking" },
  { match: [/internet_check/i], name: "Connectivity Checker", category: "Networking" },
  { match: [/lte-manager/i], name: "LTE Interface Manager", category: "Networking" },
  { match: [/tr181-dns/i, /tr181-dnssd/i, /tr181-dynamicdns/i], name: "TR-181 DNS Subsystem", category: "Networking" },
  { match: [/tr181-dhcpv4/i, /tr181-dhcpv6/i, /dhcpv4-manager/i, /dhcpv6s-manager/i], name: "TR-181 DHCP Subsystem", category: "Networking" },
  { match: [/tr181-ppp/i, /tr181-dslite/i], name: "TR-181 PPP / DS-Lite", category: "Networking" },
  { match: [/tr181-bridging/i, /tr181-logical/i, /tr181-neighbordiscovery/i, /tr181-routeradvertisement/i, /tr181-pcp/i], name: "TR-181 L2/L3 Managers", category: "Networking" },
  { match: [/netmodel/i, /netmodel-clients/i, /netdev-plugin/i, /ethernet-manager/i, /ip-manager/i, /hosts-manager/i, /mstpd/i], name: "Core Network Managers", category: "Networking" },
  { match: [/mcastd/i, /mxl-mcastd/i, /mld/i], name: "Multicast Daemon (IGMP/MLD)", category: "Networking" },
  { match: [/xl2tpd/i], name: "L2TP Daemon", category: "Networking" },
  { match: [/eth0_/i], name: "Ethernet Kernel Tasks", category: "Networking" },
  { match: [/tr181-qos/i], name: "TR-181 QoS Manager", category: "Device Management" },
  { match: [/tr181-device/i], name: "TR-181 Device Manager", category: "Device Management" },
  { match: [/tr181-temperature/i, /tr181-sfp/i, /tr181-led/i, /tr181-button/i], name: "TR-181 Hardware Monitors", category: "Hardware Monitoring" },
  { match: [/tr181-xpon/i, /omcid/i], name: "TR-181 xPON Systems", category: "Hardware Monitoring" },
  { match: [/obuspa/i], name: "USP Agent (TR-369)", category: "Device Management" },
  { match: [/cwmp/i, /cwmp_plugin/i], name: "TR-069 CWMP Client", category: "Device Management" },
  { match: [/gmap-server/i, /gmap-client/i], name: "GMAP Topology Agent", category: "Device Management" },
  { match: [/tr181-ipdiagnostics/i], name: "IP Diagnostics Server", category: "Device Management" },
  { match: [/tr181-usermanagement/i], name: "TR-181 User Manager", category: "Device Management" },
  { match: [/tr181-periodicfileupload/i, /tr181-bulkdata/i], name: "TR-181 Bulk Data Transport", category: "Device Management" },
  { match: [/deviceinfo-manager/i, /deviceinfo-system/i], name: "Device Info Handlers", category: "Device Management" },
  { match: [/amx_monitor_dm/i, /amx-faultmonitor/i, /amx-processmonitor/i], name: "AMX Framework Monitors", category: "Device Management" },
  { match: [/multisettings/i, /pcm-manager/i, /time-manager/i], name: "General Device Conf", category: "Device Management" },
  { match: [/tr181-captiveportal/i, /tr181-httpaccess/i], name: "TR-181 Portal Access", category: "Device Management" },
  { match: [/dropbear/i, /ssh_server/i], name: "SSH Remote Access Server", category: "System" },
  { match: [/vsftpd/i], name: "FTP Delivery Daemon", category: "System" },
  { match: [/syslog-ng/i, /logread/i, /tr181-syslog/i], name: "System Logging Service", category: "System" },
  { match: [/chronyd/i], name: "NTP Time Synchronization", category: "System" },
  { match: [/crond/i], name: "Cron Scheduler Service", category: "System" },
  { match: [/lighttpd/i], name: "Web Management Server", category: "Web Services" },
  { match: [/mosquitto/i, /tr181-mqtt/i], name: "MQTT Messaging Broker", category: "Messaging" },
  { match: [/ubusd/i], name: "UBUS IPC Daemon", category: "System" },
  { match: [/rpcd/i], name: "RPC Service Daemon", category: "System" },
  { match: [/procd/i], name: "OpenWRT Init Process", category: "System" },
  { match: [/blockd/i, /tr181-usb/i], name: "Block Device Manager / USB Firmware", category: "System" },
  { match: [/reboot-service/i], name: "System Reboot Monitor", category: "System" },
  { match: [/voipd/i], name: "Voice-over-IP Daemon", category: "System" },
  { match: [/tail/i, /head/i, /grep/i, /ash/i, /sleep/i], name: "Ash/Shell Scripts", category: "Scripts" },
  { match: [/ubus-cli/i], name: "UBUS Terminal Invocation", category: "Scripts" },
  { match: [/tn-speedtest/i], name: "Speedtest Daemon", category: "Utilities" },
  { match: [/tn-fcgi/i], name: "FastCGI Service", category: "Utilities" },
  { match: [/dump_handler/i, /rcvry_monito/i, /oopsmonitor/i], name: "Crash / Dump Trackers", category: "Utilities" },
  { match: [/cthulhu/i, /rlyeh/i, /timingila/i, /afcd/i], name: "LXC Container Mgmt (Prpl)", category: "System" },
  { match: [/kworker/i, /ksoftirqd/i, /kthreadd/i, /cpuhp/i, /Session Manager/i, /kstrp/i, /TAPItimers/i, /TAPIevents/i], name: "Kernel CPU Worker", category: "Kernel" },
  { match: [/rcu/i, /rcu_preempt/i, /rcu_gp/i, /rcu_par_gp/i], name: "RCU Kernel Sync", category: "Kernel" },
  { match: [/irq\//i], name: "Interrupt Handlers", category: "Kernel" },
  { match: [/migration/i], name: "CPU Migration Scheduler", category: "Kernel" },
  { match: [/mmc/i, /sdhci/i, /ata/i, /spi/i], name: "Hardware I/O Storage", category: "Kernel" },
  { match: [/jbd2/i, /ext4/i], name: "EXT4 File-system Journal", category: "Kernel" },
  { match: [/kswapd/i, /khugepaged/i, /kcompactd/i, /oom_reaper/i, /slub_flushwq/i, /mm_percpu_wq/i], name: "Memory Management Driver", category: "Kernel" },
  { match: [/kblockd/i, /kthrotld/i, /writeback/i, /cryptd/i, /uas/i, /dma_wq/i, /blkcg_punt_bio/i], name: "Kernel Storage Cryptography", category: "Kernel" },
  { match: [/netns/i, /inet_frag_wq/i, /cfg80211/i, /ipv6/i], name: "Kernel IP / Routing Socket", category: "Kernel" },
  { match: [/watchdogd/i], name: "Watchdog Timer", category: "Kernel" }
];

const getProcessInfo = (cmd) => {
  if (!cmd) return { name: "Unknown", category: "Unknown" };
  for (const rule of PROCESS_RULES) {
    if (rule.match.some(regex => regex.test(cmd))) {
      return { name: rule.name, category: rule.category };
    }
  }
  return { name: getProcessName(cmd), category: "Other System Tasks" };
};

const getProcessName = (cmd) => {
  if (!cmd) return "Unknown";
  let clean = cmd.trim().replace(/^["']|["']$/g, '');
  const parts = clean.split(/\s+/);
  
  // Drop known environment vars like VAR=value before the executable
  while(parts.length && parts[0].includes('=')) parts.shift();
  if (!parts.length) return cmd.split('/').pop().replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const interpreters = ["python", "python3", "node", "bash", "sh", "ruby", "perl", "ubus-cli"];
  
  let exe = parts[0].split('/').pop();
  let target = exe;
  let context = "";

  if (interpreters.includes(exe) && parts.length > 1) {
    let scriptPath = parts[1];
    if (!scriptPath.startsWith('-')) target = scriptPath.split('/').pop();
    else if (parts[1] === '-m' && parts.length > 2) target = parts[2];
    else if (exe === 'ubus-cli') target = parts.slice(1).find(p => !p.startsWith('-')) || parts[1];
  } else if (exe === 'grep' || exe === 'awk') {
    context = parts.slice(1).join(' ').replace(/['"]/g, '');
  }

  // Format smartly
  target = target.replace(/\.(py|js|sh)$/, ''); // remove extensions
  target = target.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); // Title Case
  
  if (context) {
    if (context.length > 15) context = context.substring(0, 15) + '...';
    return `${target} "${context}"`;
  }
  
  return target;
};

const getStatus = (p) => {
  if (p.type === "unknown") {
    return p.cpu > NEW_CPU_THRESH || p.mem > NEW_MEM_THRESH ? "anomaly" : "watch";
  }
  const b = BASELINES[p.pid];
  if (!b) return "normal";
  if (p.cpu > b.cpu_mean + K_SIGMA * b.cpu_std) return "anomaly";
  if (p.cpu > b.cpu_mean + K_SIGMA * b.cpu_std * 0.7) return "warning";
  return "normal";
};

const STATUS = {
  anomaly: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", dot: DANGER,  label: "ANOMALY" },
  warning: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", dot: WARNING, label: "WARNING" },
  normal:  { bg: "#f0fdf4", border: "#86efac", text: "#166534", dot: "#22c55e", label: "NORMAL" },
  watch:   { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af", dot: INFO,    label: "WATCH"   },
};

const CpuBar = ({ val, max = 10 }) => {
  const pct = Math.min((val / max) * 100, 100);
  const color = val > 5 ? DANGER : val > 2 ? WARNING : PRIMARY;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <div style={{ width: 48, height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 12, color: val > 5 ? DANGER : "#111827",
        fontWeight: val > 3 ? 600 : 400, minWidth: 32, textAlign: "right" }}>
        {val.toFixed(1)}
      </span>
    </div>
  );
};

const MemBar = ({ val, max = 8 }) => {
  const pct = Math.min((val / max) * 100, 100);
  const color = val > 5 ? DANGER : PRIMARY;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <div style={{ width: 38, height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#111827", minWidth: 28, textAlign: "right" }}>
        {val.toFixed(1)}
      </span>
    </div>
  );
};

const Shield = ({ size = 18, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const ToggleSwitch = ({ on, onToggle }) => (
  <div onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12,
    background: on ? PRIMARY : "#d1d5db", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
    <div style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20,
      borderRadius: "50%", background: "#fff", transition: "left 0.2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
  </div>
);

export default function AnomalyDetectionDashboard() {
  const [enabled, setEnabled]     = useState(null);
  const [procs, setProcs]         = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [history, setHistory]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [lastSeen, setLastSeen]   = useState(null);
  const [loading, setLoading]     = useState(true);

  const [top5Series, setTop5Series] = useState([]);
  const [activeAlertTab, setActiveAlertTab] = useState("logs");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailReceiver, setEmailReceiver] = useState("");
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);
  const [rawConfigText, setRawConfigText] = useState("");

  const killedPidsRef = useRef(new Set());
  const killedAlertPidsRef = useRef(new Set());
  const clearedAlertIndexesRef = useRef(new Set());
  const anomalyToastPidsRef = useRef(new Set());
  const lastDataTsRef = useRef(0);
  const toastRef = useRef(null);

  const API_BASE = `http://${window.location.hostname}:5000/api`;

  useEffect(() => {
    // Fetch initial config & status regardless of `enabled` local state
    const fetchStatus = async () => {
      try {
        const statsRes = await fetch(`${API_BASE}/anomaly-detection/status`);
        const statusTxt = await statsRes.text();
        // If UBUS returns Device.AIServices.AnomalyDetection.Enable=1
        setEnabled(statusTxt.includes('1') || statusTxt.includes('true'));

        // Fetch config
        const configRes = await fetch(`${API_BASE}/anomaly-detection/config`);
        const configTxt = await configRes.text();
        setRawConfigText(configTxt);
        
        const enabledMatch = configTxt.match(/EMAIL_ENABLED\s*=\s*(True|False)/i);
        if (enabledMatch) {
          setEmailEnabled(enabledMatch[1].toLowerCase() === 'true');
        }
        const receiverMatch = configTxt.match(/EMAIL_RECEIVER\s*=\s*['"]([^'"]+)['"]/i);
        if (receiverMatch) {
          setEmailReceiver(receiverMatch[1]);
        }
      } catch (err) {
        console.error('Failed to fetch status:', err);
      }
    };
    fetchStatus();
  }, []);

  const handleToggle = async () => {
    const newState = !enabled;
    if (newState) setLoading(true);
    setEnabled(newState);
    try {
      await fetch(`${API_BASE}/anomaly-detection/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: newState })
      });
    } catch(err) {
      console.error(err);
    }
  };

  const handleSaveEmailConfig = async () => {
    setIsSavingEmailConfig(true);
    try {
      let newConfig = rawConfigText;
      
      if (/EMAIL_ENABLED\s*=\s*(True|False)/i.test(newConfig)) {
        newConfig = newConfig.replace(/EMAIL_ENABLED\s*=\s*(True|False)/i, `EMAIL_ENABLED = ${emailEnabled ? 'True' : 'False'}`);
      } else {
        newConfig += `\nEMAIL_ENABLED = ${emailEnabled ? 'True' : 'False'}\n`;
      }

      if (/EMAIL_RECEIVER\s*=\s*['"]([^'"]+)['"]/i.test(newConfig)) {
        newConfig = newConfig.replace(/EMAIL_RECEIVER\s*=\s*['"]([^'"]+)['"]/i, `EMAIL_RECEIVER = "${emailReceiver}"`);
      } else {
        newConfig += `EMAIL_RECEIVER = "${emailReceiver}"\n`;
      }
      
      setRawConfigText(newConfig);

      await fetch(`${API_BASE}/anomaly-detection/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: newConfig })
      });
      
      toastRef.current?.show({
        severity: 'success',
        summary: 'Config Saved',
        detail: 'Email Configuration updated successfully',
        life: 3000
      });
      setActiveAlertTab("logs");
    } catch (err) {
      console.error('Failed to save config:', err);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update configuration',
        life: 3000
      });
    } finally {
      setIsSavingEmailConfig(false);
    }
  };

  const killProcess = async (pid, e) => {
    if (e) e.stopPropagation();
    
    const target = procs.find(p => p.pid === pid) || alerts.find(a => a.pid === pid);
    const processName = target ? (target.label || (target.process ? target.process.split("/").pop() : "")) : `Process ${pid}`;

    // Show sticky confirmation toast with Confirm button
    toastRef.current?.show({
      severity: 'warn',
      summary: 'Kill Process?',
      sticky: true,
      content: (props) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ lineHeight: 1.4 }}>
            Are you sure you want to kill <strong>"{processName}"</strong>?
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => toastRef.current?.clear()}
              style={{
                padding: '6px 14px', borderRadius: 4, border: '1px solid #d97706',
                background: '#fff', color: '#d97706', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.target.style.background = '#fffbeb'; }}
              onMouseOut={(e) => { e.target.style.background = '#fff'; }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                toastRef.current?.clear();
                
                // Remember as killed so future fetches ignore it until it disappears from CSV
                killedPidsRef.current.add(pid);
                killedAlertPidsRef.current.add(pid);

                // Optimistically update UI
                setProcs(prev => prev.filter(p => p.pid !== pid));
                if (selected && selected.pid === pid) setSelected(null);
                setAlerts(prev => prev.filter(a => a.pid !== pid));

                try {
                  await fetch(`${API_BASE}/anomaly-detection/kill`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pid })
                  });
                  
                  // Show success toast
                  toastRef.current?.show({
                    severity: 'success',
                    summary: 'Process Killed',
                    detail: `"${processName}" has been successfully killed.`,
                    life: 4000
                  });
                } catch (err) {
                  console.error("Failed to kill process:", err);
                  toastRef.current?.show({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to kill the process. Please try again.',
                    life: 4000
                  });
                }
              }}
              style={{
                padding: '6px 14px', borderRadius: 4, border: 'none',
                background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.target.style.opacity = 0.9; }}
              onMouseOut={(e) => { e.target.style.opacity = 1; }}
            >
              Confirm
            </button>
          </div>
        </div>
      )
    });
  };

  const clearAlert = async (alertItem, e) => {
    if (e) e.stopPropagation();

    const alertName = (alertItem.process || alertItem.label || `PID ${alertItem.pid}`).split("/").pop();

    try {
      const response = await fetch(`${API_BASE}/anomaly-detection/clear-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: alertItem.alertIndex })
      });

      if (!response.ok) {
        throw new Error(`Clear request failed with status ${response.status}`);
      }

      clearedAlertIndexesRef.current.add(String(alertItem.alertIndex));
      setAlerts(prev => prev.filter(alert => alert.alertIndex !== alertItem.alertIndex));

      toastRef.current?.show({
        severity: 'warn',
        summary: 'Alert Cleared',
        detail: `${alertName} Alert has been cleared !`,
        life: 4000
      });
    } catch (err) {
      console.error('Failed to clear alert:', err);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to clear the alert. Please try again.',
        life: 4000
      });
    }
  };

  useEffect(() => {
    if (enabled === null) return;
    
    if (enabled === false) {
      setLoading(false);
      return;
    }
    
    let iv;
    let currentInterval = 3000; // Search fast initially until data populates

    const fetchData = async () => {
      try {
        const [liveRes, topRes, alertRes, configRes] = await Promise.all([
          fetch(`${API_BASE}/anomaly-detection/live-data`),
          fetch(`${API_BASE}/anomaly-detection/top-process`),
          fetch(`${API_BASE}/anomaly-detection/alerts`),
          fetch(`${API_BASE}/anomaly-detection/config`)
        ]);
        
        if (!liveRes.ok || !topRes.ok || !alertRes.ok || !configRes.ok) throw new Error('Fetch failed');
        
        const liveCsv = await liveRes.text();
        const topCsv = await topRes.text();
        const alertTxt = await alertRes.text();
        const configTxt = await configRes.text();

        // 0. Parse Config.py
        const configLines = configTxt.split('\n');
        configLines.forEach(line => {
          if (line.includes('=')) {
            const [key, val] = line.split('=').map(s => s.trim());
            if (key === 'K_SIGMA' && !isNaN(parseFloat(val))) K_SIGMA = parseFloat(val);
            if (key === 'SUSTAIN_K' && !isNaN(parseInt(val))) SUSTAIN_K = parseInt(val);
            if (key === 'NEW_PROC_CPU_THRESHOLD' && !isNaN(parseFloat(val))) NEW_CPU_THRESH = parseFloat(val);
            if (key === 'NEW_PROC_MEM_THRESHOLD' && !isNaN(parseFloat(val))) NEW_MEM_THRESH = parseFloat(val);
          }
        });

        // 1. Parse live_data.csv (Backend now ALREADY filters and returns ONLY the latest timestamp block)
        const lines = liveCsv.split('\n');
        const newProcs = [];
        let maxTimestamp = new Date(0);
        let currentPids = new Set();
        
        lines.forEach(line => {
          const l = line.trim();
          if (!l) return;
          
          const parts = l.split(',');
          if (parts.length >= 6) {
            const ts = parts[0];
            const tsDate = new Date(ts);
            if (tsDate > maxTimestamp) maxTimestamp = tsDate;
            
            const mem = parseFloat(parts[parts.length - 1]);
            const cpu = parseFloat(parts[parts.length - 2]);
            
            // Skip dormant ghost processes
            if (cpu === 0 && mem === 0) return;
            
            const pid = parseInt(parts[2]);
            currentPids.add(pid);
            
            // Skip process if it was recently killed
            if (killedPidsRef.current.has(pid)) return;
            
            // Reconstruct cmd in case it contained commas
            let cmd = parts.slice(3, parts.length - 2).join(',');
            // Remove surrounding quotes if they exist
            if (cmd.startsWith('"') && cmd.endsWith('"')) {
              cmd = cmd.substring(1, cmd.length - 1);
            }
            
            // Skip specified internal processes
            if (cmd.includes('ubus-cli Device.AIServices.') ||
                cmd.includes('awk') ||
                cmd.includes('anomaly-detection -D') ||
                cmd.includes('grep ^')) {
              return;
            }

            // Skip AI-agent process when its CPU load exceeds 60%
            if (cmd.includes('/etc/AI-ag') && cpu > 60) {
              return;
            }

            const info = getProcessInfo(cmd);
            newProcs.push({
              pid, cmd, label: info.name, category: info.category, cpu, mem, type: "unknown", timestamp: ts
            });
          }
        });
        
        const isNewData = maxTimestamp.getTime() > lastDataTsRef.current;
        
        if (isNewData) {
          lastDataTsRef.current = maxTimestamp.getTime();
          // Clean up killed PIDs that are no longer reported by the target OS
          for (let kPid of killedPidsRef.current) {
            if (!currentPids.has(kPid)) {
              killedPidsRef.current.delete(kPid);
            }
          }

          // Raise warning toast once when a process newly enters anomaly state.
          const currentAnomalyPids = new Set();
          newProcs.forEach((p) => {
            if (getStatus(p) === "anomaly") {
              currentAnomalyPids.add(p.pid);
              if (!anomalyToastPidsRef.current.has(p.pid)) {
                const processName = (p.label || p.cmd || `PID ${p.pid}`).split("/").pop();
                toastRef.current?.show({
                  severity: 'warn',
                  summary: 'Anomaly Detected',
                  detail: `Process "${processName}" (PID: ${p.pid}) crossed anomaly threshold.`,
                  life: 5000,
                });
              }
            }
          });

          anomalyToastPidsRef.current = currentAnomalyPids;
          
          setProcs(newProcs);
          if (maxTimestamp.getTime() > 0) setLastSeen(maxTimestamp);
        }

        // 1.b Parse top_process.csv for timeline (up to 30 intervals)
        const topLines = topCsv.split('\n');
        const groupedByTime = {};
        const allTopLabels = new Set();
        
        topLines.forEach(line => {
          const parts = line.trim().split(',');
          if (parts.length >= 6 && !parts[0].startsWith('timestamp')) {
            const tsStr = parts[0];
            const tsDate = new Date(tsStr);
            if (isNaN(tsDate.getTime())) return;
            
            const timeStr = `${String(tsDate.getHours()).padStart(2,"0")}:${String(tsDate.getMinutes()).padStart(2,"0")}`;
            
            const cpu = parseFloat(parts[parts.length - 2]) || 0;
            
            let cmd = parts.slice(3, parts.length - 2).join(',');
            if (cmd.startsWith('"') && cmd.endsWith('"')) {
              cmd = cmd.substring(1, cmd.length - 1);
            }
            
            // Skip same internal processes as Process Monitor
            if (cmd.includes('ubus-cli Device.AIServices.') ||
                cmd.includes('awk') ||
                cmd.includes('anomaly-detection -D') ||
                cmd.includes('grep ^')) {
              return;
            }

            // Skip AI-agent process when its CPU load exceeds 60%
            if (cmd.includes('/etc/AI-ag') && cpu > 60) {
              return;
            }

            const cleanLabel = getProcessInfo(cmd).name;
            if (!groupedByTime[timeStr]) {
              groupedByTime[timeStr] = { time: timeStr, _rawDate: tsDate };
            }
            groupedByTime[timeStr][cleanLabel] = cpu;
            allTopLabels.add(cleanLabel);
          }
        });
        
        const newHistory = Object.values(groupedByTime).map(entry => {
          const filtered = { ...entry };
          Object.keys(filtered).forEach(key => {
            if (key !== 'time' && key !== '_rawDate' && typeof filtered[key] === 'number' && filtered[key] > 100) {
              delete filtered[key];
            }
          });
          return filtered;
        }).sort((a,b) => a._rawDate - b._rawDate);
        setHistory(newHistory.slice(-30)); // Display last 30 intervals
        
        const COLORS = [DANGER, WARNING, PRIMARY, "#8b5cf6", "#0891b2", "#ea580c", "#c026d3", "#0284c7"];
        setTop5Series([...allTopLabels].map((label, idx) => ({
          key: label,
          color: COLORS[idx % COLORS.length],
          name: label.split(' ')[0], // short name
        })));
        
        // Log data grabbed successfully, switch to fast polling to avoid delay
        if (currentInterval !== 10000) {
          clearInterval(iv);
          currentInterval = 10000;
          iv = setInterval(fetchData, currentInterval);
        }
        setLoading(false);
        
        // 2. Parse Alerts from UBUS text output
        const alertsParsed = [];
        const linesAlert = alertTxt.split('\n');
        const parsedAlertObj = {};
        
        linesAlert.forEach(line => {
          if (line.includes('=')) {
             const [key, val] = line.split('=');
             parsedAlertObj[key.trim()] = val.trim().replace(/"/g, '');
          }
        });
        
        const anomalyIndexes = new Set();
        Object.keys(parsedAlertObj).forEach(key => {
          const match = key.match(/Processed_data\.(\d+)\./);
          if (match) anomalyIndexes.add(match[1]);
        });
        
        let alertId = 1;
        anomalyIndexes.forEach(idx => {
          const prefix = `Device.AIServices.AnomalyDetection.Processed_data.${idx}.`;
          const aPid = parseInt(parsedAlertObj[prefix + 'ProcessID'] || 0);

          if (clearedAlertIndexesRef.current.has(idx)) return;
          
          if (killedAlertPidsRef.current.has(aPid)) return;

          alertsParsed.push({
            id: alertId++,
            alertIndex: idx,
            pid: aPid,
            process: getProcessInfo(parsedAlertObj[prefix + 'ProcessCMD'] || 'Unknown').name,
            cpu: parseFloat(parsedAlertObj[prefix + 'CPU_usage_percentage'] || 0),
            mem: parseFloat(parsedAlertObj[prefix + 'MemusagePercentage'] || 0),
            timestamp: parsedAlertObj[prefix + 'Timestamp'] || new Date().toISOString(),
            severity: "critical",
            type: "unknown",
            message: `Anomaly logged for Process ID ${parsedAlertObj[prefix + 'ProcessID']}!`,
          });
        });

        clearedAlertIndexesRef.current.forEach((idx) => {
          if (!anomalyIndexes.has(idx)) {
            clearedAlertIndexesRef.current.delete(idx);
          }
        });
        
        setAlerts(alertsParsed.slice(-15).reverse());
        
      } catch (err) {
        console.error('Failed to fetch anomaly data:', err);
      }
    };
    
    fetchData(); // Initial load
    iv = setInterval(fetchData, currentInterval); // Start with fast polling
    return () => clearInterval(iv);
  }, [enabled, API_BASE]);

  const sorted      = [...procs].filter(p => p.cpu <= 100).sort((a, b) => b.cpu !== a.cpu ? b.cpu - a.cpu : b.mem - a.mem);
  const anomalyN    = procs.filter(p => getStatus(p) === "anomaly").length;
  const warningN    = procs.filter(p => getStatus(p) === "warning").length;
  
  const activeCpuProcs = sorted.filter(p => p.cpu > 0);
  const rawCPUNum = activeCpuProcs.reduce((s, p) => s + p.cpu, 0);
  const totalCPUNum  = Math.min(rawCPUNum, 100);
  const totalCPU    = totalCPUNum.toFixed(1);
  const avgCPU      = activeCpuProcs.length > 0 ? (totalCPUNum / activeCpuProcs.length).toFixed(1) : "0.0";

  const activeMemProcs = sorted.filter(p => p.mem > 0);
  const totalMEMNum  = activeMemProcs.reduce((s, p) => s + p.mem, 0);
  const totalMEM    = totalMEMNum.toFixed(1);
  const avgMEM      = activeMemProcs.length > 0 ? (totalMEMNum / activeMemProcs.length).toFixed(1) : "0.0";
  
  const fmtTime = d => {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? 'P.M' : 'A.M';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  const selStatus   = selected ? getStatus(selected) : null;
  const selBaseline = selected ? BASELINES[selected.pid] : null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slidein{ from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        .live-dot { animation: blink 2s infinite; }
        .fade-in { animation: slidein 0.3s ease both; }
        tr.proc-row:hover { background: #f0fdf4 !important; }
        .alert-item:hover { background: #fef9f9 !important; }
        .p-toast { width: auto; min-width: 200px; max-width: 400px; }
        .p-toast-message { margin: 0 0 10px 1rem; }
        .p-toast-message:last-child { margin-bottom: 0; }
        .p-toast-summary { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
        .p-toast-detail { font-size: 12px; margin: 0; }
        .p-toast-icon { display: none; }
        .p-toast .p-toast-message.p-toast-message-warn {
          background: rgba(217, 119, 6, 0.1);
          border: solid #d97706;
          border-width: 0 0 0 6px;
          color: #d97706;
        }
        .p-toast .p-toast-message.p-toast-message-success {
          background: rgba(3, 122, 83, 0.1);
          border: solid #037A53;
          border-width: 0 0 0 6px;
          color: #037A53;
        }
        .p-toast .p-toast-message.p-toast-message-error {
          background: rgba(220, 38, 38, 0.1);
          border: solid #dc2626;
          border-width: 0 0 0 6px;
          color: #dc2626;
        }
      `}</style>
      
      <Toast ref={toastRef} position="top-right" />

      {/* ── Header ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "13px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e8f5f0",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={18} color={PRIMARY} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Anomaly Detection</div>
            {/* <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
              Device.AIServices.AnomalyDetection
            </div> */}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {enabled && anomalyN > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6 }}>
              <div className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: DANGER }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>
                {anomalyN} anomal{anomalyN === 1 ? "y" : "ies"} active
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {enabled === null ? (
              <span style={{ fontSize: 13, fontWeight: 500, color: MUTED }}>Fetching Status..</span>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 500, color: enabled ? PRIMARY : MUTED }}>
                  {enabled ? "Enabled" : "Disabled"}
                </span>
                <ToggleSwitch on={enabled} onToggle={() => handleToggle()} />
              </>
            )}
          </div>
        </div>
      </div>

      {enabled === null || (enabled && loading) ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
          <img src={loadingGif} alt="Loading..." style={{ width: 64, height: 64 }} />
        </div>
      ) : !enabled ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", padding: "30px 40px", borderRadius: 12, border: "1px solid #e5e7eb", textAlign: "center", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
            <h2 style={{ margin: "16px 0 8px", color: "#111827", fontSize: 20 }}>Service Disabled</h2>
            <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Please Enable the Anomaly Detection Service to see results</p>
          </div>
        </div>
      ) : (
      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Stat Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Processes Monitored", value: procs.length, accent: PRIMARY },
            { label: "Active Anomalies",    value: anomalyN,     accent: anomalyN > 0 ? DANGER : MUTED },
            { label: "Total CPU Load", value: `${totalCPU}%`, accent: "#dc2626" },
            { label: "Total Memory Load", value: `${totalMEM}%`, accent: "#2563eb" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px",
              border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: s.accent, lineHeight: 1 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 16 }}>

          {/* Process Table */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid #e5e7eb",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#111827", display: "flex", alignItems: "center", gap: 10 }}>
                Process Monitor
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {enabled && lastSeen && (
                  <span style={{ fontSize: 14, color: MUTED, fontFamily: "monospace", textTransform: "none", fontWeight: 500 }}>
                    {fmtTime(lastSeen)}
                  </span>
                )}
              </div>
            </div>

            <div style={{ overflowY: "auto", maxHeight: 420 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 80 }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["PID","PROCESS","CPU %","MEM %"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: h === "CPU %" || h === "MEM %" ? "right" : "left",
                        fontWeight: 500, color: MUTED, fontSize: 12, letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(proc => {
                    const st = getStatus(proc);
                    const isSelected = selected?.pid === proc.pid;
                    return (
                      <tr key={proc.pid} className="proc-row"
                        onClick={() => setSelected(s => s?.pid === proc.pid ? null : proc)}
                        style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                          background: isSelected ? "#f0fdf4" : st === "anomaly" ? "#fff8f8" : st === "warning" ? "#fffef0" : "transparent" }}>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#9ca3af", fontSize: 13 }}>
                          {proc.pid}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: st === "anomaly" ? 600 : 400, color: "#111827", fontSize: 14,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {proc.label}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}><CpuBar val={proc.cpu} /></td>
                        <td style={{ padding: "10px 12px" }}><MemBar val={proc.mem} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

          {/* Right Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 500 }}>

            {/* Selected / Kill Process Panel */}
            {selected && (
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: "14px 16px", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{selected.label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: MUTED }}>{selected.cmd}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={(e) => killProcess(selected.pid, e)}
                      style={{
                        background: "#dc2626", color: "#fff",
                        border: "none", borderRadius: 4, padding: "4px 10px",
                        fontSize: 10, fontWeight: 600, cursor: "pointer",
                        opacity: 0.9, transition: "opacity 0.2s"
                      }}
                      onMouseOver={e=>e.currentTarget.style.opacity=1}
                      onMouseOut={e=>e.currentTarget.style.opacity=0.9}
                    >
                      KILL PROCESS
                    </button>
                    <button onClick={() => setSelected(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: MUTED }}>×</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {selBaseline ? [
                    ["Current CPU",   `${selected.cpu.toFixed(1)}%`, selected.cpu > selBaseline.cpu_mean + K_SIGMA * selBaseline.cpu_std ? DANGER : PRIMARY],
                    ["Baseline μ",    `${selBaseline.cpu_mean}%`, MUTED],
                    ["Threshold",     `${(selBaseline.cpu_mean + K_SIGMA * selBaseline.cpu_std).toFixed(1)}%`, WARNING],
                    ["Current MEM",   `${selected.mem.toFixed(1)}%`, PRIMARY],
                    ["K·σ deviation", `${((selected.cpu - selBaseline.cpu_mean) / selBaseline.cpu_std).toFixed(1)}σ`,
                      Math.abs((selected.cpu - selBaseline.cpu_mean) / selBaseline.cpu_std) > K_SIGMA ? DANGER : MUTED],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ background: "#f9fafb", borderRadius: 6, padding: "8px 10px", border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c, fontFamily: "monospace" }}>{v}</div>
                    </div>
                  )) : [
                    ["Current CPU",   `${selected.cpu.toFixed(1)}%`, selected.cpu > NEW_CPU_THRESH ? DANGER : PRIMARY],
                    ["CPU Threshold", `${NEW_CPU_THRESH}%`,           WARNING],
                    ["Current MEM",   `${selected.mem.toFixed(1)}%`, selected.mem > NEW_MEM_THRESH ? DANGER : PRIMARY],
                    ["MEM Threshold", `${NEW_MEM_THRESH}%`,           WARNING],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ background: "#f9fafb", borderRadius: 6, padding: "8px 10px", border: "1px solid #e5e7eb" }}>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c, fontFamily: "monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alert Log */}
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
              overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "13px 16px", borderBottom: "1px solid #e5e7eb",
                display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#111827", display: "flex", alignItems: "center" }}>Alert Log</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setActiveAlertTab("logs")}
                    style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                      background: activeAlertTab === "logs" ? PRIMARY : "#fff",
                      color: activeAlertTab === "logs" ? "#fff" : MUTED,
                      fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                    Logs
                  </button>
                  <button onClick={() => setActiveAlertTab("email")}
                    style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                      background: activeAlertTab === "email" ? PRIMARY : "#fff",
                      color: activeAlertTab === "email" ? "#fff" : MUTED,
                      fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                    Email Config
                  </button>
                </div>
              </div>

              {activeAlertTab === "logs" ? (
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {alerts.map((al, i) => (
                    <div key={al.id} className="alert-item" style={{ padding: "11px 14px",
                      borderBottom: "1px solid #f3f4f6", background: i === 0 ? "#fff8f8" : "#fff", cursor: "default" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: DANGER, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontWeight: 600, fontSize: 12, color: "#111827" }}>
                            {al.process.split("/").pop().substring(0, 18)}
                          </span>
                        </div>
                      <span style={{ fontSize: 9, background: "#fef2f2", color: "#991b1b",
                        padding: "2px 5px", borderRadius: 3, fontWeight: 700, border: "1px solid #fca5a5" }}>
                        CRITICAL
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginBottom: 4 }}>
                      PID:{al.pid}
                    </div>
                    <div style={{ fontSize: 11, color: "#374151", marginBottom: 5, lineHeight: 1.4 }}>
                      {al.message}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: DANGER, fontFamily: "monospace", fontWeight: 600 }}>
                        CPU:{al.cpu}%
                      </span>
                      <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>
                        MEM:{al.mem}%
                      </span>
                      <span style={{ fontSize: 9, background: emailEnabled ? "#eff6ff" : "#f3f4f6", color: emailEnabled ? "#1e40af" : "#9ca3af",
                        padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>
                        {emailEnabled ? "EMAIL SENT" : "EMAIL DISABLED"}
                      </span>
                      <button
                        onClick={(e) => clearAlert(al, e)}
                        style={{
                          marginLeft: "auto", background: "#d97706", color: "#fff",
                          border: "none", borderRadius: 4, padding: "2px 6px",
                          fontSize: 9, fontWeight: 700, cursor: "pointer"
                        }}
                      >
                        CLEAR
                      </button>
                    </div>
                    <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 5, fontFamily: "monospace" }}>
                      {al.timestamp}
                    </div>
                  </div>
                ))}
              </div>
              ) : (
                <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Email Notifications</div>
                      <div style={{ fontSize: 11, color: MUTED }}>Enable or disable email alerts</div>
                    </div>
                    <ToggleSwitch on={emailEnabled} onToggle={() => setEmailEnabled(!emailEnabled)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Receiver Email</label>
                    <input type="email" value={emailReceiver} onChange={(e) => setEmailReceiver(e.target.value)}
                      placeholder="e.g. admin@example.com"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db", 
                        fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }}
                      disabled={!emailEnabled} />
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
                    <button onClick={() => setActiveAlertTab("logs")}
                      style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db",
                        background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={handleSaveEmailConfig} disabled={isSavingEmailConfig}
                      style={{ padding: "6px 14px", borderRadius: 6, border: "none",
                        background: PRIMARY, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        opacity: isSavingEmailConfig ? 0.7 : 1 }}>
                      {isSavingEmailConfig ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CPU Timeline ── */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>CPU Timeline — Top 5 Processes</div>
            <div style={{ display: "flex", gap: 14 }}>
              {top5Series.map(s => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                  <span style={{ color: MUTED }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: MUTED }} 
                  ticks={history.filter((_, i, arr) => i % Math.max(1, Math.ceil(arr.length / 10)) === 0).map(d => d.time)} 
                />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} domain={[0, 'auto']} unit="%" />
                <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px" }}
                  formatter={(v, n) => [`${v}%`, n]} itemSorter={(item) => -item.value} />
                  {top5Series.map(s => (
                  <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                    stroke={s.color} fill={`${s.color}18`} strokeWidth={2} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}
