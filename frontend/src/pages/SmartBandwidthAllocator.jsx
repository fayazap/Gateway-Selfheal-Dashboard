import { useState, useEffect, useRef } from "react";
import { Toast } from 'primereact/toast';
import { Gamepad2, Tv, Laptop, Bot } from "lucide-react";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimeClock } from '@mui/x-date-pickers/TimeClock';
import dayjs from 'dayjs';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import loadingGif from '../assets/loading.gif';

// ── Design Tokens (matching AnomalyDetectionDashboard) ──────────
const PRIMARY = "#037A53";
const DANGER  = "#dc2626";
const WARNING = "#d97706";
const INFO    = "#2563eb";
const MUTED   = "#6b7280";

// Deterministic seed-based "random" for chart so it doesn't re-shuffle on re-render
function seeded(h, offset) {
  return ((Math.sin(h * 7.3 + offset) * 43758.5) % 1 + 1) / 2;
}
const defaultBandwidthChart = Array.from({ length: 24 }, (_, h) => ({
  hour:   `${String(h).padStart(2,"0")}:00`,
  high:   h >= 8 && h <= 10 ? 30 + seeded(h,1)*15 : h >= 18 && h <= 22 ? 35 + seeded(h,1)*20 : 4 + seeded(h,1)*8,
  medium: 18 + seeded(h,2)*18,
  normal: h >= 19 && h <= 23 ? 12 + seeded(h,3)*14 : 4 + seeded(h,3)*8,
  low:    2 + seeded(h,4)*4,
}));

const PIPELINE_STAGES = [
  { label:"Traffic Collection",   sub:"ndpi-daemon · wlan2.1",          status:"active",  detail:"accumulated_log.log"             },
  { label:"Log Rotation",          sub:"Hourly UTC tick",                 status:"active",  detail:"Hour tick curr=11 prev=10"       },
  { label:"Dataset Accumulation",  sub:"scheduler.py · AI agent",        status:"active",  detail:"ndpi_log_accumulated.log"        },
  { label:"AI Learning",           sub:"EdgeHybridModel · daily_run.py", status:"pending", detail:"Next run at 23:50"               },
  { label:"QoS Enforcement",       sub:"UBUS · TR-181 Device.QoS.*",     status:"active",  detail:"6 rules applied · idx 7-12"     },
];

let INITIAL_CAPACITY = [
  { tier:"Highest Bandwidth Queue",   pct:0, mbps:0, color:DANGER  },
  { tier:"Moderate Bandwidth Queue", pct:0, mbps:0, color:WARNING  },
  { tier:"Default Bandwidth Queue", pct:0, mbps:0, color:INFO     },
  { tier:"Low Bandwidth Queue",    pct:0, mbps:0, color:MUTED    },
];

let INITIAL_THRESHOLDS = [
  { label:"High",   value:"Loading...",  bucket:"Loading...", color:DANGER  },
  { label:"Medium", value:"Loading...",  bucket:"Loading...", color:WARNING },
  { label:"Normal", value:"Loading...",  bucket:"Loading...", color:INFO    },
];

let PROTO_HIGH = [];
let PROTO_MEDIUM = [];
let PROTO_NORMAL = [];
let PROTO_LOW = [];

const PRIORITY_STYLE = {
  "High Priority":   { color:DANGER,  bg:"#fef2f2", border:"#fca5a5" },
  "Medium Priority": { color:WARNING, bg:"#fffbeb", border:"#fcd34d" },
  "Normal Priority": { color:INFO,    bg:"#eff6ff", border:"#93c5fd" },
  "Low Priority":    { color:MUTED,   bg:"#f9fafb", border:"#e5e7eb" },
};

const QUEUE_PS = {
  "Highest Bandwidth Queue":  PRIORITY_STYLE["High Priority"],
  "Moderate Bandwidth Queue": PRIORITY_STYLE["Medium Priority"],
  "Default Bandwidth Queue":  PRIORITY_STYLE["Normal Priority"],
  "Low Bandwidth Queue":      PRIORITY_STYLE["Low Priority"],
};

const PRIORITY_ORDER = {
  "High Priority":   1,
  "Medium Priority": 2,
  "Normal Priority": 3,
  "Low Priority":    4,
};

// ── Utility ─────────────────────────────────────────────────────

const fmtBytes = (b) => {
  if (!b || b === 0) return "-";
  if (b > 1_048_576) return `${(b / 1_048_576).toFixed(2)} MB`;
  if (b > 1_024)     return `${(b / 1_024).toFixed(1)} KB`;
  return `${b} B`;
};
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DASHBOARD_TZ_OFFSET_HOURS = -5;
const DASHBOARD_TZ_OFFSET_MS = DASHBOARD_TZ_OFFSET_HOURS * 60 * 60 * 1000;

const normalizeHour = (hour) => ((hour % 24) + 24) % 24;

const parseTrafficTimestamp = (value) => {
  if (!value) return null;

  const match = value.trim().match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);

  return Date.UTC(year, month, day, hour, minute, second);
};

const formatClock = (ts) => {
  if (ts == null) return "";

  const date = new Date(ts + DASHBOARD_TZ_OFFSET_MS);
  let h = date.getUTCHours();
  const m = date.getUTCMinutes();
  const ampm = h >= 12 ? 'P.M' : 'A.M';
  h = h % 12;
  h = h ? h : 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
};

const formatDashboardDate = (ts, options) => {
  if (ts == null) return "";

  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(ts + DASHBOARD_TZ_OFFSET_MS));
};

const utcHourToDashboardHour = (hour) => normalizeHour(hour + DASHBOARD_TZ_OFFSET_HOURS);
const dashboardHourToUtcHour = (hour) => normalizeHour(hour - DASHBOARD_TZ_OFFSET_HOURS);

// ── Sub-Components ───────────────────────────────────────────────

const ToggleSwitch = ({ on, onToggle }) => (
  <div
    onClick={onToggle}
    style={{ width:44, height:24, borderRadius:12, background:on?PRIMARY:"#d1d5db",
      position:"relative", cursor:"pointer", transition:"background 0.2s" }}
  >
    <div style={{ position:"absolute", top:2, left:on?22:2, width:20, height:20,
      borderRadius:"50%", background:"#fff", transition:"left 0.2s",
      boxShadow:"0 1px 3px rgba(0,0,0,0.25)" }} />
  </div>
);

const ChevronRight = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={MUTED}
    strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
);

const WaveIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={PRIMARY}
    strokeWidth="2" strokeLinecap="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

// ── Modal Components ─────────────────────────────────────────────

const SimpleModal = ({ isOpen, title, children, onClose, onSave, isSaving }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1000
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: "24px", maxWidth: "500px",
        width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)"
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#111827" }}>
          {title}
        </div>
        <div style={{ marginBottom: 20 }}>
          {children}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e7eb",
            background: "#fff", color: MUTED, cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={isSaving} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: isSaving ? "#d1d5db" : PRIMARY, color: "#fff",
            cursor: isSaving ? "default" : "pointer", fontSize: 13, fontWeight: 500
          }}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────

