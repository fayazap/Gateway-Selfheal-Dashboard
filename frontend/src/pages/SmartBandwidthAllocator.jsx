import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Toast } from 'primereact/toast';
import { Gamepad2, Tv, Laptop, Bot, Users, Layers, Download, Upload } from "lucide-react";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimeClock } from '@mui/x-date-pickers/TimeClock';
import dayjs from 'dayjs';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import PropagateLoader from '../components/PropagateLoader';
import { useTheme } from '../contexts/ThemeContext';

// Module-level color fallbacks (overridden inside component via useTheme)
const PRIMARY = "#34d399";
const DANGER  = "#f87171";
const WARNING = "#fbbf24";
const INFO    = "#60a5fa";
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

// Module-level PRIORITY_STYLE — overridden inside component via useTheme
let PRIORITY_STYLE = {
  "High Priority":   { color:DANGER,  bg:"rgba(248,113,113,0.1)", border:"rgba(248,113,113,0.3)" },
  "Medium Priority": { color:WARNING, bg:"rgba(251,191,36,0.1)",  border:"rgba(251,191,36,0.3)"  },
  "Normal Priority": { color:INFO,    bg:"rgba(96,165,250,0.1)",  border:"rgba(96,165,250,0.3)"  },
  "Low Priority":    { color:MUTED,   bg:"rgba(107,114,128,0.1)", border:"rgba(107,114,128,0.3)" },
};

