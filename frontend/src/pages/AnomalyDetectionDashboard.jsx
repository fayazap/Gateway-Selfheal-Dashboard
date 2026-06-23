import { useState, useEffect, useRef } from "react";
import { Toast } from 'primereact/toast';
import PropagateLoader from '../components/PropagateLoader';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";
import { useTheme } from '../contexts/ThemeContext';
import { Monitor, ShieldAlert, Cpu, HardDrive } from 'lucide-react';

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
  { match: [/channel-analyzer/i], name: "Smart Wi-Fi Channel Allocator", category: "Wireless" },
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

const CpuBar = ({ val, max = 10 }) => {
  const { T } = useTheme();
  const pct = Math.min((val / max) * 100, 100);
  const color = val > 5 ? T.danger : val > 2 ? T.warning : T.success;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <div style={{ width: 48, height: 4, background: T.elevated, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 14, color: val > 5 ? T.danger : T.textPrimary,
        fontWeight: val > 3 ? 600 : 400, minWidth: 32, textAlign: "right" }}>
        {val.toFixed(1)}
      </span>
    </div>
  );
};

const MemBar = ({ val, max = 8 }) => {
  const { T } = useTheme();
  const pct = Math.min((val / max) * 100, 100);
  const color = val > 5 ? T.danger : T.info;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <div style={{ width: 38, height: 4, background: T.elevated, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 14, color: T.textPrimary, minWidth: 28, textAlign: "right" }}>
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

const ToggleSwitch = ({ on, onToggle }) => {
  const { T } = useTheme();
  return (
    <div onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12,
      background: on ? T.success : T.elevated, border: `1px solid ${T.border}`,
      position: "relative", cursor: "pointer", transition: "background 0.2s",
      boxShadow: on ? `0 0 10px ${T.success}50` : 'none' }}>
      <div style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }} />
    </div>
  );
};

