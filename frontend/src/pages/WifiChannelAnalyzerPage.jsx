import React, { useState, useEffect, useRef, useMemo } from 'react';
import PropagateLoader from '../components/PropagateLoader';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, Area, AreaChart, LineChart, Line, Legend
} from "recharts";
import {
  Wifi, TrendingUp, AlertTriangle, Activity, Radio,
  Eye, BarChart2
} from "lucide-react";
import { useTheme } from '../contexts/ThemeContext';

/* ─────────────────────────────────────────────
   CONSTANTS & HELPERS
───────────────────────────────────────────── */
const POLLING_INTERVAL_MS = 60 * 1000;
const RADIUS = 10;

const channelRanges = {
  '2.4': Array.from({ length: 14 }, (_, i) => i + 1),
  '5': [
    36, 40, 44, 48, 52, 56, 60, 64,                         
    100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144,
    149, 153, 157, 161, 165                                     
  ]
};

const congestionColor = (v, T) => {
  if (!T) return v <= 30 ? "#059669" : v <= 70 ? "#d97706" : "#dc2626";
  if (v <= 30) return T.success;
  if (v <= 70) return T.warning;
  return T.danger;
};

const congestionLabel = (v) => {
  if (v <= 30) return "Low";
  if (v <= 70) return "Moderate";
  return "High";
};

/* ─────────────────────────────────────────────
   COMPONENTS
───────────────────────────────────────────── */
function ToggleSwitch({ on, onToggle }) {
  const { T } = useTheme();
  return (
    <div onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12,
      background: on ? T.success : T.elevated,
      border: `1px solid ${T.border}`,
      position: "relative", cursor: "pointer", transition: "background 0.2s",
      boxShadow: on ? `0 0 10px ${T.success}50` : 'none' }}>
      <div style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 18, height: 18,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }} />
    </div>
  );
}