export default function SmartBandwidthAllocator() {
  const [enabled, setEnabled]       = useState(null);
  const [activeProfileMode, setActiveProfileMode] = useState("AI Auto");
  const [selectedHour, setSelectedHour] = useState(11);
  const [gatewayHour, setGatewayHour]   = useState(11);
  const [gatewayDate, setGatewayDate] = useState(new Date());

  const [allTrafficData, setAllTrafficData] = useState({});
  const [latestBlockTs, setLatestBlockTs] = useState(null);

  const [loading, setLoading]         = useState(true);

  const [selectedDevice, setSelectedDevice] = useState("All");
  const [macToNameMap, setMacToNameMap] = useState({});
  const [trafficHistory, setTrafficHistory] = useState([]);
  
  const [capacityInfo, setCapacityInfo] = useState(INITIAL_CAPACITY);
  const [thresholdInfo, setThresholdInfo] = useState(INITIAL_THRESHOLDS);
  const [maxCapacityStr, setMaxCapacityStr] = useState("Loading...");

  // New state for config editing
  const [rawConfigText, setRawConfigText] = useState("");
  const [showAppConfigModal, setShowAppConfigModal] = useState(false);
  const [editingProtos, setEditingProtos] = useState({ high: [], medium: [], normal: [], low: [] });
  const [newProtoInput, setNewProtoInput] = useState("");
  const [newProtoTier, setNewProtoTier] = useState("high");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [editingThresholds, setEditingThresholds] = useState({ high: "", medium: "", normal: "" });
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [editingCapacity, setEditingCapacity] = useState({ shaperRate: 0, high: 0, medium: 0, normal: 0, low: 0 });
  const [isSavingCapacity, setIsSavingCapacity] = useState(false);

  const [activeHosts, setActiveHosts] = useState([]);
  const [qosClassifications, setQosClassifications] = useState([]);

  const isEditingApp = useRef(false);
  const isEditingThreshold = useRef(false);
  const isEditingCapacityRef = useRef(false);
  const toastRef = useRef(null);
  const prevActiveMacsRef = useRef(null);

  const API_BASE = `http://${window.location.hostname}:5000/api`;

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      const startTime = Date.now();
      try {
        const fetchText = (url) => fetch(url).then(r => r.text()).catch(() => "");
        const fetchJson = (url) => fetch(url).then(r => r.json()).catch(() => ({}));

        // Fetch sequentially to prevent overwhelming the gateway's SSH server (Fixes: "Connection lost before handshake")
        const statusText = await fetchText(`${API_BASE}/smart-bandwidth/status`);
        const isEnabled = statusText.includes('Enable=1');
        
        if (isMounted) setEnabled(isEnabled);

        if (!isEnabled) {
          // Ensure we show loading for 1s minimum if resolving quickly
          const elapsed = Date.now() - startTime;
          if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));
          if (isMounted) setLoading(false);
          return; // Stop parsing data if disabled
        }

        const trafficData = await fetchText(`${API_BASE}/smart-bandwidth/traffic`);
        const timeData = await fetchText(`${API_BASE}/smart-bandwidth/gateway-time`);
        const qosMetrics = await fetchJson(`${API_BASE}/smart-bandwidth/qos-allocation`);
        const configText = await fetchText(`${API_BASE}/smart-bandwidth/config`);
        const clientsData = await fetchJson(`${API_BASE}/smart-bandwidth/clients`);
        const classificationsData = await fetchJson(`${API_BASE}/smart-bandwidth/qos-classifications`);

        if (isMounted && clientsData && Object.keys(clientsData).length > 0) {
          setMacToNameMap(clientsData);
        }

        if (isMounted && classificationsData && classificationsData.classifications) {
          setQosClassifications(classificationsData.classifications);
        }

        // Store raw config text for editing
        if (isMounted && configText) {
          setRawConfigText(configText);
        }

        let thresholdHighKbps = null;
        let thresholdMediumKbps = null;
        let thresholdNormalKbps = null;
        let queueHighRate = null;
        let queueMediumRate = null;
        let queueNormalRate = null;
        let queueLowRate = null;

        // **Parse Config Py for Thresholds and Protocols**
        if (configText && configText.trim().length > 0) {
          const parseConfigVar = (key) => {
              const regex = new RegExp(`${key}\\s*=\\s*([0-9.]+\\s*\\*\\s*1024\\s*\\*\\s*BUCKET_SECONDS|.*)`);
              const match = configText.match(regex);
              if (match) {
                   // Try to figure out value in KB/s
                   const expr = match[1].trim();
                   if (expr.includes('* 1024 * BUCKET_SECONDS')) {
                       const kbps = parseInt(expr.split('*')[0].trim());
                       return kbps;
                   }
              }
              return null;
          };

          const parseConfigSet = (key) => {
              // Match set definitions like PROTO_HIGH = { 'a', 'b' }
              const regex = new RegExp(`${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`);
              const match = configText.match(regex);
              if (match && match[1]) {
                  return match[1].split(',')
                    .map(s => s.trim().replace(/['"]/g, ''))
                    .filter(s => s.length > 0);
              }
              return [];
          };

          const parsedHighProtos = parseConfigSet('PROTO_HIGH');
          const parsedMedProtos  = parseConfigSet('PROTO_MEDIUM');
          const parsedNormProtos = parseConfigSet('PROTO_NORMAL');
          const parsedLowProtos  = parseConfigSet('PROTO_LOW');
          
          if (parsedHighProtos.length) PROTO_HIGH = parsedHighProtos;
          if (parsedMedProtos.length) PROTO_MEDIUM = parsedMedProtos;
          if (parsedNormProtos.length) PROTO_NORMAL = parsedNormProtos;
          if (parsedLowProtos.length) PROTO_LOW = parsedLowProtos;

          // Initialize editing state
          if (isMounted && !isEditingApp.current) {
            setEditingProtos({
              high: [...PROTO_HIGH],
              medium: [...PROTO_MEDIUM],
              normal: [...PROTO_NORMAL],
              low: [...PROTO_LOW]
            });
          }

          const tHigh = parseConfigVar('THRESHOLD_HIGH');
          const tMed = parseConfigVar('THRESHOLD_MEDIUM');
          const tNorm = parseConfigVar('THRESHOLD_NORMAL');

          thresholdHighKbps = tHigh;
          thresholdMediumKbps = tMed;
          thresholdNormalKbps = tNorm;

          if (isMounted && !isEditingThreshold.current) {
            setEditingThresholds({
              high: tHigh !== null ? String(tHigh) : "",
              medium: tMed !== null ? String(tMed) : "",
              normal: tNorm !== null ? String(tNorm) : ""
            });

            setThresholdInfo([
              {
                label:"High",
                value:tHigh !== null ? `${tHigh} KB/s` : "N/A",
                bucket:tHigh !== null ? `${(tHigh * 15 * 60 / 1024).toFixed(1)} MB / 15min` : "N/A",
                color:DANGER,
              },
              {
                label:"Medium",
                value:tMed !== null ? `${tMed} KB/s` : "N/A",
                bucket:tMed !== null ? `${(tMed * 15 * 60 / 1024).toFixed(1)} MB / 15min` : "N/A",
                color:WARNING,
              },
              {
                label:"Normal",
                value:tNorm !== null ? `${tNorm} KB/s` : "N/A",
                bucket:tNorm !== null ? `${(tNorm * 15 * 60 / 1024).toFixed(1)} MB / 15min` : "N/A",
                color:INFO,
              },
            ]);
          }
        }

        // **Parse QoS UBUS for Capacity**
        if (qosMetrics && Object.keys(qosMetrics).length > 0) {
          // Extract ShapingRate for shaper-wan-download
          let maxDownloadRate = 100000000; // default 100M
          if (qosMetrics.shaperData) {
              const shaperLines = qosMetrics.shaperData.split('\n');
              let inDownloadShaper = false;
              for(const line of shaperLines) {
                   if (line.includes('Alias="shaper-wan-download"')) inDownloadShaper = true;
                   else if (line.startsWith('QoS.Shaper.') && line.endsWith('.')) inDownloadShaper = false; // next object
                   else if (inDownloadShaper && line.includes('ShapingRate=')) {
                       // ubus rate is likely bits per second or bytes? The UBUS has rate=1000000000, probably bps or kbps
                       const val = parseInt(line.split('=')[1]);
                       if (!isNaN(val)) maxDownloadRate = val;
                   }
              }
          }
          
          let mbpsLabel = maxDownloadRate;
          if (maxDownloadRate >= 1000000) {
              mbpsLabel = `${Math.floor(maxDownloadRate / 1000000)} MB/s`;
          }
          
          let highRate = null;
          let medRate = null;
          let normRate = null;
          let lowRate = null;
          if (qosMetrics.queueData) {
                const parseQueueRate = (aliasMatch) => {
                     let inQueue = false;
               let rate = null;
                     for(const line of qosMetrics.queueData.split('\n')) {
                          if (line.includes(`Alias="${aliasMatch}"`)) inQueue = true;
                          else if (line.startsWith('QoS.Queue.') && line.endsWith('.')) inQueue = false;
                          else if (inQueue && line.includes('ShapingRate=')) {
                   const parsed = parseInt(line.split('=')[1], 10);
                   if (!isNaN(parsed)) {
                     rate = parsed;
                   }
                          }
                     }
                     return rate;
                }
                highRate = parseQueueRate('queue-high-download');
                medRate = parseQueueRate('queue-medium-download');
                normRate = parseQueueRate('queue-normal-download');
                lowRate = parseQueueRate('queue-low-download');

             queueHighRate = highRate;
             queueMediumRate = medRate;
             queueNormalRate = normRate;
             queueLowRate = lowRate;
          }

          // Compute percentages relative to maxDownloadRate (total shaper capacity)
          if (maxDownloadRate > 0) {
             const calcMbps = (val) => Math.floor(val / 1000000);
             if (isMounted) {
               setMaxCapacityStr(`${calcMbps(maxDownloadRate)} Mbps`);
               if (!isEditingCapacityRef.current) {
                 setEditingCapacity({
                   shaperRate: maxDownloadRate,
                   high: highRate || 0,
                   medium: medRate || 0,
                   normal: normRate || 0,
                   low: lowRate || 0
                 });
               }
               setCapacityInfo([
                 { tier:"Highest Bandwidth Queue",   pct: Math.round((((highRate || 0)) / maxDownloadRate)*100) || 0, mbps: calcMbps(highRate || 0) || 0, color:DANGER  },
                 { tier:"Moderate Bandwidth Queue", pct: Math.round((((medRate || 0)) / maxDownloadRate)*100) || 0, mbps: calcMbps(medRate || 0) || 0, color:WARNING  },
                 { tier:"Default Bandwidth Queue", pct: Math.round((((normRate || 0)) / maxDownloadRate)*100) || 0, mbps: calcMbps(normRate || 0) || 0, color:INFO     },
                 { tier:"Low Bandwidth Queue",    pct: Math.round((((lowRate || 0)) / maxDownloadRate)*100) || 0, mbps: calcMbps(lowRate || 0) || 0, color:MUTED    },
               ]);
             }
          }
        }
        
        // Data is now fetched safely in the main Promise.all block above

        // 1. Parse Gateway Time (UTC) to set active hour
        let gh = gatewayHour; // Reference for activeQosCount later
        if (timeData && timeData.trim()) {
            // example: "Fri Apr 17 14:13:01 UTC 2026"
            const timeParts = timeData.trim().split(' ');
            const timeString = timeParts.find(p => p.includes(':'));
            if (timeString) {
                const hh = parseInt(timeString.split(':')[0], 10);
                if (!isNaN(hh)) {
                    gh = hh;
                    if (isMounted) {
                        setGatewayHour(hh);
                        setSelectedHour(hh);
                    }
                }
            }
            const parsedDate = new Date(timeData.trim());
            if (!isNaN(parsedDate.getTime()) && isMounted) {
              setGatewayDate(parsedDate);
            }
        }

        // Parse Traffic, generate history, and extract the latest 15mins block for the live table
        const parsedTraffic = [];
        const parsedTrafficByTs = {};
        let latestBlockEndTs = null;
        
        if (trafficData) {
          const blocks = trafficData.split('============= END ===========');
          const NOISE_PROTOS = ['dns', 'ntp', 'ssdp', 'icmp', 'arp', 'dhcp', 'mdns', 'igmp', 'unknown'];
          
          let latestBlockTimeStr = null;
          const historyTimeline = [];
          const extractedBlocks = [];
          const allSeenDevices = new Set();

          const pushHistoryPoint = (point) => {
            historyTimeline.push(point);
          };
          
          blocks.forEach(block => {
            if (!block.trim()) return;
            const lines = block.trim().split('\n');
            let blockTime = null;
            let blockTimeStr = null;
            let blockEndTs = null;
            let totalRx = 0;
            let totalTx = 0;
            const deviceData = {}; // holds IP and MAC usages
            const dataLines = [];
            
            for (let line of lines) {
              line = line.trim();
              if (!line) continue;
              if (line.startsWith('Current Time:')) {
                const tsStr = line.substring(13).trim();
                blockTimeStr = tsStr;
                blockEndTs = parseTrafficTimestamp(tsStr);
                const onlyTime = tsStr.split(' ')[1] || tsStr;
                blockTime = onlyTime.substring(0, 5); // "HH:MM"
                continue;
              }
              if (line.startsWith('====') || line.startsWith('Protocol')) continue;
              
              dataLines.push(line);
              
              const parts = line.split(',');
              if (parts.length >= 7) {
                const proto = parts[0].trim().toLowerCase();
                const ip = parts[1].trim();
                const mac = parts[2].trim();
                const allConfiguredProtosLocal = [...PROTO_HIGH, ...PROTO_MEDIUM, ...PROTO_NORMAL, ...PROTO_LOW].map(p => (p || "").toLowerCase());
                
                if (!allConfiguredProtosLocal.includes(proto) || ip === '127.0.0.1' || ip === '0.0.0.0' || mac === '00:00:00:00:00:00' || mac === '00:00:00:ff:ff:00') continue;
                
                const clientName = (clientsData && clientsData[mac.toLowerCase()]) || mac;
                allSeenDevices.add(clientName);

                const rx = parseInt(parts[4]) || 0;
                const tx = parseInt(parts[3]) || 0;
                totalRx += rx;
                totalTx += tx;
                
                if (!deviceData[clientName]) deviceData[clientName] = { rx: 0, tx: 0 };
                deviceData[clientName].rx += rx;
                deviceData[clientName].tx += tx;
              }
            }
            
            if (blockTime && blockEndTs !== null) {
              if (historyTimeline.length === 0) {
                const startPoint = {
                  ts: blockEndTs - FIFTEEN_MINUTES_MS,
                  time: formatClock(blockEndTs - FIFTEEN_MINUTES_MS),
                  All_rx: 0,
                  All_tx: 0,
                };
                allSeenDevices.forEach(d => { startPoint[`${d}_rx`] = 0; startPoint[`${d}_tx`] = 0; });
                pushHistoryPoint(startPoint);
              } else if (latestBlockEndTs !== null) {
                // Detect a gap greater than standard 15-min bucket (with some buffer, e.g. > 18 mins)
                if (blockEndTs - latestBlockEndTs > 18 * 60 * 1000) {
                  // Drop to zero right after the last known data point
                  const gap1 = {
                    ts: latestBlockEndTs + 1000,
                    time: formatClock(latestBlockEndTs + 1000),
                    All_rx: 0,
                    All_tx: 0,
                  };
                  allSeenDevices.forEach(d => { gap1[`${d}_rx`] = 0; gap1[`${d}_tx`] = 0; });
                  pushHistoryPoint(gap1);
                  
                  // Rise back up from zero right before the new reading
                  const gapAnchorTs = blockEndTs - FIFTEEN_MINUTES_MS;
                  const gap2 = {
                    ts: gapAnchorTs,
                    time: formatClock(gapAnchorTs),
                    All_rx: 0,
                    All_tx: 0,
                  };
                  allSeenDevices.forEach(d => { gap2[`${d}_rx`] = 0; gap2[`${d}_tx`] = 0; });
                  pushHistoryPoint(gap2);
                }
              }

              const historyPoint = {
                ts: blockEndTs,
                time: formatClock(blockEndTs),
                All_rx: totalRx,
                All_tx: totalTx
              };
              // Add device-specific data points
              for (const [devKey, usage] of Object.entries(deviceData)) {
                historyPoint[`${devKey}_rx`] = usage.rx;
                historyPoint[`${devKey}_tx`] = usage.tx;
              }
              
              pushHistoryPoint(historyPoint);
              latestBlockTimeStr = blockTimeStr;
              latestBlockEndTs = blockEndTs;
              extractedBlocks.push({ ts: blockEndTs, timeStr: blockTimeStr, lines: dataLines });
            }
          });

          const latestWindowStart = latestBlockEndTs !== null ? latestBlockEndTs - FOUR_HOURS_MS : null;
          const filteredHistory = latestWindowStart === null
            ? historyTimeline
            : historyTimeline.filter(point => point.ts >= latestWindowStart);
          
          if (isMounted) setTrafficHistory(filteredHistory);
          
          const BUCKET_SEC = 15 * 60;
          const rateToBucketBytes = (rateBps) => Math.floor((rateBps / 8) * BUCKET_SEC);
          const hasQueueRates = [queueHighRate, queueMediumRate, queueNormalRate, queueLowRate].every((v) => v !== null);
          const capacities = {
            "High Priority":   hasQueueRates ? rateToBucketBytes(queueHighRate) : Number.POSITIVE_INFINITY,
            "Medium Priority": hasQueueRates ? rateToBucketBytes(queueMediumRate) : Number.POSITIVE_INFINITY,
            "Normal Priority": hasQueueRates ? rateToBucketBytes(queueNormalRate) : Number.POSITIVE_INFINITY,
            "Low Priority":    hasQueueRates ? rateToBucketBytes(queueLowRate) : Number.POSITIVE_INFINITY,
          };
          
          const THRESHOLD_MEDIUM = thresholdMediumKbps !== null
            ? thresholdMediumKbps * 1024 * BUCKET_SEC
            : Number.POSITIVE_INFINITY;
          const THRESHOLD_NORMAL = thresholdNormalKbps !== null
            ? thresholdNormalKbps * 1024 * BUCKET_SEC
            : Number.POSITIVE_INFINITY;

          extractedBlocks.forEach(blk => {
            const groupMap = {};
            for (const line of blk.lines) {
              const parts = line.split(',');
              if (parts.length >= 7) {
                const proto = parts[0].trim();
                const ip = parts[1].trim();
                const mac = parts[2].trim();
                const tx = parseInt(parts[3]) || 0;
                const rx = parseInt(parts[4]) || 0;
                
                const lowerProto = proto.toLowerCase();
                if (NOISE_PROTOS.includes(lowerProto)) continue;
                if (ip === '127.0.0.1' || ip === '0.0.0.0' || mac === '00:00:00:00:00:00') continue;

                const clientName = (clientsData && clientsData[mac.toLowerCase()]) || mac;

                const key = clientName + proto;
                if (!groupMap[key]) {
                  groupMap[key] = { client: clientName, proto, lowerProto, tx, rx };
                } else {
                  groupMap[key].tx += tx;
                  groupMap[key].rx += rx;
                }
              }
            }

            const priority_levels = ["High Priority", "Medium Priority", "Normal Priority", "Low Priority"];
            const blockTraffic = Object.values(groupMap);
            const used_capacity = { "High Priority": 0, "Medium Priority": 0, "Normal Priority": 0, "Low Priority": 0 };
            const parsedBlockTraffic = [];

            for (const item of blockTraffic) {
               let p_prio = "Normal Priority";
               if (PROTO_HIGH.includes(item.lowerProto)) p_prio = "High Priority";
               else if (PROTO_MEDIUM.includes(item.lowerProto)) p_prio = "Medium Priority";
               else if (PROTO_NORMAL.includes(item.lowerProto)) p_prio = "Normal Priority";
               else if (PROTO_LOW.includes(item.lowerProto)) p_prio = "Low Priority";

               const p_idx = priority_levels.indexOf(p_prio);
               const bw_peak = item.rx + item.tx; // Combined usage
               
               let over_threshold = false;
               if (p_prio === "Normal Priority" && bw_peak > THRESHOLD_NORMAL) over_threshold = true;
               else if (p_prio === "Medium Priority" && bw_peak > THRESHOLD_MEDIUM) over_threshold = true;

               let assigned_prio = p_prio;
               if (over_threshold || (used_capacity[p_prio] + bw_peak > capacities[p_prio])) {
                  for (let target_idx = p_idx - 1; target_idx >= 0; target_idx--) {
                      const target_prio = priority_levels[target_idx];
                      if (used_capacity[target_prio] + bw_peak <= capacities[target_prio]) {
                          assigned_prio = target_prio;
                          break;
                      }
                  }
               }

               used_capacity[assigned_prio] += bw_peak;
               item.priority = assigned_prio;
               parsedBlockTraffic.push(item);
            }
            parsedTrafficByTs[blk.ts] = { traffic: parsedBlockTraffic, timeStr: blk.timeStr };
          });
        }

        if (isMounted) {
          setAllTrafficData(parsedTrafficByTs);
          setLatestBlockTs(latestBlockEndTs);
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));

        if (isMounted) setLoading(false);
      } catch (err) {
        console.error("Failed to fetch Smart Bandwidth data:", err);
        if (isMounted) setLoading(false);
      }
    };

    setLoading(true);
    fetchData();
    const fetchInterval = setInterval(fetchData, 10000); // Wait 10s then auto-refresh
    
    return () => {
      isMounted = false;
      clearInterval(fetchInterval);
    };
  }, [API_BASE]);

  const handleToggle = async () => {
    const nextState = !enabled;
    setEnabled(nextState); // Optimistic UI update
    setLoading(true);
    
    const startTime = Date.now();
    try {
      await fetch(`${API_BASE}/smart-bandwidth/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: nextState })
      });
      // Let it stabilize, the poll loop will grab the newest state in 10s.
      // We will hide loading spinner quickly since it succeeded.
    } catch (err) {
      console.error("Toggle failed", err);
      setEnabled(!nextState); // revert
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));
      setLoading(false);
    }
  };

  // API Helper Functions
  const saveAppConfig = async () => {
    setIsSavingConfig(true);
    try {
      let newConfigContent = rawConfigText;
      
      // Replace PROTO_HIGH with new values
      newConfigContent = newConfigContent.replace(
        /PROTO_HIGH\s*=\s*\{[^}]*\}/,
        `PROTO_HIGH = { ${editingProtos.high.map(p => `'${p}'`).join(', ')} }`
      );
      newConfigContent = newConfigContent.replace(
        /PROTO_MEDIUM\s*=\s*\{[^}]*\}/,
        `PROTO_MEDIUM = { ${editingProtos.medium.map(p => `'${p}'`).join(', ')} }`
      );
      newConfigContent = newConfigContent.replace(
        /PROTO_NORMAL\s*=\s*\{[^}]*\}/,
        `PROTO_NORMAL = { ${editingProtos.normal.map(p => `'${p}'`).join(', ')} }`
      );
      newConfigContent = newConfigContent.replace(
        /PROTO_LOW\s*=\s*\{[^}]*\}/,
        `PROTO_LOW = { ${editingProtos.low.map(p => `'${p}'`).join(', ')} }`
      );

      await fetch(`${API_BASE}/smart-bandwidth/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: newConfigContent })
      });

      // Wait for the next fetch cycle to pick up the changes
      await new Promise(resolve => setTimeout(resolve, 3000));

      toastRef.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'App Config updated successfully',
        life: 4000
      });
      isEditingApp.current = false;
      setShowAppConfigModal(false);
    } catch (err) {
      console.error("Failed to save app config:", err);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Error saving config. Check console.',
        life: 4000
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const saveThresholds = async () => {
    setIsSavingThreshold(true);
    try {
      let newConfigContent = rawConfigText;
      
      if (editingThresholds.high) {
        newConfigContent = newConfigContent.replace(
          /THRESHOLD_HIGH\s*=\s*[^*\n]*/,
          `THRESHOLD_HIGH = ${parseInt(editingThresholds.high)}`
        );
      }
      if (editingThresholds.medium) {
        newConfigContent = newConfigContent.replace(
          /THRESHOLD_MEDIUM\s*=\s*[^*\n]*/,
          `THRESHOLD_MEDIUM = ${parseInt(editingThresholds.medium)}`
        );
      }
      if (editingThresholds.normal) {
        newConfigContent = newConfigContent.replace(
          /THRESHOLD_NORMAL\s*=\s*[^*\n]*/,
          `THRESHOLD_NORMAL = ${parseInt(editingThresholds.normal)}`
        );
      }

      await fetch(`${API_BASE}/smart-bandwidth/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: newConfigContent })
      });

      // Wait for the next fetch cycle to pick up the changes
      await new Promise(resolve => setTimeout(resolve, 3000));

      toastRef.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Thresholds updated successfully',
        life: 4000
      });
      isEditingThreshold.current = false;
      setShowThresholdModal(false);
    } catch (err) {
      console.error("Failed to save thresholds:", err);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Error saving thresholds. Check console.',
        life: 4000
      });
    } finally {
      setIsSavingThreshold(false);
    }
  };

  const saveCapacityAllocation = async () => {
    setIsSavingCapacity(true);
    try {
      const shaper = parseInt(editingCapacity.shaperRate) || 0;
      const qHigh = parseInt(editingCapacity.high) || 0;
      const qMed = parseInt(editingCapacity.medium) || 0;
      const qNorm = parseInt(editingCapacity.normal) || 0;
      const qLow = parseInt(editingCapacity.low) || 0;
      const totalQueues = qHigh + qMed + qNorm + qLow;

      if (shaper <= 0) {
        toastRef.current?.show({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Shaper Rate must be greater than 0',
          life: 5000
        });
        setIsSavingCapacity(false);
        return;
      }

      if (shaper > 1000000000) {
        toastRef.current?.show({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Shaper Rate cannot exceed 1 Gbps (1,000,000,000 bps)',
          life: 5000
        });
        setIsSavingCapacity(false);
        return;
      }

      if (qHigh < 0 || qMed < 0 || qNorm < 0 || qLow < 0) {
        toastRef.current?.show({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Queue rates cannot be negative',
          life: 5000
        });
        setIsSavingCapacity(false);
        return;
      }

      if (totalQueues > shaper) {
        toastRef.current?.show({
          severity: 'error',
          summary: 'Validation Error',
          detail: `Invalid Allocation: Sum of queues (${(totalQueues/1_000_000).toFixed(1)} Mbps) exceeds total capacity (${(shaper/1_000_000).toFixed(1)} Mbps)`,
          life: 6000
        });
        setIsSavingCapacity(false);
        return;
      }

      const payload = {
        shaperRate: shaper,
        queueRates: {
          high: qHigh,
          medium: qMed,
          normal: qNorm,
          low: qLow
        }
      };

      await fetch(`${API_BASE}/smart-bandwidth/qos-allocation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      // Wait for the next fetch cycle to pick up the changes
      await new Promise(resolve => setTimeout(resolve, 3000));

      toastRef.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Max Capacity Allocation updated successfully',
        life: 4000
      });
      isEditingCapacityRef.current = false;
      setShowCapacityModal(false);
    } catch (err) {
      console.error("Failed to save capacity:", err);
      toastRef.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Error saving capacity. Check console.',
        life: 4000
      });
    } finally {
      setIsSavingCapacity(false);
    }
  };

  const addProto = () => {
    if (!newProtoInput.trim()) return;
    const tierKey = newProtoTier; // "high", "medium", etc.
    setEditingProtos(prev => ({
      ...prev,
      [tierKey]: [...prev[tierKey], newProtoInput.trim().toLowerCase()]
    }));
    setNewProtoInput("");
  };

  const removeProto = (tier, proto) => {
    setEditingProtos(prev => ({
      ...prev,
      [tier]: prev[tier].filter(p => p !== proto)
    }));
  };

  // Poll active hosts every 3 seconds; notify when a client transitions to active
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const pollActiveHosts = async () => {
      try {
        const hosts = await fetch(`${API_BASE}/smart-bandwidth/active-hosts`).then(r => r.json()).catch(() => []);
        if (!isMounted || !Array.isArray(hosts)) return;

        setActiveHosts(hosts);

        const currentMacs = new Set(hosts.map(h => h.mac));

        if (prevActiveMacsRef.current === null) {
          // First poll after page load: record baseline, no notifications
          prevActiveMacsRef.current = currentMacs;
          return;
        }

        // Toast for any MAC that wasn't active in the previous poll
        for (const host of hosts) {
          if (!prevActiveMacsRef.current.has(host.mac)) {
            toastRef.current?.show({
              severity: 'warn',
              summary: 'New Device Connected',
              detail: `Guest: ${host.name} got connected! Allocating Default Bandwidth Queue`,
              life: 8000
            });
          }
        }

        prevActiveMacsRef.current = currentMacs;
      } catch (err) {
        console.error('Failed to fetch active hosts:', err);
      }
    };

    pollActiveHosts();
    const interval = setInterval(pollActiveHosts, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [API_BASE, enabled]);

  const activeData = allTrafficData[latestBlockTs] || { traffic: [], timeStr: "" };
  const liveTraffic = activeData.traffic || [];

  // These are now empty refs populated dynamically during fetch so UI builds cleanly
  const PROTO_TIERS = [
    { tier:"High Priority",   color:DANGER,  protos:PROTO_HIGH },
    { tier:"Medium Priority", color:WARNING, protos:PROTO_MEDIUM },
    { tier:"Normal Priority", color:INFO,    protos:PROTO_NORMAL },
    { tier:"Low Priority",    color:MUTED,   protos:PROTO_LOW },
  ];

  const allConfiguredProtos = [...PROTO_HIGH, ...PROTO_MEDIUM, ...PROTO_NORMAL, ...PROTO_LOW].map(p => (p || "").toLowerCase());
  const filteredTraffic = liveTraffic.filter(r => allConfiguredProtos.includes((r.proto || "").toLowerCase()));

  // Applications Monitored will be the Count of Variety of Apps in Client Traffic
  const uniqueProtosCount = [...new Set(filteredTraffic.map(r => r.proto))].length;

  const totalRx = filteredTraffic.reduce((s, r) => s + r.rx, 0);
  const totalTx = filteredTraffic.reduce((s, r) => s + r.tx, 0);

  // Pipeline: only show active devices (IP must be in activeHosts)
  const _activeIPs = new Set(activeHosts.map(h => h.ip).filter(Boolean));
  const activeQosForPipeline = qosClassifications.filter(cls => cls.destIp && _activeIPs.has(cls.destIp));

  const pipelineDeviceApps = {
    "Highest Bandwidth Queue": [],
    "Moderate Bandwidth Queue": [],
    "Default Bandwidth Queue": [],
    "Low Bandwidth Queue": [],
  };
  const _qdMap = {};
  activeQosForPipeline.forEach(cls => {
    const queue = cls.queue || "Default Bandwidth Queue";
    const device = cls.deviceName || cls.destIp || "Unknown";
    const key = `${queue}|||${device}`;
    if (!_qdMap[key]) {
      _qdMap[key] = { device, queue, apps: [] };
      if (pipelineDeviceApps[queue]) pipelineDeviceApps[queue].push(_qdMap[key]);
    }
    if (cls.dpiProtocol) _qdMap[key].apps.push(cls.dpiProtocol);
  });

  // Guest hosts: active but no QoS classification → Default queue (no app chain)
  const _managedIPs = new Set(activeQosForPipeline.map(c => c.destIp).filter(Boolean));
  const _seenGuests = new Set();
  activeHosts.forEach(host => {
    if (host.ip && _managedIPs.has(host.ip)) return;
    if (!host.name || _seenGuests.has(host.name)) return;
    _seenGuests.add(host.name);
    pipelineDeviceApps["Default Bandwidth Queue"].push({ device: host.name, apps: [], isGuest: true });
  });

  const pipelineQueues = capacityInfo.map(c => ({ ...c, items: pipelineDeviceApps[c.tier] || [] }));
  const maxPipelineMbps = Math.max(...capacityInfo.map(c => c.mbps), 1);

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", background:"#f8fafc", minHeight:"100vh" }}>
      <style>{`
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slidein{ from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        .live-dot   { animation: blink 2s infinite; }
        .fade-in    { animation: slidein 0.3s ease both; }
        .hour-btn:hover:not(.hour-active) { background: #e8f5f0 !important; color:#037A53 !important; }
        .tab-btn { transition: all 0.15s; }
        .stage-pill { transition: border-color 0.2s, box-shadow 0.2s; }
        .stage-pill:hover { box-shadow: 0 2px 8px rgba(3,122,83,0.12); }
        .p-toast { width: auto; min-width: 200px; max-width: 400px; }
        .p-toast-message { margin: 0 0 0 1rem; }
        .p-toast-summary { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
        .p-toast-detail { font-size: 13px; margin: 0; }
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
        @keyframes floatChip0 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-7px)} }
        @keyframes floatChip1 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-9px)} }
        @keyframes floatChip2 { 0%,100%{transform:translateY(-2px)} 50%{transform:translateY(5px)} }
        @keyframes floatChip3 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-5px)} }
        @keyframes pipeFlow   { from{background-position-x:0} to{background-position-x:56px} }
        @keyframes shimmer    { 0%,100%{transform:translateX(-100%)} 50%{transform:translateX(100%)} }
      `}</style>

      <Toast ref={toastRef} position="top-right" />

      {/* ── Header ── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"13px 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:"#e8f5f0",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <WaveIcon />
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:"#111827" }}>Smart Bandwidth Allocator</div>
            {/* <div style={{ fontSize:11, color:"#9ca3af", fontFamily:"monospace" }}>
              Device.AIServices.BandwidthPrediction
            </div> */}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          {/* {enabled && !loading && (
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px",
              background:"#f0fdf4", border:"1px solid #86efac", borderRadius:6 }}>
              <div className="live-dot" style={{ width:6, height:6, borderRadius:"50%", background:PRIMARY }} />
              <span style={{ fontSize:12, fontWeight:600, color:"#166534" }}>{activeQosCount} QoS rules active</span>
            </div>
          )} */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {enabled === null ? (
              <span style={{ fontSize:13, fontWeight:500, color:MUTED }}>Fetching Status..</span>
            ) : (
              <>
                <span style={{ fontSize:13, fontWeight:500, color:enabled?PRIMARY:MUTED }}>
                  {enabled ? "Enabled" : "Disabled"}
                </span>
                <ToggleSwitch on={enabled} onToggle={handleToggle} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Dynamic Main State ── */}
      {loading || enabled === null ? (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"60vh" }}>
          <img src={loadingGif} alt="Loading" style={{ width:64, height:64, opacity:0.8 }} />
        </div>
      ) : !enabled ? (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center",
          height:"60vh", flexDirection:"column", gap:16 }}>
          <div style={{ background:"#fff", padding:"30px 40px", borderRadius:12,
            border:"1px solid #e5e7eb", textAlign:"center",
            boxShadow:"0 4px 6px -1px rgba(0,0,0,0.05)" }}>
            <h2 style={{ margin:"16px 0 8px", color:"#111827", fontSize:20 }}>Service Disabled</h2>
            <p style={{ margin:0, color:MUTED, fontSize:14 }}>
              Enable the Smart Bandwidth Allocator to view predictions and QoS enforcement
            </p>
          </div>
        </div>
      ) : (

      <div style={{ padding:"20px 24px", maxWidth:1320, margin:"0 auto" }}>

        {/* ── Stat Cards ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
          {[
            { label:"Clients Connected",     value:activeHosts.length,     accent:PRIMARY  },
            { label:"Applications Monitored",  value:uniqueProtosCount,       accent:"#111827"},
            { label:"Total Download",     value:fmtBytes(totalRx), accent:WARNING  },
            { label:"Total Upload", value:fmtBytes(totalTx), accent:INFO  },
          ].map((s, i) => (
            <div key={i} style={{ background:"#fff", borderRadius:10, padding:"14px 16px",
              border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:12, color:MUTED, marginBottom:6, textTransform:"uppercase",
                letterSpacing:"0.04em" }}>{s.label}</div>
              <div style={{ fontSize:30, fontWeight:700, color:s.accent, lineHeight:1, marginBottom:4 }}>
                {s.value}
              </div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 350px", gap:16, marginBottom:16 }}>

          {/* Left Column Wrapper */}
          <div style={{ display:"flex", flexDirection:"column", minWidth:0 }}>

            {/* Left: QoS Allocations Table */}
            <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", overflow:"hidden", display:"flex", flexDirection:"column", flex:1, maxHeight: 600 }}>
              <div style={{ padding:"14px 16px", borderBottom:"1px solid #e5e7eb",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:600, fontSize:16, color:"#111827" }}>QoS Allocations</div>
              </div>

              <div style={{ overflowY:"auto", flex: 1 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14, tableLayout:"fixed" }}>
                  <colgroup>
                    <col style={{ width:"30%" }} />
                    <col style={{ width:"15%" }} />
                    <col style={{ width:"25%" }} />
                    <col style={{ width:"30%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
                      {["Client","IP","Applications","Queue"].map(h => (
                        <th key={h} style={{ padding:"9px 10px", textAlign:"left",
                          fontWeight:600, color:MUTED, fontSize:14, letterSpacing:"0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const activeIPs = new Set(activeHosts.map(h => h.ip).filter(Boolean));

                      // Only show QoS entries whose IP is currently active
                      const activeClassifications = qosClassifications.filter(cls => cls.destIp && activeIPs.has(cls.destIp));

                      const managedIPs = new Set(activeClassifications.map(c => c.destIp).filter(Boolean));
                      const guestHosts = activeHosts.filter(h => !h.ip || !managedIPs.has(h.ip));

                      // Group by device
                      const deviceGroupMap = {};
                      activeClassifications.forEach(cls => {
                        const device = cls.deviceName || cls.destIp || "Unknown";
                        if (!deviceGroupMap[device]) {
                          deviceGroupMap[device] = { device, ip: cls.destIp || "", entries: [] };
                        }
                        deviceGroupMap[device].entries.push({
                          app: cls.dpiProtocol || "-",
                          queue: cls.queue || "Default Bandwidth Queue"
                        });
                      });
                      const groups = Object.values(deviceGroupMap);

                      if (groups.length === 0 && guestHosts.length === 0) {
                        return (
                          <tr>
                            <td colSpan={4} style={{ padding:"40px 0", textAlign:"center", color:MUTED, fontSize:14 }}>
                              No QoS Allocations Configured !
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <>
                          {groups.flatMap(({ device, ip, entries }) =>
                            entries.map((entry, i) => {
                              const ps = QUEUE_PS[entry.queue] || PRIORITY_STYLE["Normal Priority"];
                              return (
                                <tr key={`${device}-${i}`} className="fade-in"
                                  style={{ borderBottom: i === entries.length - 1 ? "1.5px solid #e5e7eb" : "1px solid #f9fafb" }}>
                                  {i === 0 && (
                                    <td rowSpan={entries.length} style={{
                                      padding:"9px 10px", fontSize:16,
                                      color:"#111827", fontWeight:600, verticalAlign:"middle",
                                      borderRight:"1px solid #f3f4f6"
                                    }}>
                                      {device}
                                    </td>
                                  )}
                                  {i === 0 && (
                                    <td rowSpan={entries.length} style={{
                                      padding:"9px 10px", fontSize:14,
                                      color:"#111827", fontWeight:500, verticalAlign:"middle",
                                      borderRight:"1px solid #f3f4f6"
                                    }}>
                                      {ip}
                                    </td>
                                  )}
                                  <td style={{ padding:"9px 10px" }}>
                                    <span style={{ fontSize:14, fontWeight:600, padding:"2px 8px",
                                      borderRadius:4, background:"#f3f4f6", color:"#111827" }}>
                                      {entry.app}
                                    </span>
                                  </td>
                                  <td style={{ padding:"9px 10px" }}>
                                    <span style={{ fontSize:13, padding:"2px 8px", borderRadius:4,
                                      fontWeight:600, background:ps.bg, color:ps.color,
                                      border:`1px solid ${ps.border}` }}>
                                      {entry.queue}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                          {guestHosts.map((host, i) => {
                            const guestPs = QUEUE_PS["Default Bandwidth Queue"];
                            return (
                              <tr key={`guest-${i}`} style={{ borderBottom:"1px solid #f9fafb" }}>
                                <td style={{ padding:"9px 10px", fontSize:16,
                                  color:"#111827", fontWeight:600, borderRight:"1px solid #f3f4f6" }}>
                                  {host.name} <span style={{ fontSize:13, color:"#6b7280", marginLeft:6 }}>(Guest)</span>
                                </td>
                                <td style={{ padding:"9px 10px", fontSize:14,
                                  color:"#111827", fontWeight:500, borderRight:"1px solid #f3f4f6", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {host.ip || "-"}
                                </td>
                                <td style={{ padding:"9px 10px" }}>
                                  <span style={{ fontSize:14, fontWeight:600, padding:"2px 8px",
                                    borderRadius:4, background:"#f3f4f6", color:"#111827" }}>
                                    -
                                  </span>
                                </td>
                                <td style={{ padding:"9px 10px" }}>
                                  <span style={{ fontSize:13, padding:"2px 8px", borderRadius:4,
                                    fontWeight:600, background:guestPs.bg, color:guestPs.color,
                                    border:`1px solid ${guestPs.border}` }}>
                                    Default Bandwidth Queue
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

          {/* ── Pipeline Strip (Moved Here) ── */}
          {/* <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb",
            padding:"20px 18px 16px 18px", display:"flex", alignItems:"center",
            gap:4, overflowX:"auto" }}>
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", flex: i < PIPELINE_STAGES.length - 1 ? 1 : 0, minWidth:0 }}>
                <div className="stage-pill" style={{ padding:"9px 13px", borderRadius:8, flexShrink:0,
                  border:`1px solid ${stage.status==="active" ? "#86efac" : "#fcd34d"}`,
                  background:stage.status==="active" ? "#f0fdf4" : "#fffbeb", minWidth:150 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                    <div className={stage.status==="active" ? "live-dot" : ""}
                      style={{ width:5, height:5, borderRadius:"50%", flexShrink:0,
                        background:stage.status==="active" ? PRIMARY : WARNING }} />
                    <span style={{ fontSize:11, fontWeight:600, color:"#111827",
                      whiteSpace:"nowrap" }}>{stage.label}</span>
                  </div>
                  <div style={{ fontSize:9, color:MUTED, marginBottom:2 }}>{stage.sub}</div>
                  <div style={{ fontSize:9, color:"#9ca3af", fontFamily:"monospace",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {stage.detail}
                  </div>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div style={{ flex:1, display:"flex", justifyContent:"center", padding:"0 2px" }}>
                    <ChevronRight />
                  </div>
                )}
              </div>
            ))}
          </div> */}
          </div>

          {/* Right Column */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* User Profile Modes */}
            {/* <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:MUTED, letterSpacing:"0.05em",
                  textTransform:"uppercase" }}>
                  User Profile Modes
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { id: "Gaming", icon: <Gamepad2 size={18} strokeWidth={2.5} />, label: "Gaming" },
                  { id: "Streaming", icon: <Tv size={18} strokeWidth={2.5} />, label: "Streaming" },
                  { id: "Work From Home", icon: <Laptop size={18} strokeWidth={2.5} />, label: "Work From Home" },
                  { id: "AI Auto", icon: <Bot size={18} strokeWidth={2.5} />, label: "AI Auto" }
                ].map(mode => {
                  const isActive = activeProfileMode === mode.id;
                  return (
                    <div 
                      key={mode.id}
                      onClick={() => {
                        setActiveProfileMode(mode.id);
                        toastRef.current?.show({
                          severity: 'success',
                          summary: 'Profile Activated',
                          detail: `${mode.label} mode activated`,
                          life: 3000
                        });
                      }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        padding: "12px 6px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${isActive ? PRIMARY : "#e5e7eb"}`,
                        background: isActive ? "#e8f5f0" : "#f9fafb",
                        color: isActive ? PRIMARY : MUTED,
                        transition: "all 0.2s ease-in-out",
                        boxShadow: isActive ? "0 2px 8px rgba(3,122,83,0.15)" : "none",
                        transform: isActive ? "translateY(-1px)" : "none"
                      }}
                      onMouseEnter={(e) => { 
                        if(!isActive) { 
                          e.currentTarget.style.borderColor = "#86efac"; 
                          e.currentTarget.style.background = "#fff"; 
                          e.currentTarget.style.color = PRIMARY;
                        } 
                      }}
                      onMouseLeave={(e) => { 
                        if(!isActive) { 
                          e.currentTarget.style.borderColor = "#e5e7eb"; 
                          e.currentTarget.style.background = "#f9fafb"; 
                          e.currentTarget.style.color = MUTED;
                        } 
                      }}
                    >
                      {mode.icon}
                      <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, textAlign: "center", lineHeight: 1.1 }}>
                        {mode.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div> */}


            {/* App Config (protocol tier configuration) */}
            <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", overflow:"hidden", height:270, display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"13px 16px", borderBottom:"1px solid #e5e7eb",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:600, fontSize:15, color:"#111827" }}>App Config</div>
                <button onClick={() => { isEditingApp.current = true; setShowAppConfigModal(true); }} style={{
                  padding:"4px 10px", fontSize:12, fontWeight:500, borderRadius:4,
                  border:"1px solid #e5e7eb", background:"#fff", color:PRIMARY, cursor:"pointer"
                }}>
                  Edit
                </button>
              </div>

              <div style={{ padding:"10px 14px", overflowY:"auto", flex: 1 }}>
                {PROTO_TIERS.map(tier => (
                  <div key={tier.tier} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                      <div style={{ width:9, height:9, borderRadius:2, background:tier.color }} />
                      <span style={{ fontSize:13, fontWeight:600, color:"#111827" }}>{tier.tier}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, justifyContent:"flex-start" }}>
                      {tier.protos.map(p => (
                        <span key={p} style={{ fontSize:13, padding:"3px 6px", borderRadius:4,
                          background:"#f3f4f6", border:"1px solid #e5e7eb",
                          color:"#374151" }}>{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Max Capacity Allocation */}
            <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", padding:"14px 16px", flex: 1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color:MUTED, letterSpacing:"0.05em",
                  textTransform:"uppercase" }}>
                  Max Capacity Allocation · {maxCapacityStr}
                </div>
                <button onClick={() => { isEditingCapacityRef.current = true; setShowCapacityModal(true); }} style={{
                  padding:"4px 10px", fontSize:12, fontWeight:500, borderRadius:4,
                  border:"1px solid #e5e7eb", background:"#fff", color:PRIMARY, cursor:"pointer"
                }}>
                  Edit
                </button>
              </div>
              {capacityInfo.map(c => (
                <div key={c.tier} style={{ marginBottom:11 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:13, color:"#374151", fontWeight:500 }}>{c.tier}</span>
                    <span style={{ fontSize:13, color:c.color, fontWeight:600 }}>
                      {c.mbps} Mbps &nbsp;({c.pct}%)
                    </span>
                  </div>
                  <div style={{ height:6, background:"#f3f4f6", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${c.pct}%`, background:c.color,
                      borderRadius:3, transition:"width 0.5s" }} />
                  </div>
                </div>
              ))}

              {/* Thresholds */}
              {/* <div style={{ borderTop:"1px solid #f3f4f6", paddingTop:10, marginTop:4 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                  <div style={{ fontSize:10, color:MUTED, fontWeight:600,
                    letterSpacing:"0.04em", textTransform:"uppercase" }}>
                    THRESHOLDS · per 15-min bucket
                  </div>
                  <button onClick={() => { isEditingThreshold.current = true; setShowThresholdModal(true); }} style={{
                    padding:"2px 8px", fontSize:10, fontWeight:500, borderRadius:4,
                    border:"1px solid #e5e7eb", background:"#fff", color:PRIMARY, cursor:"pointer"
                  }}>
                    Edit
                  </button>
                </div>
                {thresholdInfo.map(t => (
                  <div key={t.label} style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"baseline", marginBottom:5 }}>
                    <span style={{ fontSize:11, color:"#374151" }}>{t.label} threshold</span>
                    <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                      <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:600, color:t.color }}>
                        {t.value}
                      </span>
                      <span style={{ fontFamily:"monospace", fontSize:9, color:MUTED }}>
                        ≥ {t.bucket}
                      </span>
                    </div>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:6,
                  paddingTop:6, borderTop:"1px solid #f3f4f6" }}>
                  <span style={{ fontSize:11, color:MUTED }}>Bucket duration</span>
                  <span style={{ fontFamily:"monospace", fontSize:11, color:"#374151", fontWeight:600 }}>
                    15 min (900s)
                  </span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:11, color:MUTED }}>Noise protocols</span>
                  <span style={{ fontFamily:"monospace", fontSize:9, color:MUTED }}>
                    DNS · NTP · ICMP · ARP · DHCP
                  </span>
                </div>
              </div> */}
            </div>
          </div>
        </div>

        {/* ── Bandwidth Queue Pipelines ── */}
        <div style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", padding:"20px 24px" }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:15, color:"#111827" }}>Bandwidth Queue Pipelines</div>
            </div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"flex-end" }}>
              {capacityInfo.map(c => (
                <div key={c.tier} style={{ display:"flex", alignItems:"center", gap:5, fontSize:13 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:c.color }} />
                  <span style={{ color:"#374151", fontWeight:500 }}>{c.mbps} Mbps</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pipelines */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {pipelineQueues.map((pipe, qi) => {
              const widthPct  = Math.max(pipe.mbps > 0 ? Math.round((pipe.mbps / maxPipelineMbps) * 100) : 12, 12);
              const heightPx  = Math.max(90, 72 + widthPct * 0.7);
              const animNames = ["floatChip0","floatChip1","floatChip2","floatChip3"];

              return (
                <div key={qi}>
                  {/* Row label */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ width:11, height:11, borderRadius:3, background:pipe.color, flexShrink:0 }} />
                    <span style={{ fontSize:14, fontWeight:600, color:"#374151" }}>{pipe.tier}</span>
                    <span style={{ fontSize:13, color:pipe.color, marginLeft:"auto", fontWeight:600 }}>
                      {pipe.mbps} Mbps · {pipe.pct}%
                    </span>
                  </div>

                  {/* The pipe */}
                  <div style={{
                    width: "100%",
                    height: `${heightPx}px`,
                    background: `linear-gradient(135deg, ${pipe.color}1a 0%, ${pipe.color}08 100%)`,
                    border: `2px solid ${pipe.color}45`,
                    borderLeft: `8px solid ${pipe.color}`,
                    borderRight: `8px solid ${pipe.color}`,
                    borderRadius: 0,
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Animated flow stripes */}
                    <div style={{
                      position: "absolute", inset: 0, pointerEvents: "none",
                      backgroundImage: `repeating-linear-gradient(90deg, transparent 0px, transparent 26px, ${pipe.color}0d 26px, ${pipe.color}0d 28px)`,
                      backgroundSize: "56px 100%",
                      animation: "pipeFlow 2.5s linear infinite",
                    }} />

                    {/* Shimmer sweep */}
                    <div style={{
                      position: "absolute", top: 0, bottom: 0, width: "40%", pointerEvents: "none",
                      background: `linear-gradient(90deg, transparent, ${pipe.color}12, transparent)`,
                      animation: "shimmer 4s ease-in-out infinite",
                    }} />

                    {/* Client + App chain chips */}
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexWrap: "wrap",
                      alignContent: "center", gap: 8, padding: "8px 16px",
                    }}>
                      {pipe.items.length === 0 ? (
                        <span style={{ fontSize:11, color:`${pipe.color}60`, fontStyle:"italic" }}>
                          No active clients
                        </span>
                      ) : pipe.items.map((item, ci) => (
                        <div key={ci} style={{
                          display: "flex", alignItems: "center", gap: 4,
                          animationName: animNames[ci % 4],
                          animationDuration: `${2.2 + (ci % 3) * 0.65}s`,
                          animationTimingFunction: "ease-in-out",
                          animationIterationCount: "infinite",
                          animationDelay: `${ci * 0.3}s`,
                        }}>
                          {/* Device capsule */}
                          <span style={{
                            fontSize: 14, padding: "6px 16px",
                            borderRadius: 20,
                            background: "rgba(255,255,255,0.95)",
                            border: `1.5px solid ${pipe.color}70`,
                            color: pipe.color,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            boxShadow: `0 2px 6px ${pipe.color}28`,
                          }}>
                            {item.device}
                          </span>
                          {/* App chain — only for QoS-allocated (non-guest) clients */}
                          {!item.isGuest && item.apps.map((app, ai) => (
                            <span key={ai} style={{ display:"flex", alignItems:"center", gap:4 }}>
                              <span style={{ color:`${pipe.color}80`, fontSize:13, fontWeight:700, userSelect:"none", lineHeight:1, letterSpacing:2 }}>●●●</span>
                              <span style={{
                                fontSize: 14, padding: "6px 16px",
                                borderRadius: 20,
                                background: "rgba(255,255,255,0.88)",
                                border: `1.5px solid ${pipe.color}55`,
                                color: `${pipe.color}cc`,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                boxShadow: `0 2px 6px ${pipe.color}18`,
                              }}>
                                {app}
                              </span>
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Modals ── */}

        {/* App Config Modal */}
        <SimpleModal
          isOpen={showAppConfigModal}
          title="Edit App Config - Protocol Tiers"
          onClose={() => { isEditingApp.current = false; setShowAppConfigModal(false); }}
          onSave={saveAppConfig}
          isSaving={isSavingConfig}
        >
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {["high", "medium", "normal", "low"].map(tier => (
              <div key={tier} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 8, textTransform: "uppercase" }}>
                  {tier} Priority Protocols
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                  {editingProtos[tier].map(proto => (
                    <span key={proto} style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 4,
                      background: "#e8f5f0", color: PRIMARY, display: "flex",
                      alignItems: "center", gap: 6, fontFamily: "monospace"
                    }}>
                      {proto}
                      <button onClick={() => removeProto(tier, proto)} style={{
                        background: "none", border: "none", color: PRIMARY, cursor: "pointer",
                        padding: 0, fontSize: 16, lineHeight: 1
                      }}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 8 }}>
                Add Protocol
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  placeholder="e.g., youtube"
                  value={newProtoInput}
                  onChange={(e) => setNewProtoInput(e.target.value)}
                  onKeyPress={(e) => { if (e.key === "Enter") addProto(); }}
                  style={{
                    flex: 1, padding: "6px 10px", border: "1px solid #e5e7eb",
                    borderRadius: 4, fontSize: 12, fontFamily: "monospace"
                  }}
                />
                <select
                  value={newProtoTier}
                  onChange={(e) => setNewProtoTier(e.target.value)}
                  style={{
                    padding: "6px 8px", border: "1px solid #e5e7eb",
                    borderRadius: 4, fontSize: 11, background: "#fff"
                  }}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <button onClick={addProto} style={{
                  padding: "6px 12px", borderRadius: 4, border: "none",
                  background: PRIMARY, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500
                }}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </SimpleModal>

        {/* Threshold Modal */}
        <SimpleModal
          isOpen={showThresholdModal}
          title="Edit Thresholds"
          onClose={() => { isEditingThreshold.current = false; setShowThresholdModal(false); }}
          onSave={saveThresholds}
          isSaving={isSavingThreshold}
        >
          <div>
            {["high", "medium", "normal"].map(tier => (
              <div key={tier} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#111827", display: "block", marginBottom: 4, textTransform: "capitalize" }}>
                  {tier} Priority Threshold (KB/s)
                </label>
                <input
                  type="number"
                  value={editingThresholds[tier]}
                  onChange={(e) => setEditingThresholds(prev => ({ ...prev, [tier]: e.target.value }))}
                  style={{
                    width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb",
                    borderRadius: 4, fontSize: 12, fontFamily: "monospace"
                  }}
                />
              </div>
            ))}
          </div>
        </SimpleModal>

        {/* Capacity Modal */}
        <SimpleModal
          isOpen={showCapacityModal}
          title="Edit Capacity Allocation"
          onClose={() => { isEditingCapacityRef.current = false; setShowCapacityModal(false); }}
          onSave={saveCapacityAllocation}
          isSaving={isSavingCapacity}
        >
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#111827", display: "block", marginBottom: 4 }}>
                Shaper Rate (bps)
              </label>
              <input
                type="number"
                value={editingCapacity.shaperRate}
                onChange={(e) => setEditingCapacity(prev => ({ ...prev, shaperRate: e.target.value }))}
                style={{
                  width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb",
                  borderRadius: 4, fontSize: 12, fontFamily: "monospace"
                }}
              />
            </div>
            {[
              { key: "high", label: "Highest Bandwidth Queue Rate (bps)" },
              { key: "medium", label: "Moderate Bandwidth Queue Rate (bps)" },
              { key: "normal", label: "Default Bandwidth Queue Rate (bps)" },
              { key: "low", label: "Low Bandwidth Queue Rate (bps)" }
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#111827", display: "block", marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  type="number"
                  value={editingCapacity[key]}
                  onChange={(e) => setEditingCapacity(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb",
                    borderRadius: 4, fontSize: 12, fontFamily: "monospace"
                  }}
                />
              </div>
            ))}
          </div>
        </SimpleModal>

      </div>
      )}
    </div>
  );
}