export default function AnomalyDetectionDashboard() {
  const { T, theme } = useTheme();
  const PRIMARY = T.success;
  const DANGER  = T.danger;
  const WARNING = T.warning;
  const INFO    = T.info;
  const MUTED   = T.textMuted;

  const STATUS = {
    anomaly: { bg: T.dangerBg,  border: T.danger  + "50", text: T.danger,  dot: T.danger,  label: "ANOMALY" },
    warning: { bg: T.warningBg, border: T.warning + "50", text: T.warning, dot: T.warning, label: "WARNING" },
    normal:  { bg: T.successBg, border: T.success + "50", text: T.success, dot: T.success, label: "NORMAL"  },
    watch:   { bg: T.infoBg,    border: T.info    + "50", text: T.info,    dot: T.info,    label: "WATCH"   },
  };

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
  const autoKillScheduledPidsRef = useRef(new Set());

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

  const handleTriggerAnomaly = async () => {
    try {
      const res = await fetch(`${API_BASE}/anomaly-detection/simulate`, { method: 'POST' });
      if (!res.ok) throw new Error('Request failed');
      toastRef.current?.show({
        severity: 'info',
        summary: 'Simulation Triggered',
        detail: 'Anomaly Simulation triggered successfully.',
        life: 4000
      });
    } catch (err) {
      console.error('Failed to trigger anomaly simulation:', err);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to trigger anomaly simulation.',
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
                cmd.includes('grep ^') ||
                cmd.includes('dropbear')) {
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

          // Auto-kill each newly anomalous process after 5 seconds
          newProcs.forEach(p => {
            if (getStatus(p) === "anomaly" && !autoKillScheduledPidsRef.current.has(p.pid)) {
              autoKillScheduledPidsRef.current.add(p.pid);
              const anomalyName = p.label;
              const autoPid = p.pid;
              setTimeout(async () => {
                killedPidsRef.current.add(autoPid);
                setProcs(prev => prev.filter(proc => proc.pid !== autoPid));
                setSelected(prev => prev?.pid === autoPid ? null : prev);
                try {
                  await fetch(`${API_BASE}/anomaly-detection/kill`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pid: autoPid })
                  });
                  toastRef.current?.show({
                    severity: 'success',
                    summary: 'Action Taken',
                    detail: `Action Taken: ${anomalyName} has been removed successfully.`,
                    life: 5000
                  });
                } catch (killErr) {
                  console.error('Auto-kill failed:', killErr);
                }
              }, 10000);
            }
          });

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
                cmd.includes('grep ^') ||
                cmd.includes('dropbear')) {
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
          const aCmd = parsedAlertObj[prefix + 'ProcessCMD'] || 'Unknown';

          if (clearedAlertIndexesRef.current.has(idx)) return;
          if (killedAlertPidsRef.current.has(aPid)) return;

          // Hide dropbear alerts
          if (aCmd.includes('dropbear')) return;

          const aCpu = parseFloat(parsedAlertObj[prefix + 'CPU_usage_percentage'] || 0);
          const aMem = parseFloat(parsedAlertObj[prefix + 'MemusagePercentage'] || 0);

          alertsParsed.push({
            id: alertId++,
            alertIndex: idx,
            pid: aPid,
            process: getProcessInfo(aCmd).name,
            cpu: aCpu,
            mem: aMem,
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

  const procRowHoverClass = theme === 'dark' ? 'proc-row-dark' : 'proc-row-light';

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: T.bg, minHeight: "100vh", color: T.textPrimary }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slidein{ from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        .live-dot { animation: blink 2s infinite; }
        .fade-in { animation: slidein 0.3s ease both; }
        .alert-item:hover { opacity: 0.85; }
        .p-toast { z-index: 9999 !important; }
      `}</style>
      
      <Toast ref={toastRef} position="top-right" />

      {/* ── Header ── */}
      <div style={{ background: T.cardBg, borderBottom: `1px solid ${T.border}`, padding: "13px 24px",  margin: "18px 20px 0px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: T.successBg,
            border: `1px solid ${T.success}30`,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={18} color={PRIMARY} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: T.textPrimary }}>Anomaly Detector</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {enabled && anomalyN > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              background: T.dangerBg, border: `1px solid ${DANGER}40`, borderRadius: 6 }}>
              <div className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: DANGER }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: DANGER }}>
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
          <PropagateLoader label="Loading..." />
        </div>
      ) : !enabled ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
          <div style={{ background: T.cardBg, padding: "30px 40px", borderRadius: 14, border: `1px solid ${T.border}`, textAlign: "center", boxShadow: T.shadow }}>
            <h2 style={{ margin: "16px 0 8px", color: T.textPrimary, fontSize: 20 }}>Service Disabled</h2>
            <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Please Enable the Anomaly Detector Service to see results</p>
          </div>
        </div>
      ) : (
      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Stat Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Processes Monitored", value: procs.length,    accent: PRIMARY,                          Icon: Monitor,    iconBg: T.accentMuted  },
            { label: "Active Anomalies",    value: anomalyN,         accent: anomalyN > 0 ? DANGER : MUTED,   Icon: ShieldAlert, iconBg: anomalyN > 0 ? T.dangerBg : T.mutedBg },
            { label: "Total CPU Load",      value: `${totalCPU}%`,  accent: DANGER,                           Icon: Cpu,        iconBg: T.dangerBg     },
            { label: "Total Memory Load",   value: `${totalMEM}%`,  accent: INFO,                             Icon: HardDrive,  iconBg: T.infoBg       },
          ].map((s, i) => (
            <div key={i} style={{
              background: T.cardBg, borderRadius: 10, padding: "16px 18px",
              border: `1px solid ${T.border}`,
              display: "flex", flexDirection: "column",
              transition: "box-shadow 0.18s, border-color 0.18s",
              boxShadow: T.shadow,
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowHover; e.currentTarget.style.borderColor = T.borderStrong; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.borderColor = T.border; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ fontSize: 15, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                  {s.label}
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, background: s.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <s.Icon size={18} color={s.accent} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.accent, lineHeight: 1 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 16 }}>

          {/* Process Table */}
          <div style={{ background: T.cardBg, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: T.shadow }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 17, color: T.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                Process Monitor
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {enabled && lastSeen && (
                  <span style={{ fontSize: 15, color: MUTED, fontFamily: "monospace", fontWeight: 500 }}>
                    {fmtTime(lastSeen)}
                  </span>
                )}
              </div>
            </div>

            <div style={{ overflowY: "auto", maxHeight: 420 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "40%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                </colgroup>
                <thead>
                  <tr style={{ background: T.elevated, borderBottom: `1px solid ${T.border}` }}>
                    {["PID","PROCESS","CPU %","MEM %"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: h === "CPU %" || h === "MEM %" ? "right" : "left",
                        fontWeight: 600, color: MUTED, fontSize: 13, letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(proc => {
                    const st = getStatus(proc);
                    const isSelected = selected?.pid === proc.pid;
                    const rowBg = isSelected
                      ? T.successBg
                      : st === "anomaly" ? T.dangerBg
                      : st === "warning" ? T.warningBg
                      : "transparent";
                    return (
                      <tr key={proc.pid} className={procRowHoverClass}
                        onClick={() => setSelected(s => s?.pid === proc.pid ? null : proc)}
                        style={{ borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: rowBg }}>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: MUTED, fontSize: 14 }}>
                          {proc.pid}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: st === "anomaly" ? 600 : 400, color: T.textPrimary, fontSize: 15,
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
              <div style={{ background: T.cardBg, borderRadius: 10, border: `1px solid ${T.border}`, padding: "14px 16px", flexShrink: 0, boxShadow: T.shadow }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.textPrimary }}>{selected.label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: MUTED }}>{selected.cmd}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={(e) => killProcess(selected.pid, e)}
                      style={{
                        background: T.dangerBg, color: DANGER,
                        border: `1px solid ${DANGER}40`, borderRadius: 5, padding: "4px 10px",
                        fontSize: 10, fontWeight: 700, cursor: "pointer",
                        transition: "all 0.15s",
                        letterSpacing: "0.04em",
                      }}
                      onMouseOver={e=>{ e.currentTarget.style.background=DANGER; e.currentTarget.style.color="#fff"; }}
                      onMouseOut={e=>{ e.currentTarget.style.background=T.dangerBg; e.currentTarget.style.color=DANGER; }}
                    >
                      KILL PROCESS
                    </button>
                    <button onClick={() => setSelected(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: MUTED, lineHeight: 1 }}>×</button>
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
                    <div key={k} style={{ background: T.elevated, borderRadius: 6, padding: "8px 10px", border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c, fontFamily: "monospace" }}>{v}</div>
                    </div>
                  )) : [
                    ["Current CPU",   `${selected.cpu.toFixed(1)}%`, selected.cpu > NEW_CPU_THRESH ? DANGER : PRIMARY],
                    ["CPU Threshold", `${NEW_CPU_THRESH}%`,           WARNING],
                    ["Current MEM",   `${selected.mem.toFixed(1)}%`, selected.mem > NEW_MEM_THRESH ? DANGER : PRIMARY],
                    ["MEM Threshold", `${NEW_MEM_THRESH}%`,           WARNING],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ background: T.elevated, borderRadius: 6, padding: "8px 10px", border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c, fontFamily: "monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alert Log */}
            <div style={{ background: T.cardBg, borderRadius: 10, border: `1px solid ${T.border}`,
              overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", boxShadow: T.shadow }}>
              <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 19, color: T.textPrimary }}>Alert Log</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["logs", "email"].map(tab => (
                    <button key={tab} onClick={() => setActiveAlertTab(tab)}
                      style={{ padding: "4px 10px", borderRadius: 5,
                        border: `1px solid ${activeAlertTab === tab ? PRIMARY + "50" : T.border}`,
                        background: activeAlertTab === tab ? T.successBg : "transparent",
                        color: activeAlertTab === tab ? PRIMARY : MUTED,
                        fontSize: 15, fontWeight: 600, cursor: "pointer",
                        textTransform: "capitalize", letterSpacing: "0.02em",
                        transition: "all 0.15s",
                      }}>
                      {tab === "email" ? "Email Config" : "Logs"}
                    </button>
                  ))}
                </div>
              </div>

              {activeAlertTab === "logs" ? (
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {alerts.map((al, i) => (
                    <div key={al.id} className="alert-item" style={{ padding: "11px 14px",
                      borderBottom: `1px solid ${T.border}`,
                      background: i === 0 ? T.dangerBg : "transparent",
                      cursor: "default", transition: "background 0.15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: DANGER, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontWeight: 600, fontSize: 16, color: T.textPrimary }}>
                            {al.process.split("/").pop().substring(0, 18)}
                          </span>
                        </div>
                        <span style={{ fontSize: 9, background: T.dangerBg, color: DANGER,
                          padding: "2px 6px", borderRadius: 4, fontWeight: 700, border: `1px solid ${DANGER}40`,
                          letterSpacing: "0.05em" }}>
                          CRITICAL
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginBottom: 4 }}>
                        PID:{al.pid}
                      </div>
                      <div style={{ fontSize: 11, color: T.textSec, marginBottom: 5, lineHeight: 1.5 }}>
                        {al.message}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: DANGER, fontFamily: "monospace", fontWeight: 600 }}>
                          CPU:{al.cpu}%
                        </span>
                        <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>
                          MEM:{al.mem}%
                        </span>
                        <span style={{ fontSize: 9,
                          background: emailEnabled ? T.infoBg : T.elevated,
                          color: emailEnabled ? INFO : MUTED,
                          padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>
                          {emailEnabled ? "EMAIL SENT" : "EMAIL OFF"}
                        </span>
                        <button
                          onClick={(e) => clearAlert(al, e)}
                          style={{
                            marginLeft: "auto", background: T.warningBg, color: WARNING,
                            border: `1px solid ${WARNING}40`, borderRadius: 4, padding: "2px 8px",
                            fontSize: 9, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                          }}
                          onMouseOver={e=>{ e.currentTarget.style.background=WARNING; e.currentTarget.style.color="#fff"; }}
                          onMouseOut={e=>{ e.currentTarget.style.background=T.warningBg; e.currentTarget.style.color=WARNING; }}
                        >
                          CLEAR
                        </button>
                      </div>
                      <div style={{ fontSize: 9, color: MUTED, marginTop: 5, fontFamily: "monospace" }}>
                        {al.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>Email Notifications</div>
                      <div style={{ fontSize: 11, color: MUTED }}>Enable or disable email alerts</div>
                    </div>
                    <ToggleSwitch on={emailEnabled} onToggle={() => setEmailEnabled(!emailEnabled)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.textSec, marginBottom: 6, letterSpacing: "0.02em" }}>
                      RECEIVER EMAIL
                    </label>
                    <input type="email" value={emailReceiver} onChange={(e) => setEmailReceiver(e.target.value)}
                      placeholder="e.g. admin@example.com"
                      style={{ width: "100%", padding: "9px 11px", borderRadius: 7,
                        border: `1px solid ${T.border}`,
                        background: T.elevated,
                        fontSize: 13, color: T.textPrimary, outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.15s", }}
                      onFocus={e => e.target.style.borderColor = PRIMARY}
                      onBlur={e => e.target.style.borderColor = T.border}
                      disabled={!emailEnabled} />
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                    <button onClick={() => setActiveAlertTab("logs")}
                      style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${T.border}`,
                        background: "transparent", color: T.textSec, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
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

            {/* Trigger Anomaly Button */}
            <button
              onClick={handleTriggerAnomaly}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: `1px solid ${DANGER}50`,
                background: T.dangerBg,
                color: DANGER,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.04em",
                flexShrink: 0,
              }}
              onMouseOver={e => { e.currentTarget.style.background = DANGER; e.currentTarget.style.color = "#fff"; }}
              onMouseOut={e => { e.currentTarget.style.background = T.dangerBg; e.currentTarget.style.color = DANGER; }}
            >
              Trigger Anomaly
            </button>
          </div>
        </div>

        {/* ── CPU Timeline ── */}
        <div style={{ background: T.cardBg, borderRadius: 10, border: `1px solid ${T.border}`, padding: "16px", boxShadow: T.shadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: T.textPrimary }}>CPU Timeline — Top 5 Processes</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {top5Series.map(s => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                  <span style={{ color: MUTED }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: MUTED }}
                  ticks={history.filter((_, i, arr) => i % Math.max(1, Math.ceil(arr.length / 10)) === 0).map(d => d.time)}
                  axisLine={false} tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} domain={[0, 'auto']} unit="%" axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", background: T.elevated, color: T.textPrimary }}
                  formatter={(v, n) => [`${v}%`, n]} itemSorter={(item) => -item.value}
                />
                {top5Series.map(s => (
                  <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                    stroke={s.color} fill={`${s.color}15`} strokeWidth={2} dot={false} />
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