let QUEUE_PS = {
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

const APP_LOGOS = {
  youtube:          "/youtube.png",
  netflix:          "/netflix.png",
  googlemeet:       "/googlemeet.png",
  whatsapp:         "/whatsapp.png",
  instagram:        "/instagram.png",
  spotify:          "/spotify.png",
  teams:            "/teams.png",
  teamscall:        "/teams.png",
  amazonalexa:      "/alexa.png",
  alexa:            "/alexa.png",
  cod_mobile:       "/cod.png",
  linkedin:        "/linkedin.png",
  Webex:            "/webex.png",
};

// ── Utility ─────────────────────────────────────────────────────

const fmtMbps = (bytesPerSec) => (bytesPerSec * 8 / 1_000_000).toFixed(2);
const toTitleCase = (str) => (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

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

const ToggleSwitch = ({ on, onToggle }) => {
  const { T } = useTheme();
  return (
    <div
      onClick={onToggle}
      style={{ width:44, height:24, borderRadius:12, background:on ? T.success : T.elevated,
        border: `1px solid ${on ? T.success : T.border}`,
        position:"relative", cursor:"pointer", transition:"background 0.2s" }}
    >
      <div style={{ position:"absolute", top:2, left:on?22:2, width:18, height:18,
        borderRadius:"50%", background:on ? "#fff" : T.textMuted, transition:"left 0.2s",
        boxShadow:"0 1px 3px rgba(0,0,0,0.25)" }} />
    </div>
  );
};

const ChevronRight = () => {
  const { T } = useTheme();
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={T.textMuted}
      strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
  );
};

const WaveIcon = () => {
  const { T } = useTheme();
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={T.success}
      strokeWidth="2" strokeLinecap="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
};

// ── Modal Components ─────────────────────────────────────────────

const SimpleModal = ({ isOpen, title, children, onClose, onSave, isSaving }) => {
  const { T } = useTheme();
  if (!isOpen) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1000
    }}>
      <div style={{
        background: T.cardBg, border: `1px solid ${T.borderStrong}`,
        borderRadius: 12, padding: "24px", maxWidth: "500px",
        width: "90%", boxShadow: T.shadowHover
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: T.textPrimary }}>
          {title}
        </div>
        <div style={{ marginBottom: 20 }}>
          {children}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.elevated, color: T.textMuted, cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={isSaving} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: isSaving ? T.elevated : T.success, color: isSaving ? T.textMuted : "#fff",
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

  const [showQosChartModal, setShowQosChartModal] = useState(false);
  const [qosChartData, setQosChartData] = useState({});
  const [isFetchingQosChart, setIsFetchingQosChart] = useState(false);
  const [ndpiCurrentHour, setNdpiCurrentHour] = useState(null);
  const [qosTooltip, setQosTooltip] = useState(null);
  const [allocCardHovered, setAllocCardHovered] = useState(false);
  const [pipeOverflow, setPipeOverflow] = useState({});

  const [showDeviceHistoryModal, setShowDeviceHistoryModal] = useState(false);
  const [historySelectedDevice, setHistorySelectedDevice] = useState(null);
  const [deviceHistoryPoints, setDeviceHistoryPoints] = useState([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [historyTooltip, setHistoryTooltip] = useState(null);
  const [historyUsedDate, setHistoryUsedDate] = useState(null);

  const [activeHosts, setActiveHosts] = useState([]);
  const [qosClassifications, setQosClassifications] = useState([]);
  const [downloadRateMbps, setDownloadRateMbps] = useState(0);
  const [uploadRateMbps, setUploadRateMbps] = useState(0);

  const isEditingApp = useRef(false);
  const isEditingThreshold = useRef(false);
  const isEditingCapacityRef = useRef(false);
  const toastRef = useRef(null);
  const prevActiveMacsRef = useRef(null);
  const trafficCacheRef = useRef(null);
  const pipeContainerRef = useRef({});
  const pipeInnerRef = useRef({});

  const { T, theme } = useTheme();
  const isDark = theme === 'dark';
  // Shadow module-level constants with theme-aware values
  const PRIMARY = T.success;
  const DANGER  = T.danger;
  const WARNING = T.warning;
  const INFO    = T.info;
  const MUTED   = T.textMuted;
  const PRIORITY_STYLE = {
    "High Priority":   { color: T.danger,   bg: T.dangerBg,  border: T.danger  + "30" },
    "Medium Priority": { color: T.warning,  bg: T.warningBg, border: T.warning + "30" },
    "Normal Priority": { color: T.info,     bg: T.infoBg,    border: T.info    + "30" },
    "Low Priority":    { color: T.textMuted, bg: T.mutedBg,  border: T.border },
  };
  const QUEUE_PS = {
    "Highest Bandwidth Queue":  PRIORITY_STYLE["High Priority"],
    "Moderate Bandwidth Queue": PRIORITY_STYLE["Medium Priority"],
    "Default Bandwidth Queue":  PRIORITY_STYLE["Normal Priority"],
    "Low Bandwidth Queue":      PRIORITY_STYLE["Low Priority"],
  };

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

        // const trafficData = await fetchText(`${API_BASE}/smart-bandwidth/traffic`); // Disabled - kept for future use
        const trafficData = null;
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

  const parseNdpiConfig = (rawText) => {
    const result = {};
    if (!rawText || !rawText.trim()) return result;
    let currentHour = null;
    rawText.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const hourMatch = trimmed.match(/^#Hour:(\d+)/);
      if (hourMatch) {
        currentHour = parseInt(hourMatch[1], 10);
        result[currentHour] = [];
        return;
      }
      if (currentHour !== null && !trimmed.startsWith('#')) {
        const parts = trimmed.split(',').map(s => s.trim());
        if (parts.length >= 3) {
          result[currentHour].push({ name: parts[0], mac: parts[1], queue: parts[2] });
        }
      }
    });
    return result;
  };

  const openQosChart = async () => {
    setShowQosChartModal(true);
    setIsFetchingQosChart(true);
    setQosTooltip(null);
    try {
      const [raw, timeRaw, clientsData] = await Promise.all([
        fetch(`${API_BASE}/smart-bandwidth/qos-config`).then(r => r.text()).catch(() => ""),
        fetch(`${API_BASE}/smart-bandwidth/gateway-time`).then(r => r.text()).catch(() => ""),
        fetch(`${API_BASE}/smart-bandwidth/clients`).then(r => r.json()).catch(() => ({})),
      ]);
      if (clientsData && Object.keys(clientsData).length > 0) {
        setMacToNameMap(clientsData);
      }
      setQosChartData(parseNdpiConfig(raw));
      let hour = new Date().getUTCHours();
      if (timeRaw) {
        const m = timeRaw.match(/(\d{2}):(\d{2}):\d{2}/);
        if (m) hour = parseInt(m[1], 10);
      }
      setNdpiCurrentHour(hour);
    } catch {
      setQosChartData({});
      setNdpiCurrentHour(new Date().getUTCHours());
    } finally {
      setIsFetchingQosChart(false);
    }
  };

  function parseTrafficLog(raw) {
    console.log('[TrafficLog] Raw text length:', (raw || '').length);
    const blocks = raw.split('============= END ===========');
    console.log('[TrafficLog] Blocks found:', blocks.length);
    const dayMap = {};
    const ipMap = {};
    let parsedRecords = 0;

    blocks.forEach(block => {
      if (!block.trim()) return;
      let currentTime = null, dateStr = null;
      block.trim().split('\n').forEach(rawLine => {
        const l = rawLine.trim();
        if (!l) return;
        if (l.startsWith('Current Time:')) {
          const rawTs = l.substring(13).trim();
          dateStr = rawTs.split(' ')[0];
          // Normalize to 15-min boundary so keys match buildDeviceHistoryPoints
          const timePart = rawTs.split(' ')[1] || '';
          const tParts = timePart.split(':');
          const hh = (tParts[0] || '00').padStart(2, '0');
          const mm = String(Math.floor(parseInt(tParts[1] || '0', 10) / 15) * 15).padStart(2, '0');
          currentTime = `${dateStr} ${hh}:${mm}:00`;
          return;
        }
        if (l.startsWith('====') || l.startsWith('Protocol')) return;
        const parts = l.split(',');
        if (parts.length < 5 || !currentTime) return;
        const proto = parts[0].trim();
        const ip   = (parts[1] || '').trim();
        const mac  = (parts[2] || '').trim().toLowerCase();
        const tx   = parseInt(parts[3]) || 0;
        const rx   = parseInt(parts[4]) || 0;
        if (!mac || mac === '00:00:00:00:00:00' || mac === '00:00:00:ff:ff:00') return;
        if (!ip  || ip  === '0.0.0.0' || ip === '127.0.0.1') return;

        // Index by MAC
        if (!dayMap[dateStr])              dayMap[dateStr] = {};
        if (!dayMap[dateStr][mac])         dayMap[dateStr][mac] = {};
        if (!dayMap[dateStr][mac][currentTime]) dayMap[dateStr][mac][currentTime] = { tx: 0, rx: 0, apps: [], appStats: {} };
        dayMap[dateStr][mac][currentTime].tx += tx;
        dayMap[dateStr][mac][currentTime].rx += rx;
        if (proto && !dayMap[dateStr][mac][currentTime].apps.includes(proto))
          dayMap[dateStr][mac][currentTime].apps.push(proto);
        if (proto) {
          if (!dayMap[dateStr][mac][currentTime].appStats[proto])
            dayMap[dateStr][mac][currentTime].appStats[proto] = { tx: 0, rx: 0 };
          dayMap[dateStr][mac][currentTime].appStats[proto].tx += tx;
          dayMap[dateStr][mac][currentTime].appStats[proto].rx += rx;
        }

        // Index by IP (fallback when MAC is unavailable)
        if (!ipMap[dateStr])             ipMap[dateStr] = {};
        if (!ipMap[dateStr][ip])         ipMap[dateStr][ip] = {};
        if (!ipMap[dateStr][ip][currentTime]) ipMap[dateStr][ip][currentTime] = { tx: 0, rx: 0, apps: [], appStats: {} };
        ipMap[dateStr][ip][currentTime].tx += tx;
        ipMap[dateStr][ip][currentTime].rx += rx;
        if (proto && !ipMap[dateStr][ip][currentTime].apps.includes(proto))
          ipMap[dateStr][ip][currentTime].apps.push(proto);
        if (proto) {
          if (!ipMap[dateStr][ip][currentTime].appStats[proto])
            ipMap[dateStr][ip][currentTime].appStats[proto] = { tx: 0, rx: 0 };
          ipMap[dateStr][ip][currentTime].appStats[proto].tx += tx;
          ipMap[dateStr][ip][currentTime].appStats[proto].rx += rx;
        }

        parsedRecords++;
      });
    });

    const day1 = Object.keys(dayMap).sort()[0] || null;
    console.log('[TrafficLog] Records parsed:', parsedRecords, '| Day1:', day1,
      '| MACs on day1:', day1 ? Object.keys(dayMap[day1] || {}).length : 0,
      '| IPs on day1:', day1 ? Object.keys(ipMap[day1] || {}).length : 0);
    return { dayMap, ipMap, day1 };
  }

  function buildDeviceHistoryPoints(mac, ip, targetDate, { dayMap, ipMap, day1 }) {
    const availDates = Object.keys(dayMap).sort();
    console.log('[DeviceHistory] Building points — mac:', mac, '| ip:', ip);
    console.log('[DeviceHistory] Target date (today-7d):', targetDate, '| Available dates:', availDates);

    if (availDates.length === 0) {
      console.warn('[DeviceHistory] No dates found in traffic log — log may be empty');
      setDeviceHistoryPoints([]);
      setHistoryUsedDate(null);
      return;
    }

    // Select the date to display: prefer exact match on targetDate, else closest older date, else day1
    let useDate = null;
    if (targetDate && dayMap[targetDate]) {
      useDate = targetDate;
      console.log('[DeviceHistory] Exact match for target date:', useDate);
    } else {
      // Find closest date that is <= targetDate (historical, not future)
      const older = targetDate ? availDates.filter(d => d <= targetDate) : [];
      if (older.length > 0) {
        useDate = older[older.length - 1]; // most recent date that is still <= target
        console.log('[DeviceHistory] No exact match — using closest older date:', useDate, '(target was', targetDate + ')');
      } else {
        useDate = day1; // fallback: earliest available
        console.log('[DeviceHistory] No older dates available — fallback to earliest:', useDate);
      }
    }

    setHistoryUsedDate(useDate);

    const macNorm = (mac || '').toLowerCase();
    let deviceData = (dayMap[useDate] || {})[macNorm] || {};
    console.log('[DeviceHistory] MAC lookup on', useDate, ':', macNorm, '→', Object.keys(deviceData).length, 'slots');

    if (Object.keys(deviceData).length === 0 && ip && (ipMap?.[useDate] || {})[ip]) {
      console.log('[DeviceHistory] MAC empty — falling back to IP lookup:', ip);
      deviceData = ipMap[useDate][ip];
      console.log('[DeviceHistory] IP lookup slots:', Object.keys(deviceData).length);
    }

    const points = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const ts = `${useDate} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        const slot = deviceData[ts] || { tx: 0, rx: 0, apps: [], appStats: {} };
        points.push({
          time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          timestamp: ts,
          tx: slot.tx,
          rx: slot.rx,
          total: slot.tx + slot.rx,
          apps: slot.apps,
          appStats: slot.appStats || {},
        });
      }
    }
    const nonZero = points.filter(p => p.total > 0).length;
    console.log('[DeviceHistory] Points: 96 total | Non-zero:', nonZero, '| Date used:', useDate);
    setDeviceHistoryPoints(points);
  }

  async function openDeviceHistory(mac, name, ip) {
    // Compute target date: exactly 7 days before today (UTC)
    const nowUtc = new Date();
    const sevenDaysAgo = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate()) - 7 * 24 * 60 * 60 * 1000);
    const targetDate = `${sevenDaysAgo.getUTCFullYear()}-${String(sevenDaysAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getUTCDate()).padStart(2, '0')}`;

    console.log('[DeviceHistory] Opening for device:', name, '| mac:', mac || '(none)', '| ip:', ip || '(none)', '| targetDate:', targetDate);
    setHistorySelectedDevice({ mac, name, ip });
    setHistoryUsedDate(null);
    setShowDeviceHistoryModal(true);
    setHistoryTooltip(null);
    setDeviceHistoryPoints([]);

    // Only use cache if it actually has data (day1 is non-null means log had records)
    if (trafficCacheRef.current?.day1) {
      console.log('[DeviceHistory] Using cached traffic data (day1:', trafficCacheRef.current.day1, ')');
      buildDeviceHistoryPoints(mac, ip, targetDate, trafficCacheRef.current);
      return;
    }

    setIsFetchingHistory(true);
    try {
      console.log('[DeviceHistory] >>> Fetching GET /api/smart-bandwidth/traffic ...');
      const response = await fetch(`${API_BASE}/smart-bandwidth/traffic`);
      const raw = response.ok ? await response.text() : "";
      console.log('[DeviceHistory] API status:', response.status, '| Response length:', (raw || '').length, 'bytes');
      if (!raw || !raw.trim()) {
        console.warn('[DeviceHistory] Traffic API returned empty body. Verify the log file exists on the gateway.');
        setDeviceHistoryPoints([]);
        return;
      }
      const parsed = parseTrafficLog(raw);
      // Only persist cache when the response has actual records — prevents truthy-empty-object blocking re-fetches
      if (parsed.day1) {
        trafficCacheRef.current = parsed;
        console.log('[DeviceHistory] Cache populated. Available dates:', Object.keys(parsed.dayMap).sort());
      } else {
        console.warn('[DeviceHistory] Parsed log had no dated records. Cache not stored — will retry on next open.');
      }
      buildDeviceHistoryPoints(mac, ip, targetDate, parsed);
    } catch (e) {
      console.error('[DeviceHistory] Fetch error:', e);
    } finally {
      setIsFetchingHistory(false);
    }
  }

  // Poll active hosts every 3 seconds; notify when a client transitions to active
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const pollActiveHosts = async () => {
      try {
        const data = await fetch(`${API_BASE}/smart-bandwidth/active-hosts`).then(r => r.json()).catch(() => ({ hosts: [], totalRxBytesPerSec: 0, totalTxBytesPerSec: 0 }));
        const hosts = Array.isArray(data) ? data : (data.hosts || []);
        if (!isMounted || !Array.isArray(hosts)) return;

        setActiveHosts(hosts);
        setDownloadRateMbps(parseFloat(((data.totalRxBytesPerSec || 0) * 8 / 1_000_000).toFixed(2)));
        setUploadRateMbps(parseFloat(((data.totalTxBytesPerSec || 0) * 8 / 1_000_000).toFixed(2)));

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
              detail: `Guest: ${host.name} got connected! Allocating Normal Queue`,
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

  // Detect pipeline overflow: switch to conveyor belt when capsules exceed container width
  useLayoutEffect(() => {
    const next = {};
    Object.keys(pipeContainerRef.current).forEach(tier => {
      const container = pipeContainerRef.current[tier];
      const inner     = pipeInnerRef.current[tier];
      if (container && inner) {
        next[tier] = inner.scrollWidth > container.clientWidth + 4;
      }
    });
    setPipeOverflow(prev => {
      const same = Object.keys(next).length === Object.keys(prev).length &&
        Object.keys(next).every(k => next[k] === prev[k]);
      return same ? prev : next;
    });
  }, [activeHosts, qosClassifications]);

  // Traffic data disabled - kept for future use
  // const activeData = allTrafficData[latestBlockTs] || { traffic: [], timeStr: "" };
  // const liveTraffic = activeData.traffic || [];
  // const allConfiguredProtos = [...PROTO_HIGH, ...PROTO_MEDIUM, ...PROTO_NORMAL, ...PROTO_LOW].map(p => (p || "").toLowerCase());
  // const filteredTraffic = liveTraffic.filter(r => allConfiguredProtos.includes((r.proto || "").toLowerCase()));
  // const uniqueProtosCount = [...new Set(filteredTraffic.map(r => r.proto))].length;
  // const totalRx = filteredTraffic.reduce((s, r) => s + r.rx, 0);
  // const totalTx = filteredTraffic.reduce((s, r) => s + r.tx, 0);

  // These are now empty refs populated dynamically during fetch so UI builds cleanly
  const PROTO_TIERS = [
    { tier:"High Priority",   color:DANGER,  protos:PROTO_HIGH },
    { tier:"Medium Priority", color:WARNING, protos:PROTO_MEDIUM },
    { tier:"Normal Priority", color:INFO,    protos:PROTO_NORMAL },
    { tier:"Low Priority",    color:MUTED,   protos:PROTO_LOW },
  ];

  // Pipeline: only show active devices (IP must be in activeHosts)
  const _activeIPs = new Set(activeHosts.map(h => h.ip).filter(Boolean));
  const activeQosForPipeline = qosClassifications.filter(cls => cls.destIp && _activeIPs.has(cls.destIp));

  const pipelineDeviceApps = {
    "Highest Bandwidth Queue": [],
    "Moderate Bandwidth Queue": [],
    "Default Bandwidth Queue": [],
    "Low Bandwidth Queue": [],
  };
  const _pipeQueueOrder = { "Highest Bandwidth Queue":1, "Moderate Bandwidth Queue":2, "Default Bandwidth Queue":3, "Low Bandwidth Queue":4 };
  const _sortIP = (ip) => (ip || "").split(".").map(n => parseInt(n, 10) || 0);
  const _cmpIP = (a, b) => { const pa = _sortIP(a), pb = _sortIP(b); for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]; return 0; };

  const _qdMap = {};
  activeQosForPipeline.forEach(cls => {
    const queue = cls.queue || "Default Bandwidth Queue";
    const device = cls.deviceName || "Unknown";
    const key = `${queue}|||${device}`;
    if (!_qdMap[key]) {
      _qdMap[key] = { device, ip: cls.destIp || "", queue, apps: [] };
      if (pipelineDeviceApps[queue]) pipelineDeviceApps[queue].push(_qdMap[key]);
    }
    if (cls.dpiProtocol) _qdMap[key].apps.push(cls.dpiProtocol);
  });

  // Sort each device's apps by queue priority (Highest → Low), then sort devices by IP
  Object.keys(pipelineDeviceApps).forEach(tier => {
    pipelineDeviceApps[tier].forEach(item => {
      item.apps.sort((a, b) => (_pipeQueueOrder[a] || 99) - (_pipeQueueOrder[b] || 99));
    });
    pipelineDeviceApps[tier].sort((a, b) => _cmpIP(a.ip, b.ip));
  });

  // Guest hosts: active but no QoS classification → Default queue (no app chain)
  const _managedIPs = new Set(activeQosForPipeline.map(c => c.destIp).filter(Boolean));
  const _seenGuests = new Set();
  activeHosts.forEach(host => {
    if (host.ip && _managedIPs.has(host.ip)) return;
    if (!host.name || _seenGuests.has(host.name)) return;
    _seenGuests.add(host.name);
    pipelineDeviceApps["Default Bandwidth Queue"].push({ device: host.name, ip: host.ip || "", apps: [], isGuest: true });
  });

  // Re-sort Default queue after guests are added (guests have IPs too)
  pipelineDeviceApps["Default Bandwidth Queue"].sort((a, b) => _cmpIP(a.ip, b.ip));

  const pipelineQueues = capacityInfo.map(c => ({ ...c, items: pipelineDeviceApps[c.tier] || [] }));
  const maxPipelineMbps = Math.max(...capacityInfo.map(c => c.mbps), 1);

  const activeAllocationsClassified = activeQosForPipeline.length;
  const activeAllocationsGuests = _seenGuests.size;
  const activeAllocationsTotal = activeAllocationsClassified + activeAllocationsGuests;

  // Build name/IP → rate lookup from activeHosts (rates in bytes/sec)
  const hostRateByKey = {};
  activeHosts.forEach(h => {
    const rates = { rx: h.rxRate || 0, tx: h.txRate || 0 };
    if (h.name) hostRateByKey[h.name] = rates;
    if (h.ip)   hostRateByKey[h.ip]   = rates;
  });

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", background: T.bg, minHeight:"100vh", color: T.textPrimary }}>
      <style>{`
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slidein{ from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        .live-dot   { animation: blink 2s infinite; }
        .fade-in    { animation: slidein 0.3s ease both; }
        .tab-btn { transition: all 0.15s; }
        .stage-pill { transition: border-color 0.2s, box-shadow 0.2s; }
        .p-toast { width: auto; min-width: 200px; max-width: 400px; }
        .p-toast-message { margin: 0 0 0 1rem; }
        .p-toast-summary { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
        .p-toast-detail { font-size: 13px; margin: 0; }
        .p-toast-icon { display: none; }
        @keyframes floatChip0 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-7px)} }
        @keyframes floatChip1 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-9px)} }
        @keyframes floatChip2 { 0%,100%{transform:translateY(-2px)} 50%{transform:translateY(5px)} }
        @keyframes floatChip3 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-5px)} }
        @keyframes pipeFlow   { from{background-position-x:0} to{background-position-x:56px} }
        @keyframes shimmer    { 0%,100%{transform:translateX(-100%)} 50%{transform:translateX(100%)} }
        @keyframes conveyorBelt { from { transform:translateX(-50%); } to { transform:translateX(0); } }
      `}</style>

      <Toast ref={toastRef} position="top-right" />

      {/* ── Header ── */}
      <div style={{ background: T.cardBg, borderBottom: `1px solid ${T.border}`, padding:"13px 24px", margin: "18px 20px 0px 20px",
      display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:8, background: T.successBg,
            border: `1px solid ${T.success}30`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <WaveIcon />
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color: T.textPrimary }}>Smart Bandwidth Allocator</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {enabled === null ? (
              <span style={{ fontSize:13, fontWeight:500, color: MUTED }}>Fetching Status..</span>
            ) : (
              <>
                <span style={{ fontSize:13, fontWeight:500, color: enabled ? PRIMARY : MUTED }}>
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
          <PropagateLoader label="Loading..." />
        </div>
      ) : !enabled ? (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center",
          height:"60vh", flexDirection:"column", gap:16 }}>
          <div style={{ background: T.cardBg, padding:"30px 40px", borderRadius:12,
            border: `1px solid ${T.border}`, textAlign:"center",
            boxShadow: T.shadow }}>
            <h2 style={{ margin:"16px 0 8px", color: T.textPrimary, fontSize:20 }}>Service Disabled</h2>
            <p style={{ margin:0, color: MUTED, fontSize:14 }}>
              Enable the Smart Bandwidth Allocator to view predictions and QoS enforcement
            </p>
          </div>
        </div>
      ) : (

      <div style={{ padding:"20px 24px", maxWidth:1320, margin:"0 auto" }}>

        {/* ── Stat Cards ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
          {[
            { label:"Clients Connected",            value:activeHosts.length,            accent: PRIMARY,        Icon: Users,    iconBg: T.successBg  },
            { label:"Enforced Allocations", value:activeAllocationsTotal, tip:`${activeAllocationsClassified} Predicted · ${activeAllocationsGuests} Guests`, accent: T.textPrimary, Icon: Layers,   iconBg: T.accentMuted },
            { label:"Download Rate",                value:`${downloadRateMbps.toFixed(2)} Mbps`, accent: WARNING, Icon: Download, iconBg: T.warningBg  },
            { label:"Upload Rate",                  value:`${uploadRateMbps.toFixed(2)} Mbps`,   accent: INFO,    Icon: Upload,   iconBg: T.infoBg     },
          ].map((s, i) => (
            <div key={i}
              style={{ background: T.cardBg, borderRadius:10, padding:"14px 16px",
                border: `1px solid ${T.border}`, boxShadow: T.shadow, position:"relative",
                transition:"box-shadow 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowHover; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadow; }}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ fontSize:15, color: MUTED, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                  {s.label}
                </div>
                <div style={{
                  width:40, height:40, borderRadius:8, background: s.iconBg,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>
                  <s.Icon size={20} color={s.accent} />
                </div>
              </div>
              <div style={{ fontSize:30, fontWeight:700, color:s.accent, lineHeight:1, marginBottom:4 }}>
                {s.value}
              </div>
              {s.tip && (
                <div style={{ fontSize:12, color: MUTED, fontWeight:500, marginTop:4, letterSpacing:"0.02em" }}>
                  {s.tip}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:16, marginBottom:16 }}>

          {/* Left Column Wrapper */}
          <div style={{ display:"flex", flexDirection:"column", minWidth:0 }}>

            {/* Left: QoS Allocations Table */}
            <div style={{ background: T.cardBg, borderRadius:10, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow:"hidden", display:"flex", flexDirection:"column", flex:1, maxHeight: 550 }}>
              <div style={{ padding:"14px 16px", borderBottom: `1px solid ${T.border}`,
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:600, fontSize:16, color: T.textPrimary }}>QoS Allocations</div>
              </div>

              <div style={{ overflowY:"auto", flex: 1 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:15, tableLayout:"fixed" }}>
                  <colgroup>
                    <col style={{ width:"38%" }} />
                    <col style={{ width:"29%" }} />
                    <col style={{ width:"33%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: T.elevated, borderBottom: `1px solid ${T.border}` }}>
                      {["Client","Applications","Queue"].map(h => (
                        <th key={h} style={{ padding:"9px 10px", textAlign:"center",
                          fontWeight:600, color: MUTED, fontSize:14, letterSpacing:"0.05em" }}>{h}</th>
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

                      const QUEUE_ORDER = {
                        "Highest Bandwidth Queue": 1,
                        "Moderate Bandwidth Queue": 2,
                        "Default Bandwidth Queue": 3,
                        "Low Bandwidth Queue": 4,
                      };

                      const sortIP = (ip) => (ip || "").split(".").map(n => parseInt(n, 10) || 0);
                      const cmpIP = (a, b) => {
                        const pa = sortIP(a), pb = sortIP(b);
                        for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
                        return 0;
                      };

                      // Build IP → MAC lookup from activeHosts
                      const ipToMac = {};
                      activeHosts.forEach(h => { if (h.ip && h.mac) ipToMac[h.ip] = h.mac; });

                      // Group by device
                      const deviceGroupMap = {};
                      activeClassifications.forEach(cls => {
                        const device = cls.deviceName || "Unknown";
                        if (!deviceGroupMap[device]) {
                          const mac = ipToMac[cls.destIp] || '';
                          deviceGroupMap[device] = { device, ip: cls.destIp || "", mac, entries: [] };
                        }
                        deviceGroupMap[device].entries.push({
                          app: cls.dpiProtocol || "-",
                          queue: cls.queue || "Default Bandwidth Queue"
                        });
                      });

                      // Sort each device's apps by queue priority (High → Low)
                      Object.values(deviceGroupMap).forEach(g => {
                        g.entries.sort((a, b) => (QUEUE_ORDER[a.queue] || 99) - (QUEUE_ORDER[b.queue] || 99));
                      });

                      // Sort groups by IP numerically
                      const groups = Object.values(deviceGroupMap).sort((a, b) => cmpIP(a.ip, b.ip));

                      if (groups.length === 0 && guestHosts.length === 0) {
                        return (
                          <tr>
                            <td colSpan={3} style={{ padding:"40px 0", textAlign:"center", color: MUTED, fontSize:14 }}>
                              No QoS Allocations Configured !
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <>
                          {groups.flatMap(({ device, ip, mac, entries }) =>
                            entries.map((entry, i) => {
                              const ps = QUEUE_PS[entry.queue] || PRIORITY_STYLE["Normal Priority"];
                              return (
                                <tr key={`${device}-${i}`} className="fade-in"
                                  style={{ borderBottom: i === entries.length - 1 ? `1.5px solid ${T.border}` : `1px solid ${T.elevated}` }}>
                                  {i === 0 && (
                                    <td rowSpan={entries.length} style={{
                                      padding:"13px 10px", fontSize:17,
                                      color: T.textPrimary, fontWeight:600, verticalAlign:"middle",
                                      textAlign:"center",
                                      borderRight: `1px solid ${T.border}`, letterSpacing:"0.03em",
                                    }}>
                                      <div
                                        style={{ cursor:"pointer", color: PRIMARY, textDecoration:"underline dotted" }}
                                        onClick={() => openDeviceHistory(mac, device, ip)}
                                      >{device}</div>
                                      {(() => { const r = hostRateByKey[device] || hostRateByKey[ip] || { rx:0, tx:0 }; return (
                                        <div style={{ display:"flex", gap:8, marginTop:3, justifyContent:"center" }}>
                                          <span style={{ fontSize:12, fontWeight:500, color: T.textSec }}>(↑ {fmtMbps(r.tx)} Mb/s</span>
                                          <span style={{ fontSize:12, fontWeight:500, color: T.textSec }}>↓ {fmtMbps(r.rx)} Mb/s)</span>
                                        </div>
                                      ); })()}
                                    </td>
                                  )}
                                  <td style={{ padding:"13px 10px", letterSpacing:"0.03em", textAlign:"center" }}>
                                    {(() => {
                                      const logoKey = (entry.app || "").toLowerCase();
                                      const logoSrc = APP_LOGOS[logoKey];
                                      return (
                                        <span style={{ fontSize:15, fontWeight:600, padding:"2px 8px",
                                          borderRadius:4, background: T.elevated, color: T.textPrimary,
                                          display:"inline-flex", alignItems:"center", gap:6 }}>
                                          {logoSrc ? (
                                            <img
                                              src={logoSrc}
                                              alt=""
                                              style={{ width:20, height:20, objectFit:"contain",
                                                flexShrink:0, borderRadius:3 }}
                                              onError={e => { e.currentTarget.style.display = "none"; }}
                                            />
                                          ) : (
                                            <span style={{ width:20, height:20, borderRadius:3,
                                              background: T.border, display:"inline-flex",
                                              alignItems:"center", justifyContent:"center",
                                              fontSize:10, color: T.textMuted, flexShrink:0,
                                              fontWeight:700 }}>
                                              {(entry.app || "?").charAt(0).toUpperCase()}
                                            </span>
                                          )}
                                          {toTitleCase(entry.app)}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td style={{ padding:"13px 10px", letterSpacing:"0.03em", textAlign:"center" }}>
                                    <span style={{ fontSize:15, padding:"2px 8px", borderRadius:4,
                                      fontWeight:600, background:ps.bg,
                                      color: (isDark && entry.queue === "Low Bandwidth Queue") ? "#ffffff" : ps.color,
                                      border:`1px solid ${ps.border}` }}>
                                      {entry.queue.replace(' Bandwidth', '').replace('Default', 'Normal').replace(/\bLow\b/, 'Lowest')}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                          {guestHosts.map((host, i) => {
                            const guestPs = QUEUE_PS["Default Bandwidth Queue"];
                            return (
                              <tr key={`guest-${i}`} style={{ borderBottom: `1px solid ${T.elevated}` }}>
                                <td style={{ padding:"13px 10px", fontSize:17,
                                  color: T.textPrimary, fontWeight:600, borderRight: `1px solid ${T.border}`, letterSpacing:"0.03em", textAlign:"center" }}>
                                  <div>{host.name} <span style={{ fontSize:13, color: MUTED, marginLeft:6 }}>(Guest)</span></div>
                                  {(() => { const r = hostRateByKey[host.name] || hostRateByKey[host.ip] || { rx:0, tx:0 }; return (
                                    <div style={{ display:"flex", gap:8, marginTop:3, justifyContent:"center" }}>
                                      <span style={{ fontSize:12, fontWeight:500, color: T.textSec }}>(↑ {fmtMbps(r.tx)} Mb/s</span>
                                      <span style={{ fontSize:12, fontWeight:500, color: T.textSec }}>↓ {fmtMbps(r.rx)} Mb/s)</span>
                                    </div>
                                  ); })()}
                                </td>
                                <td style={{ padding:"13px 10px", letterSpacing:"0.03em", textAlign:"center" }}>
                                  <span style={{ fontSize:15, fontWeight:600, padding:"2px 8px",
                                    borderRadius:4, background: T.elevated, color: T.textPrimary }}>
                                    -
                                  </span>
                                </td>
                                <td style={{ padding:"13px 10px", letterSpacing:"0.03em", textAlign:"center" }}>
                                  <span style={{ fontSize:15, padding:"2px 8px", borderRadius:4,
                                    fontWeight:600, background:guestPs.bg, color:guestPs.color,
                                    border:`1px solid ${guestPs.border}` }}>
                                    Normal Queue
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


            {/* Hourly Queue Configuration */}
            <div style={{ background: T.cardBg, borderRadius:10, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding:"13px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:15, color: T.textPrimary }}>Allocation Timeline</div>
                  <div style={{ fontSize:11, color: MUTED, marginTop:2 }}>24 Hours Bandwidth Configurations</div>
                </div>
                <button
                  onClick={openQosChart}
                  style={{
                    padding:"4px 10px", fontSize:12, fontWeight:500, borderRadius:4,
                    border: `1px solid ${T.border}`, background: T.elevated, color: PRIMARY, cursor:"pointer"
                  }}
                >
                  View Chart
                </button>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:10, flexWrap:"wrap" }}>
                {[
                  { label:"High",     color: DANGER  },
                  { label:"Moderate", color: WARNING },
                  { label:"Normal",   color: INFO    },
                  { label:"Lowest",   color: MUTED   },
                ].map(q => (
                  <div key={q.label} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:q.color }} />
                    <span style={{ color: T.textMuted }}>{q.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* App Config (protocol tier configuration) */}
            <div style={{ background: T.cardBg, borderRadius:10, border: `1px solid ${T.border}`, boxShadow: T.shadow, overflow:"hidden", height:200, display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"13px 16px", borderBottom: `1px solid ${T.border}`,
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:600, fontSize:15, color: T.textPrimary }}>App Config</div>
                <button onClick={() => { isEditingApp.current = true; setShowAppConfigModal(true); }} style={{
                  padding:"4px 10px", fontSize:12, fontWeight:500, borderRadius:4,
                  border: `1px solid ${T.border}`, background: T.elevated, color: PRIMARY, cursor:"pointer"
                }}>
                  Edit
                </button>
              </div>

              <div style={{ padding:"10px 14px", overflowY:"auto", flex: 1 }}>
                {PROTO_TIERS.map(tier => (
                  <div key={tier.tier} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                      <div style={{ width:9, height:9, borderRadius:2, background:tier.color }} />
                      <span style={{ fontSize:13, fontWeight:600, color: T.textPrimary }}>{tier.tier.replace(/\bLow\b/, 'Lowest')}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, justifyContent:"flex-start" }}>
                      {tier.protos.map(p => (
                        <span key={p} style={{ fontSize:13, padding:"3px 6px", borderRadius:4,
                          background: T.elevated, border: `1px solid ${T.border}`,
                          color: T.textSec }}>{toTitleCase(p)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Max Capacity Allocation */}
            <div style={{ background: T.cardBg, borderRadius:10, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding:"14px 16px", flex: 1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600, color: MUTED, letterSpacing:"0.05em",
                  textTransform:"uppercase" }}>
                  Max Capacity Allocation · {maxCapacityStr}
                </div>
                <button onClick={() => { isEditingCapacityRef.current = true; setShowCapacityModal(true); }} style={{
                  padding:"4px 10px", fontSize:12, fontWeight:500, borderRadius:4,
                  border: `1px solid ${T.border}`, background: T.elevated, color: PRIMARY, cursor:"pointer"
                }}>
                  Edit
                </button>
              </div>
              {capacityInfo.map(c => (
                <div key={c.tier} style={{ marginBottom:11 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:13, color: T.textSec, fontWeight:500 }}>{c.tier.replace(' Bandwidth', '').replace('Default', 'Normal').replace(/\bLow\b/, 'Lowest')}</span>
                    <span style={{ fontSize:13, color:c.color, fontWeight:600 }}>
                      {c.mbps} Mbps &nbsp;({c.pct}%)
                    </span>
                  </div>
                  <div style={{ height:6, background: T.elevated, borderRadius:3, overflow:"hidden" }}>
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
        <div style={{ background: T.cardBg, borderRadius:10, border: `1px solid ${T.border}`, boxShadow: T.shadow, padding:"20px 24px" }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:15, color: T.textPrimary }}>Bandwidth Queue Pipelines</div>
            </div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"flex-end" }}>
              {capacityInfo.map(c => (
                <div key={c.tier} style={{ display:"flex", alignItems:"center", gap:5, fontSize:13 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:c.color }} />
                  <span style={{ color: T.textSec, fontWeight:500 }}>{c.mbps} Mbps</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pipelines */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {pipelineQueues.map((pipe, qi) => {
              const widthPct    = Math.max(pipe.mbps > 0 ? Math.round((pipe.mbps / maxPipelineMbps) * 100) : 12, 12);
              const heightPx    = Math.max(72, 50 + widthPct * 0.4);
              const animNames   = ["floatChip0","floatChip1","floatChip2","floatChip3"];
              const isConveyor  = !!pipeOverflow[pipe.tier];
              const conveyorDuration = Math.max(16, pipe.items.length * 10);

              return (
                <div key={qi}>
                  {/* Row label */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ width:11, height:11, borderRadius:3, background:pipe.color, flexShrink:0 }} />
                    <span style={{ fontSize:14, fontWeight:600, color: T.textSec }}>{pipe.tier.replace('Default', 'Normal').replace(/\bLow\b/, 'Lowest')}</span>
                    <span style={{ fontSize:13, color:pipe.color, marginLeft:"auto", fontWeight:600 }}>
                      {pipe.mbps} Mbps · {pipe.pct}%
                    </span>
                  </div>

                  {/* The pipe */}
                  <div
                    ref={el => { pipeContainerRef.current[pipe.tier] = el; }}
                    style={{
                      width: "100%",
                      height: `${heightPx}px`,
                      background: `linear-gradient(135deg, ${pipe.color}1a 0%, ${pipe.color}08 100%)`,
                      border: `2px solid ${pipe.color}45`,
                      borderLeft: `8px solid ${pipe.color}`,
                      borderRight: `8px solid ${pipe.color}`,
                      borderRadius: 0,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
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
                    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", overflow:"hidden" }}>
                      {pipe.items.length === 0 ? (
                        <span style={{ padding:"0 16px", fontSize:11, color:`${pipe.color}60`, fontStyle:"italic" }}>
                          No active clients
                        </span>
                      ) : isConveyor ? (
                        /* ── Conveyor belt mode: two identical sets side-by-side, animated ── */
                        <div style={{
                          display: "flex", alignItems: "center",
                          animation: `conveyorBelt ${conveyorDuration}s linear infinite`,
                          willChange: "transform",
                        }}>
                          {[0, 1].map(setIdx => (
                            <div
                              key={setIdx}
                              ref={setIdx === 0 ? el => { pipeInnerRef.current[pipe.tier] = el; } : undefined}
                              style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", flexShrink:0 }}
                            >
                              {pipe.items.map((item, ci) => (
                                <div key={ci} style={{
                                  display:"flex", alignItems:"center", gap:4, flexShrink:0,
                                  animationName: animNames[ci % 4],
                                  animationDuration: `${2.2 + (ci % 3) * 0.65}s`,
                                  animationTimingFunction: "ease-in-out",
                                  animationIterationCount: "infinite",
                                  animationDelay: `${ci * 0.3}s`,
                                }}>
                                  <span style={{
                                    fontSize:14, padding:"6px 16px", borderRadius:20, background:T.cardBg,
                                    border:`1.5px solid ${pipe.color}70`,
                                    color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff":T.textPrimary,
                                    fontWeight:700, whiteSpace:"nowrap", boxShadow:`0 2px 6px ${pipe.color}28`,
                                    display:"inline-flex", flexDirection:"column", alignItems:"center", gap:2,
                                  }}>
                                    <span>{item.device}</span>
                                    {(() => { const r = hostRateByKey[item.device] || hostRateByKey[item.ip] || { rx:0, tx:0 }; return (
                                      <span style={{ fontSize:11, fontWeight:500, color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff":`${pipe.color}cc`, display:"flex", gap:6 }}>
                                        <span>↑ {fmtMbps(r.tx)} Mb/s</span>
                                        <span>↓ {fmtMbps(r.rx)} Mb/s</span>
                                      </span>
                                    ); })()}
                                  </span>
                                  {!item.isGuest && item.apps.map((app, ai) => (
                                    <span key={ai} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                      <span style={{ color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff80":`${pipe.color}80`, fontSize:13, fontWeight:700, userSelect:"none", lineHeight:1, letterSpacing:2 }}>●●●</span>
                                      <span style={{
                                        fontSize:14, padding:"6px 16px", borderRadius:20, background:T.elevated,
                                        border:`1.5px solid ${pipe.color}55`,
                                        color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff":`${pipe.color}cc`,
                                        fontWeight:600, whiteSpace:"nowrap", boxShadow:`0 2px 6px ${pipe.color}18`,
                                      }}>
                                        {toTitleCase(app)}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* ── Static mode: single row with float-bob animations ── */
                        <div
                          ref={el => { pipeInnerRef.current[pipe.tier] = el; }}
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", flexWrap:"nowrap" }}
                        >
                          {pipe.items.map((item, ci) => (
                            <div key={ci} style={{
                              display:"flex", alignItems:"center", gap:4, flexShrink:0,
                              animationName: animNames[ci % 4],
                              animationDuration: `${2.2 + (ci % 3) * 0.65}s`,
                              animationTimingFunction: "ease-in-out",
                              animationIterationCount: "infinite",
                              animationDelay: `${ci * 0.3}s`,
                            }}>
                              <span style={{
                                fontSize:14, padding:"6px 16px", borderRadius:20, background:T.cardBg,
                                border:`1.5px solid ${pipe.color}70`,
                                color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff":T.textPrimary,
                                fontWeight:700, whiteSpace:"nowrap", boxShadow:`0 2px 6px ${pipe.color}28`,
                                display:"inline-flex", flexDirection:"column", alignItems:"center", gap:2,
                              }}>
                                <span>{item.device}</span>
                                {(() => { const r = hostRateByKey[item.device] || hostRateByKey[item.ip] || { rx:0, tx:0 }; return (
                                  <span style={{ fontSize:11, fontWeight:500, color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff":`${pipe.color}cc`, display:"flex", gap:6 }}>
                                    <span>↑ {fmtMbps(r.tx)} Mb/s</span>
                                    <span>↓ {fmtMbps(r.rx)} Mb/s</span>
                                  </span>
                                ); })()}
                              </span>
                              {!item.isGuest && item.apps.map((app, ai) => (
                                <span key={ai} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                  <span style={{ color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff80":`${pipe.color}80`, fontSize:13, fontWeight:700, userSelect:"none", lineHeight:1, letterSpacing:2 }}>●●●</span>
                                  <span style={{
                                    fontSize:14, padding:"6px 16px", borderRadius:20, background:T.elevated,
                                    border:`1.5px solid ${pipe.color}55`,
                                    color:(isDark && pipe.tier==="Low Bandwidth Queue")?"#ffffff":`${pipe.color}cc`,
                                    fontWeight:600, whiteSpace:"nowrap", boxShadow:`0 2px 6px ${pipe.color}18`,
                                  }}>
                                    {toTitleCase(app)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Modals ── */}

        {/* Hourly Queue Configuration Chart Modal */}
        {showQosChartModal && (() => {
          const QUEUE_CFG = {
            "Highest Priority": { color: DANGER,  height: 4, bandwidthQueue: "Highest Bandwidth Queue" },
            "High Priority":    { color: DANGER,  height: 4, bandwidthQueue: "Highest Bandwidth Queue" },
            "Medium Priority":  { color: WARNING, height: 3, bandwidthQueue: "Moderate Bandwidth Queue" },
            "Normal Priority":  { color: INFO,    height: 2, bandwidthQueue: "Normal Bandwidth Queue"  },
            "Low Priority":     { color: MUTED,   height: 1, bandwidthQueue: "Lowest Bandwidth Queue"   },
          };
          const curHour = ndpiCurrentHour ?? new Date().getUTCHours();
          const visibleHours = Array.from({ length: 24 }, (_, h) => h);

          // SVG chart constants — fixed per-group width for horizontal scroll
          const GROUP_W = 50;
          const ML = 44, MR = 16, MT = 16, MB = 56;
          const H = 300;
          const plotH = H - MT - MB;
          const W = visibleHours.length * GROUP_W + ML + MR;
          const MAX_PRIO = 5;
          const BAR_GAP = 2;
          const GROUP_PAD = 6;
          const groupW = GROUP_W;

          const yPos   = (v) => MT + plotH - (v / MAX_PRIO) * plotH;
          const yBarH  = (v) => (v / MAX_PRIO) * plotH;

          // Build flat bar list
          const FIXED_BAR_W = 10;
          const bars = [];
          visibleHours.forEach((hour, gi) => {
            const apps = (qosChartData[hour] || []);
            const barW = apps.length > 0 ? FIXED_BAR_W : 0;
            const totalW = apps.length * barW + Math.max(0, apps.length - 1) * BAR_GAP;
            const startX = ML + gi * groupW + (groupW - totalW) / 2;
            apps.forEach((app, bi) => {
              const cfg = QUEUE_CFG[app.queue] || { color: MUTED, height: 1 };
              const bx = startX + bi * (barW + BAR_GAP);
              const bh = yBarH(cfg.height);
              bars.push({ bx, by: MT + plotH - bh, barW, bh, hour, gi, app, cfg });
            });
          });

          const LEGEND_ITEMS = [
            { label: "Highest Bandwidth Queue",  color: DANGER  },
            { label: "Moderate Bandwidth Queue", color: WARNING },
            { label: "Normal Bandwidth Queue",   color: INFO    },
            { label: "Lowest Bandwidth Queue",   color: MUTED   },
          ];

          return (
            <div style={{
              position:"fixed", top:0, left:0, right:0, bottom:0,
              background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center",
              justifyContent:"center", zIndex:1000
            }} onClick={(e) => { if (e.target === e.currentTarget) { setShowQosChartModal(false); setQosTooltip(null); } }}>
              <div style={{
                background: T.cardBg, border: `1px solid ${T.borderStrong}`,
                borderRadius:12, padding:"24px",
                maxWidth:900, width:"95%",
                boxShadow: T.shadowHover,
                maxHeight:"90vh", overflowY:"auto"
              }}>
                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700, color: T.textPrimary }}>Hourly Bandwidth Configuration</div>
                    <div style={{ fontSize:12, color: MUTED, marginTop:3 }}>
                      App-Queue Assignments · Full 24-Hour View
                    </div>
                  </div>
                  <button onClick={() => { setShowQosChartModal(false); setQosTooltip(null); }} style={{
                    padding:"6px 14px", borderRadius:6, border: `1px solid ${T.border}`,
                    background: T.elevated, color: MUTED, cursor:"pointer", fontSize:13, fontWeight:500, flexShrink:0
                  }}>
                    Close
                  </button>
                </div>

                {/* Legend */}
                <div style={{ display:"flex", gap:16, marginBottom:20, flexWrap:"wrap", padding:"10px 14px",
                  background: T.elevated, borderRadius:8, border: `1px solid ${T.border}` }}>
                  {LEGEND_ITEMS.map(item => (
                    <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                      <div style={{ width:12, height:12, borderRadius:3, background:item.color, flexShrink:0 }} />
                      <span style={{ color: T.textSec, fontWeight:500 }}>{item.label}</span>
                    </div>
                  ))}
                  {/* <div style={{ marginLeft:"auto", fontSize:11, color:MUTED, display:"flex", alignItems:"center" }}>
                    Bar height = priority level &nbsp;·&nbsp; hover bar for details
                  </div> */}
                </div>

                {isFetchingQosChart ? (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:300 }}>
                    <PropagateLoader />
                  </div>
                ) : (
                  <div style={{ position:"relative" }}>
                    <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
                    <svg
                      width={W}
                      height={H}
                      style={{ display:"block", overflow:"visible" }}
                      onMouseLeave={() => setQosTooltip(null)}
                    >
                      {/* Y-axis gridlines + labels */}
                      {[1,2,3,4].map(level => (
                        <g key={level}>
                          <line x1={ML} y1={yPos(level)} x2={W - MR} y2={yPos(level)}
                            stroke={T.border} strokeWidth={1} />
                          <text x={ML-6} y={yPos(level)+4} fontSize={9} fill={MUTED} textAnchor="end">
                            {level}
                          </text>
                        </g>
                      ))}

                      {/* Hour group separators + X labels */}
                      {visibleHours.map((hour, gi) => (
                        <g key={`g-${hour}`}>
                          {gi > 0 && (
                            <line
                              x1={ML + gi*groupW} y1={MT}
                              x2={ML + gi*groupW} y2={MT+plotH}
                              stroke={T.border} strokeWidth={1} strokeDasharray="3 3"
                            />
                          )}
                          {/* current-hour highlight band */}
                          {hour === curHour && (
                            <rect
                              x={ML + gi*groupW} y={MT}
                              width={groupW} height={plotH}
                              fill={PRIMARY} fillOpacity={0.04}
                            />
                          )}
                          <text
                            x={ML + gi*groupW + groupW/2}
                            y={MT + plotH + 18}
                            fontSize={11}
                            fill={hour === curHour ? PRIMARY : MUTED}
                            fontWeight={hour === curHour ? 700 : 400}
                            textAnchor="middle"
                          >
                            {`${String(hour).padStart(2,"0")}:00`}
                          </text>
                          {hour === curHour && (
                            <text
                              x={ML + gi*groupW + groupW/2}
                              y={MT + plotH + 34}
                              fontSize={9} fill={PRIMARY} textAnchor="middle"
                            >
                              now
                            </text>
                          )}
                        </g>
                      ))}

                      {/* Bars */}
                      {bars.map((bar, i) => (
                        <rect
                          key={i}
                          x={bar.bx} y={bar.by}
                          width={bar.barW} height={bar.bh}
                          fill={bar.cfg.color}
                          rx={2}
                          style={{ cursor:"pointer" }}
                          onMouseEnter={(e) => {
                            setQosTooltip({
                              app: bar.app,
                              hourLabel: `${String(bar.hour).padStart(2,"0")}:00`,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onMouseMove={(e) => {
                            setQosTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev);
                          }}
                          onMouseLeave={() => setQosTooltip(null)}
                        />
                      ))}

                      {/* Axes */}
                      <line x1={ML} y1={MT} x2={ML} y2={MT+plotH} stroke={T.borderStrong} strokeWidth={1} />
                      <line x1={ML} y1={MT+plotH} x2={W - MR} y2={MT+plotH} stroke={T.borderStrong} strokeWidth={1} />

                      {/* Y-axis title */}
                      <text
                        x={10} y={MT + plotH/2}
                        fontSize={9} fill={MUTED} textAnchor="middle"
                        transform={`rotate(-90, 10, ${MT + plotH/2})`}
                      >
                        Queue
                      </text>
                    </svg>
                    </div>

                    {/* Hover Tooltip */}
                    {qosTooltip && (() => {
                      const cfg = QUEUE_CFG[qosTooltip.app.queue] || {};
                      const ttCol = cfg.color || MUTED;
                      const queueLabel = cfg.bandwidthQueue || qosTooltip.app.queue;
                      const deviceName = macToNameMap[(qosTooltip.app.mac || '').toLowerCase().trim()] || qosTooltip.app.mac || "Unknown";
                      const appName = qosTooltip.app.name;
                      const logoSrc = APP_LOGOS[(appName || "").toLowerCase()];
                      return (
                        <div style={{
                          position:"fixed",
                          top: Math.max(8, qosTooltip.y - 190),
                          left: qosTooltip.x + 14,
                          background: T.cardBg,
                          border: `1.5px solid ${ttCol}40`,
                          borderRadius:10,
                          padding:"0",
                          fontSize:12,
                          boxShadow: `0 8px 32px rgba(0,0,0,0.22), 0 0 0 1px ${ttCol}20`,
                          zIndex:2000,
                          pointerEvents:"none",
                          minWidth:220,
                          overflow:"hidden",
                        }}>
                          {/* Coloured header band — Time · Queue */}
                          <div style={{
                            background: `linear-gradient(135deg, ${ttCol}22, ${ttCol}0a)`,
                            borderBottom: `1px solid ${ttCol}30`,
                            padding:"10px 14px 8px 14px",
                            display:"flex", alignItems:"center", justifyContent:"space-between"
                          }}>
                            <div style={{ fontWeight:700, color: T.textPrimary, fontSize:14 }}>
                              {qosTooltip.hourLabel}
                            </div>
                            <span style={{
                              fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                              background: ttCol, color:"#fff", letterSpacing:"0.04em",
                              whiteSpace:"nowrap",
                            }}>
                              {queueLabel}
                            </span>
                          </div>

                          <div style={{ padding:"10px 14px" }}>
                            {/* Device row */}
                            <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"3px 10px", marginBottom:10, alignItems:"center" }}>
                              <div style={{ color: MUTED, fontSize:11 }}>Device</div>
                              <div style={{ color: T.textSec, fontWeight:600, fontSize:12 }}>{deviceName}</div>
                            </div>

                            {/* Active Apps */}
                            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop:8 }}>
                              <div style={{ fontSize:10, color: MUTED, fontWeight:600,
                                textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
                                Active App
                              </div>
                              <div style={{
                                display:"flex", alignItems:"center", gap:8,
                                padding:"5px 9px", borderRadius:7,
                                background: T.elevated, border: `1px solid ${T.border}`,
                              }}>
                                {/* Icon-App */}
                                {logoSrc ? (
                                  <img src={logoSrc} alt="" style={{ width:16, height:16, objectFit:"contain", borderRadius:2, flexShrink:0 }}
                                    onError={e => { e.currentTarget.style.display = "none"; }} />
                                ) : (
                                  <span style={{ width:16, height:16, borderRadius:3, background: T.border, flexShrink:0,
                                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                                    fontSize:9, color: T.textMuted, fontWeight:700 }}>
                                    {(appName || "?").charAt(0).toUpperCase()}
                                  </span>
                                )}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:11, fontWeight:600, color: T.textPrimary, lineHeight:1.3 }}>
                                    {toTitleCase(appName)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Device History Modal */}
        {showDeviceHistoryModal && (() => {
          const MB = 1024 * 1024;
          const Y_MARKERS_MB = [100, 300, 500, 1000, 2000, 3000];
          const MAX_Y_BYTES = 3000 * MB;

          const getBwColor = (bytes) => {
            if (bytes > 400 * MB) return DANGER;
            if (bytes > 300 * MB) return WARNING;
            if (bytes > 200 * MB) return INFO;
            return MUTED;
          };
          const getBwQueueLabel = (bytes) => {
            if (bytes > 400 * MB) return "Highest Queue";
            if (bytes > 300 * MB) return "Moderate Queue";
            if (bytes > 200 * MB) return "Normal Queue";
            return "Lowest Queue";
          };

          // Aggregate 96 × 15-min slots → 24 hourly averages
          const hourlyPoints = Array.from({ length: 24 }, (_, h) => {
            const slots = deviceHistoryPoints.slice(h * 4, h * 4 + 4);
            const avgTotal = slots.reduce((s, p) => s + p.total, 0) / 4;
            const avgTx    = slots.reduce((s, p) => s + p.tx, 0) / 4;
            const avgRx    = slots.reduce((s, p) => s + p.rx, 0) / 4;
            const apps     = [...new Set(slots.flatMap(p => p.apps))];
            // Per-app average across the 4 slots
            const rawAppStats = {};
            slots.forEach(slot => {
              Object.entries(slot.appStats || {}).forEach(([app, { tx, rx }]) => {
                if (!rawAppStats[app]) rawAppStats[app] = { tx: 0, rx: 0 };
                rawAppStats[app].tx += tx;
                rawAppStats[app].rx += rx;
              });
            });
            const appStats = {};
            Object.entries(rawAppStats).forEach(([app, { tx, rx }]) => {
              appStats[app] = { avgTx: tx / 4, avgRx: rx / 4 };
            });
            return { hour: h, label: `${String(h).padStart(2,"0")}:00`, avgTotal, avgTx, avgRx, apps, appStats };
          });

          const hasData = hourlyPoints.some(p => p.avgTotal > 0);

          // SVG layout
          const GROUP_W = 40;
          const BAR_W   = 24;
          const ML_H = 68, MR_H = 20, MT_H = 24, MB_H = 46;
          const H_H = 300;
          const plotH_H = H_H - MT_H - MB_H;
          const W_H = 24 * GROUP_W + ML_H + MR_H;

          const yH      = (v) => MT_H + plotH_H - Math.min(v / MAX_Y_BYTES, 1) * plotH_H;
          const barH_fn = (v) => Math.max(0, Math.min(v / MAX_Y_BYTES, 1) * plotH_H);

          const LEGEND_ITEMS = [
            { label: "Highest Queue (>400 MB)", color: DANGER  },
            { label: "Moderate Queue (>300 MB)", color: WARNING },
            { label: "Normal Queue (>200 MB)",   color: INFO    },
            { label: "Lowest Queue (≤200 MB)",   color: MUTED   },
          ];

          return (
            <div style={{
              position:"fixed", top:0, left:0, right:0, bottom:0,
              background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center",
              justifyContent:"center", zIndex:1000
            }} onClick={(e) => { if (e.target === e.currentTarget) { setShowDeviceHistoryModal(false); setHistoryTooltip(null); } }}>
              <div style={{
                background: T.cardBg, border: `1px solid ${T.borderStrong}`,
                borderRadius:14, padding:"24px",
                maxWidth:1020, width:"95%",
                boxShadow: T.shadowHover,
                maxHeight:"92vh", overflowY:"auto"
              }}>
                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700, color: T.textPrimary }}>
                      Previous Week Usage - {historySelectedDevice?.name || "Unknown Device"}
                    </div>
                    <div style={{ fontSize:12, color: MUTED, marginTop:3 }}>
                      {historyUsedDate || (isFetchingHistory ? "Loading…" : "—")} · Hourly Average · 24 Hours
                    </div>
                  </div>
                  <button onClick={() => { setShowDeviceHistoryModal(false); setHistoryTooltip(null); }} style={{
                    padding:"6px 14px", borderRadius:6, border: `1px solid ${T.border}`,
                    background: T.elevated, color: MUTED, cursor:"pointer", fontSize:13, fontWeight:500, flexShrink:0
                  }}>
                    Close
                  </button>
                </div>

                {/* Legend */}
                <div style={{ display:"flex", gap:16, marginBottom:18, flexWrap:"wrap", padding:"10px 14px",
                  background: T.elevated, borderRadius:8, border: `1px solid ${T.border}` }}>
                  {LEGEND_ITEMS.map(item => (
                    <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                      <div style={{ width:11, height:11, borderRadius:3, background:item.color, flexShrink:0 }} />
                      <span style={{ color: T.textSec, fontWeight:500 }}>{item.label}</span>
                    </div>
                  ))}
                </div>

                {isFetchingHistory ? (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:280 }}>
                    <PropagateLoader />
                  </div>
                ) : !hasData ? (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:280, color: MUTED, fontSize:14 }}>
                    No historical data found for this device.
                  </div>
                ) : (
                  <div style={{ position:"relative" }}>
                    <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
                      <svg
                        width={W_H}
                        height={H_H}
                        style={{ display:"block", overflow:"visible" }}
                        onMouseLeave={() => setHistoryTooltip(null)}
                      >
                        {/* Y-axis fixed gridlines + labels */}
                        {Y_MARKERS_MB.map(mb => {
                          const yv = yH(mb * MB);
                          return (
                            <g key={mb}>
                              <line x1={ML_H} y1={yv} x2={W_H - MR_H} y2={yv}
                                stroke={isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}
                                strokeWidth={1} strokeDasharray={mb >= 1000 ? "4 3" : "2 4"} />
                              <text x={ML_H - 6} y={yv + 4} fontSize={10} fill={MUTED} textAnchor="end" fontWeight={500}>
                                {mb >= 1000 ? `${mb/1000}G` : `${mb}M`}
                              </text>
                            </g>
                          );
                        })}

                        {/* Hour column backgrounds (alternating subtle shade) + X-axis labels */}
                        {hourlyPoints.map(({ hour, label }) => {
                          const cx = ML_H + hour * GROUP_W;
                          return (
                            <g key={hour}>
                              {hour % 2 === 0 && (
                                <rect x={cx} y={MT_H} width={GROUP_W} height={plotH_H}
                                  fill={isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)"} />
                              )}
                              <text
                                x={cx + GROUP_W / 2}
                                y={MT_H + plotH_H + 18}
                                fontSize={9.5} fill={MUTED} textAnchor="middle"
                              >
                                {label}
                              </text>
                            </g>
                          );
                        })}

                        {/* Bars */}
                        {hourlyPoints.map(({ hour, label, avgTotal, avgTx, avgRx, apps, appStats }) => {
                          const bh   = barH_fn(avgTotal);
                          const bx   = ML_H + hour * GROUP_W + (GROUP_W - BAR_W) / 2;
                          const by   = yH(avgTotal);
                          const col  = getBwColor(avgTotal);
                          const isActive = avgTotal > 0;
                          return (
                            <g key={hour}>
                              {/* Bar shadow/glow */}
                              {isActive && (
                                <rect x={bx - 1} y={by - 1} width={BAR_W + 2} height={bh + 2}
                                  fill={col} fillOpacity={0.12} rx={4} />
                              )}
                              {/* Main bar */}
                              <rect
                                x={bx} y={by} width={BAR_W} height={bh}
                                fill={isActive ? col : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)")}
                                fillOpacity={isActive ? 0.85 : 1}
                                rx={3}
                                style={{ cursor: isActive ? "pointer" : "default", transition:"fill-opacity 0.15s" }}
                                onMouseEnter={isActive ? (e) => setHistoryTooltip({ hour, label, avgTotal, avgTx, avgRx, apps, appStats, x: e.clientX, y: e.clientY }) : undefined}
                                onMouseMove={isActive ? (e) => setHistoryTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev) : undefined}
                                onMouseLeave={isActive ? () => setHistoryTooltip(null) : undefined}
                              />
                              {/* Top highlight stripe */}
                              {isActive && bh > 6 && (
                                <rect x={bx} y={by} width={BAR_W} height={3}
                                  fill={col} fillOpacity={0.55} rx={3} />
                              )}
                            </g>
                          );
                        })}

                        {/* Axes */}
                        <line x1={ML_H} y1={MT_H} x2={ML_H} y2={MT_H + plotH_H} stroke={T.borderStrong} strokeWidth={1.5} />
                        <line x1={ML_H} y1={MT_H + plotH_H} x2={W_H - MR_H} y2={MT_H + plotH_H} stroke={T.borderStrong} strokeWidth={1.5} />

                        {/* Y-axis label */}
                        <text x={13} y={MT_H + plotH_H / 2} fontSize={10} fill={MUTED} textAnchor="middle"
                          transform={`rotate(-90, 13, ${MT_H + plotH_H / 2})`} fontWeight={600}>
                          Avg MB / hr
                        </text>

                        {/* X-axis label */}
                        <text x={ML_H + 24 * GROUP_W / 2} y={H_H - 4} fontSize={10} fill={MUTED} textAnchor="middle">
                          Hour of Day
                        </text>
                      </svg>
                    </div>

                    {/* Rich Tooltip */}
                    {historyTooltip && (() => {
                      const ttCol   = getBwColor(historyTooltip.avgTotal);
                      const ttQueue = getBwQueueLabel(historyTooltip.avgTotal);
                      const topApps = historyTooltip.apps.slice(0, 4);
                      return (
                        <div style={{
                          position:"fixed",
                          top: Math.max(8, historyTooltip.y - 220),
                          left: historyTooltip.x + 16,
                          background: T.cardBg,
                          border: `1.5px solid ${ttCol}40`,
                          borderRadius:10,
                          padding:"0",
                          fontSize:12,
                          boxShadow: `0 8px 32px rgba(0,0,0,0.22), 0 0 0 1px ${ttCol}20`,
                          zIndex:2000,
                          pointerEvents:"none",
                          minWidth:220,
                          overflow:"hidden",
                        }}>
                          {/* Coloured header band */}
                          <div style={{
                            background: `linear-gradient(135deg, ${ttCol}22, ${ttCol}0a)`,
                            borderBottom: `1px solid ${ttCol}30`,
                            padding:"10px 14px 8px 14px",
                            display:"flex", alignItems:"center", justifyContent:"space-between"
                          }}>
                            <div style={{ fontWeight:700, color: T.textPrimary, fontSize:14 }}>
                              {historyTooltip.label}
                            </div>
                            <span style={{
                              fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                              background: ttCol, color:"#fff", letterSpacing:"0.04em"
                            }}>
                              {ttQueue}
                            </span>
                          </div>

                          <div style={{ padding:"10px 14px" }}>
                            {/* Bandwidth rows */}
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 12px", marginBottom:10 }}>
                              <div style={{ color: MUTED, fontSize:11 }}>Total Bandwidth</div>
                              <div style={{ color: ttCol, fontWeight:700, fontSize:12 }}>
                                {(historyTooltip.avgTotal / MB).toFixed(1)} MB
                              </div>
                              <div style={{ color: MUTED, fontSize:11 }}>↑ Upload</div>
                              <div style={{ color: T.textSec, fontWeight:600, fontSize:12 }}>
                                {(historyTooltip.avgTx / MB).toFixed(1)} MB
                              </div>
                              <div style={{ color: MUTED, fontSize:11 }}>↓ Download</div>
                              <div style={{ color: T.textSec, fontWeight:600, fontSize:12 }}>
                                {(historyTooltip.avgRx / MB).toFixed(1)} MB
                              </div>
                            </div>

                            {/* Apps with logos + per-app bandwidth */}
                            {topApps.length > 0 && (
                              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop:8 }}>
                                <div style={{ fontSize:10, color: MUTED, fontWeight:600,
                                  textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
                                  Active Apps
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                                  {topApps.map(app => {
                                    const logoSrc = APP_LOGOS[(app || "").toLowerCase()];
                                    const appStat = (historyTooltip.appStats || {})[app];
                                    return (
                                      <div key={app} style={{
                                        display:"flex", alignItems:"center", gap:8,
                                        padding:"5px 9px", borderRadius:7,
                                        background: T.elevated, border: `1px solid ${T.border}`,
                                      }}>
                                        {/* Logo */}
                                        {logoSrc ? (
                                          <img src={logoSrc} alt="" style={{ width:16, height:16, objectFit:"contain", borderRadius:2, flexShrink:0 }}
                                            onError={e => { e.currentTarget.style.display = "none"; }} />
                                        ) : (
                                          <span style={{ width:16, height:16, borderRadius:3, background: T.border, flexShrink:0,
                                            display:"inline-flex", alignItems:"center", justifyContent:"center",
                                            fontSize:9, color: T.textMuted, fontWeight:700 }}>
                                            {(app || "?").charAt(0).toUpperCase()}
                                          </span>
                                        )}
                                        {/* Name + stats */}
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:11, fontWeight:600, color: T.textPrimary, lineHeight:1.3 }}>
                                            {toTitleCase(app)}
                                          </div>
                                          {appStat && (
                                            <div style={{ display:"flex", gap:10, marginTop:2 }}>
                                              <span style={{ fontSize:10, color: T.textSec }}>
                                                ↑ {(appStat.avgTx / MB).toFixed(1)} MB
                                              </span>
                                              <span style={{ fontSize:10, color: T.textSec }}>
                                                ↓ {(appStat.avgRx / MB).toFixed(1)} MB
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* App Config Modal */}
        <SimpleModal
          isOpen={showAppConfigModal}
          title="App Config - Protocol Tiers"
          onClose={() => { isEditingApp.current = false; setShowAppConfigModal(false); }}
          onSave={saveAppConfig}
          isSaving={isSavingConfig}
        >
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {["high", "medium", "normal", "low"].map(tier => (
              <div key={tier} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 8, textTransform: "uppercase" }}>
                  {tier === 'low' ? 'Lowest' : tier} Priority Protocols
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                  {editingProtos[tier].map(proto => (
                    <span key={proto} style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 4,
                      background: T.successBg, color: PRIMARY, display: "flex",
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
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 8 }}>
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
                    flex: 1, padding: "6px 10px", border: `1px solid ${T.border}`,
                    borderRadius: 4, fontSize: 12, fontFamily: "monospace",
                    background: T.elevated, color: T.textPrimary
                  }}
                />
                <select
                  value={newProtoTier}
                  onChange={(e) => setNewProtoTier(e.target.value)}
                  style={{
                    padding: "6px 8px", border: `1px solid ${T.border}`,
                    borderRadius: 4, fontSize: 11, background: T.elevated, color: T.textPrimary
                  }}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="normal">Normal</option>
                  <option value="low">Lowest</option>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, display: "block", marginBottom: 4, textTransform: "capitalize" }}>
                  {tier} Priority Threshold (KB/s)
                </label>
                <input
                  type="number"
                  value={editingThresholds[tier]}
                  onChange={(e) => setEditingThresholds(prev => ({ ...prev, [tier]: e.target.value }))}
                  style={{
                    width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`,
                    borderRadius: 4, fontSize: 12, fontFamily: "monospace",
                    background: T.elevated, color: T.textPrimary
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
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, display: "block", marginBottom: 4 }}>
                Shaper Rate (bps)
              </label>
              <input
                type="number"
                value={editingCapacity.shaperRate}
                onChange={(e) => setEditingCapacity(prev => ({ ...prev, shaperRate: e.target.value }))}
                style={{
                  width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`,
                  borderRadius: 4, fontSize: 12, fontFamily: "monospace",
                  background: T.elevated, color: T.textPrimary
                }}
              />
            </div>
            {[
              { key: "high", label: "Highest Queue Rate (bps)" },
              { key: "medium", label: "Moderate Queue Rate (bps)" },
              { key: "normal", label: "Normal Queue Rate (bps)" },
              { key: "low", label: "Lowest Queue Rate (bps)" }
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, display: "block", marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  type="number"
                  value={editingCapacity[key]}
                  onChange={(e) => setEditingCapacity(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`,
                    borderRadius: 4, fontSize: 12, fontFamily: "monospace",
                    background: T.elevated, color: T.textPrimary
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