function KPICard({ icon: Icon, title, value, sub, accentColor, delay = 0 }) {
  const { T } = useTheme();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{
      background: T.cardBg,
      border: `1px solid ${T.border}`,
      borderRadius: RADIUS,
      padding: "16px 18px",
      flex: 1,
      minWidth: 140,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: "opacity 0.4s ease, transform 0.4s ease, box-shadow 0.2s, border-color 0.2s",
      cursor: "default",
      boxShadow: T.shadow,
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowHover; e.currentTarget.style.borderColor = T.borderStrong; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.borderColor = T.border; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${accentColor}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={15} color={accentColor} />
        </div>
        <span style={{
          fontSize: 14, color: T.textMuted,
          letterSpacing: "0.08em", textTransform: "uppercase",
          fontFamily: "monospace", fontWeight: 700,
        }}>
          {title}
        </span>
      </div>

      <div style={{
        fontSize: 26, fontWeight: 700, color: accentColor,
        lineHeight: 1, marginBottom: 4,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: T.textMuted }}>
        {sub}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  const { T } = useTheme();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const color = congestionColor(d.congestion, T);
  return (
    <div style={{
      background: T.elevated,
      border: `1px solid ${T.borderStrong}`,
      borderRadius: 8, padding: "10px 14px",
      boxShadow: T.shadowHover,
      zIndex: 1000
    }}>
      <div style={{ color: T.textPrimary, fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
        Ch {d.channel}
      </div>
      <div style={{ color, fontSize: 18, fontWeight: 700 }}>
        {typeof d.congestion === 'number' ? d.congestion.toFixed(1) : d.congestion}%
      </div>
      <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
        {congestionLabel(d.congestion)} congestion
      </div>
      {d.aps !== undefined && d.aps > 0 && (
        <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
          {d.aps} AP{d.aps > 1 ? "s" : ""} detected
        </div>
      )}
    </div>
  );
}

function InsightsPanel({ data, band, bestChannel, predictedChannel, predictedMap }) {
  const { T } = useTheme();
  const insights = useMemo(() => {
    if (!data || !data.length) return [];
    
    // Process only channels that exist and overlap with real channels
    const validData = data.filter(d => typeof d.congestion === 'number');
    const sorted = [...validData].sort((a, b) => a.congestion - b.congestion);
    if (!sorted.length) return [];
    
    const avg = validData.reduce((s, d) => s + d.congestion, 0) / validData.length;
    const highCount = validData.filter(d => d.congestion > 70).length;
    const totalAPs = validData.reduce((s, d) => s + (d.aps || 0), 0);
    const items = [];

    // Analyze current vs predicted for current best channel
    const currentCh = bestChannel?.channel;
    const currentCong = bestChannel?.congestion;
    const predictedCongForCurrent = currentCh !== 'N/A' && predictedMap ? predictedMap[currentCh] : null;

    if (currentCh && currentCh !== 'N/A' && predictedChannel?.channel && predictedChannel.channel !== 'N/A') {
      if (currentCh === predictedChannel.channel) {
        items.push({ 
          type: "success", 
          icon: "✓", 
          text: `Ch ${currentCh} is highly stable. Current: ${currentCong.toFixed(1)}%, Predicted: ${predictedCongForCurrent !== null ? predictedCongForCurrent.toFixed(1) + '%' : 'N/A'} — no shift recommended.` 
        });
      } else {
        const predBestCong = predictedChannel.congestion;
        const diff = predictedCongForCurrent !== null ? (predictedCongForCurrent - predBestCong) : 0;
        
        if (predictedCongForCurrent !== null && diff > 5) {
          items.push({ 
            type: "warn", 
            icon: "~", 
            text: `Channel shift expected: Ch ${currentCh} currently ${currentCong.toFixed(1)}%, but predicted to reach ${predictedCongForCurrent.toFixed(1)}%. Recommend switching to Ch ${predictedChannel.channel} (${predBestCong.toFixed(1)}%).` 
          });
        } else {
          items.push({ 
            type: "info", 
            icon: "↗", 
            text: `Maintaining Ch ${currentCh}. While Ch ${predictedChannel.channel} is predicted slightly cleaner, the current channel remains optimal for now.` 
          });
        }
      }
    }

    // Band Trend Analysis
    if (predictedMap && Object.keys(predictedMap).length > 0) {
      const predValues = Object.values(predictedMap);
      const predAvg = predValues.reduce((s, v) => s + v, 0) / predValues.length;
      const trend = predAvg - avg;
      if (Math.abs(trend) > 5) {
        items.push({
          type: trend > 0 ? "warn" : "success",
          icon: trend > 0 ? "↗" : "↘",
          text: `Band traffic is trending ${trend > 0 ? 'up' : 'down'} by ${Math.abs(trend).toFixed(1)}% for the next cycle.`
        });
      }
    }

    // Crowdedness / Non-WiFi Interference
    const interferenceCount = validData.filter(d => d.congestion > 40 && d.aps === 0).length;
    if (interferenceCount > 2) {
      items.push({ type: "warn", icon: "!", text: `Detected ${interferenceCount} channels with high noise but 0 APs — possible non-WiFi interference nearby.` });
    } else if (totalAPs > 15) {
      items.push({ type: "info", icon: "i", text: `High AP density detected (${totalAPs} total APs) — spectrum is moderately crowded.` });
    }

    if (highCount > 0) {
      items.push({ type: "danger", icon: "!", text: `${highCount} channel${highCount > 1 ? "s" : ""} above 70% congestion — avoid for deployment` });
    }

    if (avg < 20) {
      items.push({ type: "success", icon: "✓", text: `Average congestion is low (${avg.toFixed(1)}%) — band is generally healthy` });
    } else if (avg > 50) {
      items.push({ type: "warn", icon: "~", text: `High average congestion (${avg.toFixed(1)}%) — network is under stress` });
    } else {
      items.push({ type: "info", icon: "i", text: `Moderate average congestion (${avg.toFixed(1)}%) — monitor trending channels` });
    }

    const topLow = sorted.slice(0, 3).map(d => `Ch ${d.channel}`).join(", ");
    const zeroAPChannels = validData.filter(d => d.aps === 0).length;
    if (zeroAPChannels > validData.length / 2) {
      items.push({ type: "success", icon: "✓", text: `Most of the channels are completely free (${zeroAPChannels} channels with 0 APs).` });
    } else {
      items.push({ type: "info", icon: "i", text: `Cleanest options: ${topLow} — ideal for new connections` });
    }

    return items;
  }, [data, bestChannel, predictedChannel, predictedMap]);

  const typeStyle = {
    success: { color: T.success, bg: T.successBg, border: `${T.success}30` },
    warn:    { color: T.warning, bg: T.warningBg, border: `${T.warning}30` },
    danger:  { color: T.danger,  bg: T.dangerBg,  border: `${T.danger}30` },
    info:    { color: T.info,    bg: T.infoBg,    border: `${T.info}30` },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {insights.map((ins, i) => {
        const s = typeStyle[ins.type];
        return (
          <div key={i} style={{
            background: s.bg,
            border: `1px solid ${s.border}`,
            borderRadius: 8, padding: "9px 12px",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{
              color: s.color, fontFamily: "monospace", fontSize: 13,
              fontWeight: 700, flexShrink: 0, width: 16, textAlign: "center",
            }}>{ins.icon}</span>
            <span style={{ color: T.textSec, fontSize: 12, lineHeight: 1.5 }}>
              {ins.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TopChannels({ data }) {
  const { T } = useTheme();
  const top5 = useMemo(() => {
    if (!data || !data.length) return [];
    return [...data].filter(d => typeof d.congestion === 'number').sort((a, b) => a.congestion - b.congestion).slice(0, 5);
  }, [data]);

  const zeroAPCount = useMemo(() => {
    if (!data || !data.length) return 0;
    return data.filter(d => d.aps === 0).length;
  }, [data]);

  if (!top5.length) return null;

  if (zeroAPCount > (data?.length || 0) / 2) {
    return (
      <div style={{
        padding: "20px 16px",
        background: T.successBg,
        borderRadius: "12px",
        border: `1px dashed ${T.success}40`,
        textAlign: "center",
        color: T.textMuted,
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: "1.5"
      }}>
        Most of the channels are completely free.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {top5.map((d, i) => {
        const color = congestionColor(d.congestion, T);
        return (
          <div key={d.channel} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 11, color: T.textMuted,
              fontFamily: "monospace", width: 18, textAlign: "center", flexShrink: 0,
            }}>#{i + 1}</span>
            <span style={{
              fontSize: 12, color: T.textPrimary, fontFamily: "monospace",
              width: 60, flexShrink: 0, fontWeight: 600,
            }}>Ch {d.channel}</span>
            <div style={{
              flex: 1, height: 5, background: T.elevated,
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${d.congestion}%`,
                background: color, borderRadius: 3,
                transition: "width 0.4s ease",
              }} />
            </div>
            <span style={{
              fontSize: 12, color, fontFamily: "monospace",
              width: 45, textAlign: "right", flexShrink: 0, fontWeight: 600,
            }}>{d.congestion.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function SignalMeter({ value }) {
  const { T } = useTheme();
  const bars = 5;
  const filled = Math.round((value / 100) * bars);
  const color = congestionColor(value, T);
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} style={{
          width: 4,
          height: 5 + i * 3,
          borderRadius: 2,
          background: i < filled ? color : T.elevated,
          transition: "background 0.3s",
        }} />
      ))}
    </div>
  );
}



/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function WifiChannelAnalyzerPage() {
  const { T } = useTheme();
  const DS = {
    primary:    T.success,
    danger:     T.danger,
    warning:    T.warning,
    info:       T.info,
    textMuted:  T.textMuted,
    bg:         T.bg,
    cardBg:     T.cardBg,
    cardBorder: T.border,
    radius:     RADIUS,
  };
  const [band, setBand] = useState('2.4');
  const [analyzerEnabled, setAnalyzerEnabled] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [data, setData] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [timestamp, setTimestamp] = useState(new Date());
  const [chartView, setChartView] = useState("bar");
  
  const [bestChannelInfo, setBestChannelInfo] = useState({ channel: 'N/A', congestion: 0 });
  const [predictedChannelInfo, setPredictedChannelInfo] = useState({ channel: 'N/A', congestion: 0 });
  const [predictedMap, setPredictedMap] = useState({});
  
  const lastFetchRef = useRef(new Date());
  const lastTimestampRef = useRef(null);

  const API_BASE = `/api`;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const statsRes = await fetch(`${API_BASE}/wifi-channel-analyzer/status`);
        const statusTxt = await statsRes.text();
        setAnalyzerEnabled(statusTxt.includes('1') || statusTxt.includes('true'));
      } catch (err) {
        console.error('Failed to fetch status:', err);
      }
    };
    fetchStatus();
  }, []);

  const handleToggle = async () => {
    const newState = !analyzerEnabled;
    if (newState) setIsLoading(true);
    setAnalyzerEnabled(newState);
    try {
      await fetch(`${API_BASE}/wifi-channel-analyzer/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: newState })
      });
    } catch(err) {
      console.error(err);
    }
  };

  // Helper for resilient JSON fetch
  const fetchDataWithRetry = async (url, retries = 2, delay = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Accept': 'application/json, text/plain, */*'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        if (response.status === 204) return null;
        
        const text = await response.text();
        if (!text.trim()) return null;
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          // JSON repair logic as before
          let fixedText = text
            .replace(/^\uFEFF/, '')
            .replace(/^[^\{].*?\{/, '{')
            .replace(/\}[^\}]*$/, '}')
            .replace(/,\s*}(?!\s*[,}])/g, '}')
            .replace(/,\s*](?!\s*[,}])/g, ']')
            .replace(/}\s*,\s*(?!\s*[{\[])/g, '}')
            .replace(/]\s*,\s*(?!\s*[{\[])/g, ']')
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/([{\[]\s*),/g, '$1')
            .replace(/\s*}\s*,\s*(?!\s*[{\[])/g, '}')
            .replace(/\s*]\s*,\s*(?!\s*[{\[])/g, ']')
            .replace(/}(\s*{)/g, '},$1')
            .replace(/](\s*\[)/g, '],$1')
            .replace(/,\s*$/, '');
          
          try {
            data = JSON.parse(fixedText);
          } catch (secondError) {
            try {
              const entries = fixedText.match(/"entries"\s*:\s*\[(.*?)\]/s);
              if (entries) {
                const entriesContent = entries[1];
                const objects = entriesContent.split(/},\s*{/);
                if (objects.length > 1) {
                  const completeObjects = objects.slice(0, -1);
                  const reconstructed = `{"entries":[{${completeObjects.join('},{')}}}]}`;
                  data = JSON.parse(reconstructed);
                } else throw new Error('Unable to reconstruct JSON');
              } else throw new Error('Unable to find entries structure');
            } catch (finalError) {
              if (i === retries - 1) throw new Error(`Unable to parse JSON: ${finalError.message}`);
              throw finalError;
            }
          }
        }
        if (!data || typeof data !== 'object') throw new Error('Invalid JSON structure');
        return data;
      } catch (error) {
        if (i === retries - 1) throw error;
        const backoffDelay = delay * Math.pow(2, i) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    return null;
  };

  const parseCongestionData = (congestionReport, b) => {
    if (!congestionReport || typeof congestionReport !== 'object') return new Map();
    const bandKey = `${b} GHZ`;
    const channels = Array.isArray(congestionReport[bandKey]) ? congestionReport[bandKey] : [];
    
    const dataMap = new Map();
    channels.forEach(entry => {
      if (typeof entry !== 'string') return;
      const match = entry.match(/Channel\s+(\d+):\s*congestion\s*([\d.]+)%(?:\s*\((\d+)\s*APs\))?/i);
      if (match) {
        const channel = parseInt(match[1], 10);
        const congestion = parseFloat(match[2]);
        const aps = match[3] ? parseInt(match[3], 10) : 0;
        if (!isNaN(channel) && !isNaN(congestion) && channel > 0 && congestion >= 0 && congestion <= 100) {
          dataMap.set(channel, { channel, congestion, aps });
        }
      }
    });
    return dataMap;
  };

  const updateDashboard = async () => {
    if (!band || !analyzerEnabled) return;
    setIsLoading(true);
    setError(null);

    try {
      const [congestionRes, bestChannelRes, predictedRes] = await Promise.allSettled([
        fetchDataWithRetry('/api/channel_analyzer_logs/congestion_log.json'),
        fetchDataWithRetry('/api/channel_analyzer_logs/best_channel.json'),
        fetchDataWithRetry('/api/channel_analyzer_logs/predicted_log.json')
      ]);

      let congestionData = congestionRes.status === 'fulfilled' ? congestionRes.value : null;
      let bestChannelData = bestChannelRes.status === 'fulfilled' ? bestChannelRes.value : { entries: [] };
      let predictedData = predictedRes.status === 'fulfilled' ? predictedRes.value : [];

      if (!congestionData?.entries?.length) {
        throw new Error('Invalid or empty congestion data structure from gateway');
      }

      let relevantEntry = null;
      const bandKey = `${band} GHZ`;
      for (let i = congestionData.entries.length - 1; i >= 0; i--) {
        const entry = congestionData.entries[i];
        if (entry && entry['congestion-report'] && entry['congestion-report'][bandKey]?.length > 0) {
           relevantEntry = entry;
          break;
        }
      }

      if (relevantEntry) {
        const entryTimestamp = relevantEntry.timestamp;
        const isValidTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(entryTimestamp);
        
        if (isValidTimestamp && (entryTimestamp !== lastTimestampRef.current || !lastTimestampRef.current)) {
          lastTimestampRef.current = entryTimestamp;
          
          // Chart Data
          const congestionMap = parseCongestionData(relevantEntry['congestion-report'], band);
          const labels = channelRanges[band];
          
          const newData = labels.map(channel => {
            const val = congestionMap.get(channel);
            if (val) return val;
            return { channel, congestion: 0, aps: 0 };
          });
          setData(newData);

          // Info Panel
          setTimestamp(new Date(entryTimestamp.replace(" ", "T")));
          lastFetchRef.current = new Date();

          // Real Time Best
          let b = { channel: 'N/A', congestion: 0 };
          const bestChannelObj = bestChannelData.best_channels || {};
          const info = bestChannelObj[`${band}GHz`];
          if (info) {
            b = { channel: info.channel, congestion: info.congestion || 0 };
          } else {
             // fallback backward compatibility
            const bCInfo = (bestChannelData.entries || []).find(e => e.timestamp === entryTimestamp);
            if (bCInfo?.best_channels?.[`${band}GHz`]) {
               b = bCInfo.best_channels[`${band}GHz`];
            }
          }
          setBestChannelInfo(b);

          // Predicted Best
          let p = { channel: 'N/A', congestion: 0 };
          let pMap = {};
          const predictedArray = Array.isArray(predictedData) ? predictedData : (predictedData?.entries || []);
          if (predictedData && !Array.isArray(predictedData) && typeof predictedData === 'object' && !predictedData.entries) {
             // Object format
             if (predictedData.channels) {
               pMap = predictedData.channels;
               const validChannels = channelRanges[band].map(String);
               let minCong = Infinity;
               let bCh = null;
               for (const [ch, cong] of Object.entries(predictedData.channels)) {
                 if (validChannels.includes(ch) && cong < minCong) {
                   minCong = cong;
                   bCh = ch;
                 }
               }
               if (bCh) p = { channel: parseInt(bCh, 10), congestion: minCong };
             }
          } else {
            if (predictedArray.length > 0) {
              const currentMs = new Date(entryTimestamp.replace(' ','T')).getTime();
              let closestEntry = null;
              let minDiff = Infinity;
              for (const pr of predictedArray) {
                const diff = new Date(pr.timestamp.replace(' ','T')).getTime() - currentMs;
                if (diff > 0 && diff < minDiff) {
                  minDiff = diff;
                  closestEntry = pr;
                }
              }
              if (closestEntry?.channels) {
                pMap = closestEntry.channels;
                const validChannels = channelRanges[band].map(String);
                let bCh = null;
                let minCong = Infinity;
                for (const [ch, cong] of Object.entries(closestEntry.channels)) {
                  if (validChannels.includes(ch) && cong < minCong) {
                    minCong = cong;
                    bCh = ch;
                  }
                }
                if (bCh) p = { channel: parseInt(bCh,10), congestion: minCong };
              } else if (closestEntry?.best_channels?.[`${band}GHz`]) {
                 p = closestEntry.best_channels[`${band}GHz`];
                 // best_channels format often doesn't have the full map, but we'll try to find it
                 if (closestEntry.channels) pMap = closestEntry.channels;
              }
            }
          }
          setPredictedChannelInfo(p);
          setPredictedMap(pMap);

          // Historical Timeline Data Generate
          const newTimeline = [];
          const currentMs = new Date(entryTimestamp.replace(" ", "T")).getTime();
          const fourHoursMs = 4 * 60 * 60 * 1000;
          const bestHistory = Array.isArray(bestChannelData?.entries) ? bestChannelData.entries : [];
          const predHistory = Array.isArray(predictedArray) ? predictedArray : [];
          
          for (const entry of congestionData.entries) {
            const timeMs = new Date(entry.timestamp.replace(" ", "T")).getTime();
            if (timeMs > currentMs) continue;
            if (currentMs - timeMs <= fourHoursMs) {
              const report = entry['congestion-report'];
              if (report && report[bandKey] && report[bandKey].length > 0) {
                const pData = parseCongestionData(report, band);
                let sum = 0, count = 0;
                for (const d of pData.values()) {
                  sum += d.congestion;
                  count++;
                }
                const avg = count > 0 ? sum / count : 0;

                let bestC = null;
                let bestCh = null;
                const bMatch = bestHistory.find(sb => sb.timestamp === entry.timestamp);
                if (bMatch && bMatch.best_channels && bMatch.best_channels[`${band}GHz`]) {
                  bestC = bMatch.best_channels[`${band}GHz`].congestion;
                  bestCh = bMatch.best_channels[`${band}GHz`].channel;
                }

                let predC = null;
                let predCh = null;
                const pMatch = predHistory.find(sp => sp.timestamp === entry.timestamp);
                if (pMatch && pMatch.channels) {
                  const validChannels = channelRanges[band].map(String);
                  let minP = Infinity;
                  for (const [ch, cong] of Object.entries(pMatch.channels)) {
                     if (validChannels.includes(ch) && cong < minP) {
                       minP = cong;
                       predCh = ch;
                     }
                  }
                  if (minP !== Infinity) predC = minP;
                } else if (pMatch?.best_channels?.[`${band}GHz`]) {
                  predC = pMatch.best_channels[`${band}GHz`].congestion;
                  predCh = pMatch.best_channels[`${band}GHz`].channel;
                }

                newTimeline.push({
                  timeRaw: timeMs,
                  best: bestC !== null ? parseFloat(bestC.toFixed(1)) : null,
                  pred: predC !== null ? parseFloat(predC.toFixed(1)) : null,
                  bestCh: bestCh,
                  predCh: predCh
                });
              }
            }
          }
          setTimelineData(newTimeline);
        }
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };



  useEffect(() => {
    updateDashboard();
    const interval = setInterval(updateDashboard, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [band, analyzerEnabled]);

  const kpis = useMemo(() => {
    if (!data.length) return null;
    const valid = data.filter(d => typeof d.congestion === 'number');
    if (!valid.length) return null;
    
    // The actual worst based on array
    const sorted = [...valid].sort((a, b) => a.congestion - b.congestion);
    const worst = sorted[sorted.length - 1];
    const avg = valid.reduce((s, d) => s + d.congestion, 0) / valid.length;
    
    return {
      best: bestChannelInfo,
      worst,
      predicted: predictedChannelInfo,
      avg
    };
  }, [data, bestChannelInfo, predictedChannelInfo]);



  return (
    <>
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        background: T.bg,
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: T.textPrimary,
      }}>
        {/* HEADER */}
        <div style={{ background: T.cardBg, borderBottom: `1px solid ${T.border}`, padding: "13px 24px", margin: "18px 20px 0px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: T.successBg,
              border: `1px solid ${T.success}30`,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Wifi size={18} color={DS.primary} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.textPrimary }}>Smart Wi-Fi Channel Allocator</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", background: T.elevated,
              border: `1px solid ${T.border}`, borderRadius: 8, padding: 3, gap: 3,
            }}>
              {["2.4", "5"].map(b => (
                <button key={b} onClick={() => {
                  if (band !== b) {
                    setBand(b);
                    setData([]);
                    setIsLoading(true);
                    setTimestamp(new Date());
                    lastTimestampRef.current = null;
                  }
                }} style={{
                  padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: band === b ? T.cardBg : "transparent",
                  color: band === b ? DS.primary : DS.textMuted,
                  fontSize: 12, fontFamily: "monospace", fontWeight: 700,
                  transition: "all 0.2s",
                  boxShadow: band === b ? T.shadow : "none",
                }}>
                  {b} GHz
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {analyzerEnabled === null ? (
                <span style={{ fontSize: 13, fontWeight: 500, color: DS.textMuted }}>Fetching Status..</span>
              ) : (
                <>
                  <span style={{ fontSize: 13, fontWeight: 500, color: analyzerEnabled ? DS.primary : DS.textMuted }}>
                    {analyzerEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <ToggleSwitch on={analyzerEnabled} onToggle={handleToggle} />
                </>
              )}
            </div>
          </div>
        </div>

        {analyzerEnabled === null || (analyzerEnabled && isLoading && !data.length) ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "calc(100vh - 80px)" }}>
            <PropagateLoader label="Loading..." />
          </div>
        ) : !analyzerEnabled ? (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "calc(100vh - 80px)", color: DS.textMuted }}>
            <Wifi size={48} color={T.border} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: T.textSec }}>WiFi Analyzer Disabled</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Enable the service to view real-time channel congestion.</div>
          </div>
        ) : (
          <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {error && (
            <div style={{
              background: T.dangerBg,
              border: `1px solid ${T.danger}30`,
              borderRadius: RADIUS, padding: "10px 14px",
              color: T.danger, fontSize: 13,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* KPI CARDS */}
          {kpis && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KPICard
                icon={Activity}
                title="Real Time Best Channel"
                value={kpis.best.channel !== 'N/A' ? `Ch ${kpis.best.channel}` : 'N/A'}
                sub={kpis.best.channel !== 'N/A' ? `${kpis.best.congestion.toFixed(1)}% congestion · ${congestionLabel(kpis.best.congestion)}` : 'N/A'}
                accentColor={DS.primary}
                delay={0}
              />
              <KPICard
                icon={TrendingUp}
                title="Predicted Best Channel"
                value={kpis.predicted.channel !== 'N/A' ? `Ch ${kpis.predicted.channel}` : 'N/A'}
                sub={kpis.predicted.channel !== 'N/A' ? `${kpis.predicted.congestion.toFixed(1)}% expected next cycle` : 'N/A'}
                accentColor={DS.info}
                delay={80}
              />
              <KPICard
                icon={Radio}
                title="Avg Congestion"
                value={`${kpis.avg.toFixed(1)}%`}
                sub={`Across all ${band} GHz channels`}
                accentColor={congestionColor(kpis.avg)}
                delay={160}
              />
              <KPICard
                icon={AlertTriangle}
                title="Most Congested"
                value={`Ch ${kpis.worst?.channel || 'N/A'}`}
                sub={kpis.worst ? `${kpis.worst.congestion.toFixed(1)}% · ${kpis.worst.aps} AP${kpis.worst.aps !== 1 ? "s" : ""}` : 'N/A'}
                accentColor={DS.danger}
                delay={240}
              />
            </div>
          )}

          {/* MAIN CONTENT AREA */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12 }}>
            <div style={{
              background: T.cardBg,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS, padding: "18px",
              boxShadow: T.shadow,
              transition: "box-shadow 0.2s",
              minHeight: 320,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = T.shadowHover}
              onMouseLeave={e => e.currentTarget.style.boxShadow = T.shadow}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 700 }}>
                    Channel Utilization — {band} GHz
                  </div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                    Real-time congestion across {data.length} channels
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["bar", "area"].map(v => (
                    <button key={v} onClick={() => setChartView(v)} style={{
                      padding: "5px 10px", borderRadius: 6,
                      background: chartView === v ? T.successBg : T.elevated,
                      border: `1px solid ${chartView === v ? T.success + "40" : T.border}`,
                      color: chartView === v ? T.success : T.textMuted,
                      fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                      transition: "all 0.2s", textTransform: "uppercase", letterSpacing: "0.05em",
                      fontWeight: 600,
                    }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                {[
                  { label: "Low (<30%)",  color: DS.primary },
                  { label: "Moderate",    color: DS.warning },
                  { label: "High (>70%)", color: DS.danger },
                ].map(m => (
                  <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: m.color }} />
                    <span style={{ fontSize: 11, color: DS.textMuted }}>{m.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ height: 260, opacity: isLoading && !data.length ? 0.4 : 1, transition: "opacity 0.3s" }}>
                {data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === "bar" ? (
                      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="15%">
                        <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="channel"
                          tick={{ fill: T.textMuted, fontSize: band === "5" ? 9 : 11, fontFamily: "monospace" }}
                          axisLine={false} tickLine={false}
                          interval={band === "5" ? 1 : 0}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: T.textMuted, fontSize: 10, fontFamily: "monospace" }}
                          axisLine={false} tickLine={false}
                          tickFormatter={v => `${v}%`}
                        />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: T.elevated }} />
                        <Bar dataKey="congestion" radius={[4, 4, 0, 0]} maxBarSize={band === "5" ? 18 : 28}>
                          {data.map((entry) => (
                            <Cell key={entry.channel} fill={congestionColor(entry.congestion)} />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={DS.primary} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={DS.primary} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="channel"
                          tick={{ fill: T.textMuted, fontSize: band === "5" ? 9 : 11, fontFamily: "monospace" }}
                          axisLine={false} tickLine={false}
                          interval={band === "5" ? 1 : 0}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: T.textMuted, fontSize: 10, fontFamily: "monospace" }}
                          axisLine={false} tickLine={false}
                          tickFormatter={v => `${v}%`}
                        />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: `${T.success}50`, strokeWidth: 1 }} />
                        <Area
                          type="monotone" dataKey="congestion"
                          stroke={DS.primary} strokeWidth={2}
                          fill="url(#areaGrad)"
                          dot={{ fill: DS.primary, r: 2, strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: DS.primary }}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isLoading && <PropagateLoader />}
                  </div>
                )}
              </div>

              {timelineData.length > 0 && (() => {
                const hourTicks = [];
                if (timelineData.length > 0) {
                  const minTime = Math.min(...timelineData.map(d => d.timeRaw));
                  const maxTime = Math.max(...timelineData.map(d => d.timeRaw));
                  const dList = new Date(minTime);
                  dList.setMinutes(0, 0, 0);
                  let currentTick = dList.getTime();
                  while (currentTick <= maxTime) {
                    if (currentTick >= minTime) hourTicks.push(currentTick);
                    currentTick += 60 * 60 * 1000;
                  }
                }
                return (
                <div style={{ flex: 1, minHeight: 180, marginTop: 24, paddingTop: 16, borderTop: `1px dashed ${T.border}` }}>
                  <div style={{ fontSize: 13, color: T.textPrimary, fontWeight: 700, marginBottom: 12 }}>
                    4-Hour Historical Trend
                  </div>
                  <ResponsiveContainer width="100%" height="80%">
                    <LineChart data={timelineData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="timeRaw"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        ticks={hourTicks}
                        tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        tick={{ fill: T.textMuted, fontSize: 10, fontFamily: "monospace" }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fill: T.textMuted, fontSize: 10, fontFamily: "monospace" }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => `${v}%`}
                      />
                      <RechartsTooltip
                        labelFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        formatter={(value, name, props) => {
                          if (name === "Real Time Channel" && props.payload.bestCh) return [`Ch ${props.payload.bestCh}, ${value}%`, name];
                          if (name === "Predicted Channel" && props.payload.predCh) return [`Ch ${props.payload.predCh}, ${value}%`, name];
                          return [`${value}%`, name];
                        }}
                        contentStyle={{ borderRadius: 8, border: `1px solid ${T.borderStrong}`, background: T.elevated, color: T.textPrimary, boxShadow: T.shadowHover, fontSize: 12 }}
                        labelStyle={{ color: T.textMuted }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontFamily: "monospace", color: T.textMuted }} />
                      <Line type="monotone" name="Real Time Channel" dataKey="best" stroke={T.success} strokeWidth={2} dot={false} />
                      <Line type="monotone" name="Predicted Channel" dataKey="pred" stroke={T.info} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )})()}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: RADIUS, padding: "16px",
                boxShadow: T.shadow,
                flex: 1,
                transition: "box-shadow 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = T.shadowHover}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.shadow}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Eye size={13} color={T.info} />
                  <span style={{
                    fontSize: 11, color: T.textMuted,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    fontFamily: "monospace", fontWeight: 600,
                  }}>
                    Network Insights
                  </span>
                </div>
                {kpis && (
                  <InsightsPanel
                    data={data}
                    band={band}
                    bestChannel={kpis.best}
                    predictedChannel={kpis.predicted}
                    predictedMap={predictedMap}
                  />
                )}
              </div>

              <div style={{
                background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: RADIUS, padding: "16px",
                boxShadow: T.shadow,
                transition: "box-shadow 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = T.shadowHover}
                onMouseLeave={e => e.currentTarget.style.boxShadow = T.shadow}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <BarChart2 size={13} color={T.success} />
                  <span style={{
                    fontSize: 11, color: T.textMuted,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    fontFamily: "monospace", fontWeight: 600,
                  }}>
                    Top 5 Cleanest Channels
                  </span>
                </div>
                <TopChannels data={data} />
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div style={{
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: RADIUS, padding: "10px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              {kpis && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "monospace" }}>REAL TIME CH</span>
                    <span style={{ fontSize: 12, color: T.success, fontWeight: 700, fontFamily: "monospace" }}>
                      {kpis.best?.channel !== 'N/A' ? kpis.best.channel : 'N/A'}
                    </span>
                    {kpis.best?.channel !== 'N/A' && <SignalMeter value={100 - kpis.best.congestion} />}
                  </div>
                  <div style={{ width: 1, height: 16, background: T.border }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "monospace" }}>PREDICTED CH</span>
                    <span style={{ fontSize: 12, color: T.info, fontWeight: 700, fontFamily: "monospace" }}>
                      {kpis.predicted?.channel !== 'N/A' ? kpis.predicted.channel : 'N/A'}
                    </span>
                  </div>
                  <div style={{ width: 1, height: 16, background: T.border }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "monospace" }}>AVG CONG</span>
                    <span style={{ fontSize: 12, color: congestionColor(kpis.avg, T), fontWeight: 700, fontFamily: "monospace" }}>
                      {kpis.avg?.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "monospace" }}>LATEST FETCH : </span>
              <span style={{ fontSize: 13, color: T.textSec, fontFamily: "monospace" }}>
                {timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' AM', ' A.M').replace(' PM', ' P.M')}
              </span>
            </div>
          </div>
          </div>
        )}
      </div>
    </>
  );
}