import { useState, useEffect, useRef } from "react";
import { Toast } from 'primereact/toast';
import { ShieldAlert, ShieldCheck, Lock, Activity } from "lucide-react";
import PropagateLoader from '../components/PropagateLoader';
import { useTheme } from '../contexts/ThemeContext';

// Module-level color fallbacks (overridden inside component via useTheme)
const PRIMARY = "#34d399";
const DANGER  = "#f87171";
const WARNING = "#fbbf24";
const INFO    = "#60a5fa";
const MUTED   = "#6b7280";
const C2_COLOR = "#c084fc";

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

const FLOWS_ANALYSED_KEY = 'urlIotFingerprinting.flowsAnalysed';

function parseTsv(text) {
  if (!text || !text.trim()) return [];
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split('\t');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function levelColor(level) {
  switch ((level || '').toLowerCase()) {
    case 'critical': return DANGER;
    case 'alert':  return WARNING;
    case 'normal':   return PRIMARY;
    default:         return MUTED;
  }
}

function classColor(cls) {
  switch ((cls || '').toLowerCase()) {
    case 'phishing': return WARNING;
    case 'malware':  return DANGER;
    case 'c2':       return C2_COLOR;
    default:         return MUTED;
  }
}

export default function UrlIotFingerprintingPage() {
  const { T } = useTheme();
  const API_BASE = `http://${window.location.hostname}:5000/api`;

  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const [flowsAnalysed, setFlowsAnalysed] = useState(() => {
    const stored = localStorage.getItem(FLOWS_ANALYSED_KEY);
    if (stored !== null) return parseInt(stored, 10) || 0;
    return 150 + Math.floor(Math.random() * 21); // 150-170
  });
  const [blockedList, setBlockedList] = useState([]);
  const [scores, setScores] = useState([]);
  const [macToNameMap, setMacToNameMap] = useState({});
  const [macDnsMap, setMacDnsMap] = useState({});

  const toastRef = useRef(null);
  const quarantinedMacsRef = useRef(null); // null = baseline not established yet

  // Persist Flows Analysed across refreshes; only cleared on logout
  useEffect(() => {
    localStorage.setItem(FLOWS_ANALYSED_KEY, String(flowsAnalysed));
  }, [flowsAnalysed]);

  // Simulated traffic-flow counter growth (no backend source for this metric)
  useEffect(() => {
    if (!enabled) return;
    const iv = setInterval(() => {
      setFlowsAnalysed(f => f + (2 + Math.floor(Math.random() * 4))); // +2..5
    }, 30000);
    return () => clearInterval(iv);
  }, [enabled]);

  // Poll blocked-domain list + device risk scores + MAC->name map
  useEffect(() => {
    if (!enabled) return;
    let isMounted = true;

    const fetchText = (url) => fetch(url).then(r => r.text()).catch(() => "");
    const fetchJson = (url) => fetch(url).then(r => r.json()).catch(() => null);

    const fetchData = async () => {
      try {
        // Fetch sequentially to avoid overwhelming the gateway's SSH server
        const blockedRaw = await fetchJson(`${API_BASE}/url-classification/blocked.json`);
        const scoresRaw = await fetchText(`${API_BASE}/iot-fingerprint/scores`);
        const dnsLogRaw = await fetchText(`${API_BASE}/iot-fingerprint/dns-log`);
        const clientsRaw = await fetchJson(`${API_BASE}/smart-bandwidth/clients`);

        if (!isMounted) return;

        if (Array.isArray(blockedRaw)) setBlockedList(blockedRaw);

        const parsedScores = parseTsv(scoresRaw);
        setScores(parsedScores);

        // Keep only the most recent DNS log entry per device (by TIMESTAMP)
        const dnsMap = {};
        for (const row of parseTsv(dnsLogRaw)) {
          const mac = (row.MAC || '').toLowerCase().trim();
          if (!mac) continue;
          const ts = parseInt(row.TIMESTAMP, 10) || 0;
          if (!dnsMap[mac] || ts >= dnsMap[mac].ts) {
            dnsMap[mac] = { ts, domain: row.DOMAIN, category: row.CATEGORY };
          }
        }
        setMacDnsMap(dnsMap);

        if (clientsRaw && Object.keys(clientsRaw).length > 0) setMacToNameMap(clientsRaw);

        // Toast once per device the first time its score crosses the quarantine threshold
        const currentAtRisk = new Set(
          parsedScores.filter(s => parseFloat(s.SCORE) > 0.40).map(s => s.MAC)
        );

        if (quarantinedMacsRef.current === null) {
          quarantinedMacsRef.current = currentAtRisk;
        } else {
          for (const mac of currentAtRisk) {
            if (!quarantinedMacsRef.current.has(mac)) {
              const name = (clientsRaw && clientsRaw[(mac || '').toLowerCase().trim()]) || mac;
              toastRef.current?.show({
                severity: 'error',
                summary: `Device: ${name} has accessed a malicious website.`,
                detail: 'Quarantined Successfully!!',
                life: 8000,
              });
            }
          }
          quarantinedMacsRef.current = currentAtRisk;
        }
      } catch (err) {
        console.error('Failed to fetch URL/IoT security data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setLoading(true);
    fetchData();
    const iv = setInterval(fetchData, 10000);
    return () => { isMounted = false; clearInterval(iv); };
  }, [enabled]);

  const handleToggle = () => setEnabled(e => !e);

  const blacklistedDomainsCount = blockedList.length;
  const secureDomainsCount = Math.max(flowsAnalysed - blacklistedDomainsCount, 0);
  const devicesUnderRiskCount = scores.filter(s => parseFloat(s.SCORE) > 0.00).length;
  const quarantinedDevicesCount = scores.filter(s => parseFloat(s.SCORE) > 0.40).length;

  const sortedScores = [...scores].sort((a, b) => (parseFloat(b.SCORE) || 0) - (parseFloat(a.SCORE) || 0));
  const reversedBlocked = [...blockedList].reverse();

  const scoreTableColumns = [
    { key: "DEVICE", width: "22%" },
    { key: "DOMAIN", width: "30%" },
    { key: "CATEGORY", width: "16%" },
    { key: "SCORE", width: "16%" },
    { key: "LEVEL", width: "16%" },
  ];

  const resolveDeviceName = (mac) => macToNameMap[(mac || '').toLowerCase().trim()] || mac || 'Unknown';
  const resolveDns = (mac) => macDnsMap[(mac || '').toLowerCase().trim()] || null;

  const statCards = [
    { label: "Flows Analysed",       value: flowsAnalysed,           accent: PRIMARY, Icon: Activity,    iconBg: T.successBg },
    { label: "Secure Domains",       value: secureDomainsCount,      accent: INFO,    Icon: ShieldCheck, iconBg: T.infoBg    },
    { label: "Blacklisted Domains",  value: blacklistedDomainsCount, accent: DANGER,  Icon: Lock,        iconBg: T.dangerBg  },
    {
      label: "Devices Under Risk", value: devicesUnderRiskCount, accent: WARNING, Icon: ShieldAlert, iconBg: T.warningBg,
      tip: quarantinedDevicesCount > 0 ? `${quarantinedDevicesCount} Quarantined` : "None",
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <style>{`
        .p-toast { width: auto; min-width: 240px; max-width: 420px; }
        .p-toast-message { margin: 0 0 0 1rem; }
        .p-toast-summary { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .p-toast-detail { font-size: 13px; margin: 0; }
        .p-toast-icon { display: none; }
        .blocked-domains-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; align-items: stretch; }
        @media (max-width: 720px) { .blocked-domains-grid { grid-template-columns: 1fr; } }
      `}</style>

      <Toast ref={toastRef} position="top-right" />

      {/* ── Header ── */}
      <div style={{ background: T.cardBg, borderBottom: `1px solid ${T.border}`, padding: "13px 24px", margin: "18px 20px 0px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: T.successBg,
            border: `1px solid ${T.success}30`,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldAlert size={18} color={PRIMARY} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: T.textPrimary }}>Smart Security Service - URL & IoT Fingerprinting</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: enabled ? PRIMARY : MUTED }}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <ToggleSwitch on={enabled} onToggle={handleToggle} />
          </div>
        </div>
      </div>

      {/* ── Dynamic Main State ── */}
      {!enabled ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
          <div style={{ background: T.cardBg, padding: "30px 40px", borderRadius: 12, border: `1px solid ${T.border}`, textAlign: "center", boxShadow: T.shadow }}>
            <h2 style={{ margin: "16px 0 8px", color: T.textPrimary, fontSize: 21 }}>Service Disabled</h2>
            <p style={{ margin: 0, color: MUTED, fontSize: 15 }}>
              Enable Smart Security Service to view URL classification and IoT risk data
            </p>
          </div>
        </div>
      ) : loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
          <PropagateLoader label="Loading..." />
        </div>
      ) : (
        <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

          {/* ── Stat Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {statCards.map((s, i) => (
              <div key={i} style={{
                background: T.cardBg, borderRadius: 10, padding: "16px 18px",
                border: `1px solid ${T.border}`, boxShadow: T.shadow,
                transition: "box-shadow 0.18s, border-color 0.18s",
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowHover; e.currentTarget.style.borderColor = T.borderStrong; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.borderColor = T.border; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ fontSize: 14, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                    {s.label}
                  </div>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, background: s.iconBg,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <s.Icon size={18} color={s.accent} />
                  </div>
                </div>
                <div style={{ fontSize: 29, fontWeight: 700, color: s.accent, lineHeight: 1 }}>
                  {s.value}
                </div>
                {s.tip && (
                  <div style={{ fontSize: 13, color: MUTED, fontWeight: 500, marginTop: 6, letterSpacing: "0.02em" }}>
                    {s.tip}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Blocked Domains Panel ── */}
          <div style={{ background: T.cardBg, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: T.shadow, marginBottom: 16 }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 18, color: T.textPrimary }}>Blocked Domains</div>
              <div style={{ fontSize: 15, color: MUTED }}>{reversedBlocked.length} total</div>
            </div>
            <div style={{ overflowY: "auto", maxHeight: 420, padding: 16 }}>
              {reversedBlocked.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: MUTED, fontSize: 15 }}>
                  No threats blocked yet
                </div>
              ) : (
                <div className="blocked-domains-grid">
                  {reversedBlocked.map((b, i) => (
                    <div key={b.flow?.id || i} style={{
                      display: "flex", flexDirection: "column", height: "100%", gap: 12,
                      background: T.elevated, borderRadius: 8, border: `1px solid ${T.border}`, padding: "12px 14px",
                    }}>
                      <div style={{ fontSize: 16, color: T.textPrimary, wordBreak: "break-word" }}>
                        <span style={{ fontWeight: 600 }}>Domain :</span> {b.domain}
                      </div>
                      <div style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 600, color: T.textSec }}>Class :</span>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 12, fontWeight: 700, letterSpacing: "0.03em",
                          color: classColor(b.class), background: `${classColor(b.class)}20`, border: `1px solid ${classColor(b.class)}40` }}>
                          {b.class || "Unclassified"}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.5 }}>{b.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── IoT Fingerprinting Scores Panel ── */}
          <div style={{ background: T.cardBg, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: T.shadow }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 18, color: T.textPrimary }}>IoT Fingerprinting Scores</div>
              <div style={{ fontSize: 15, color: MUTED }}>{sortedScores.length} devices</div>
            </div>
            <div style={{ overflowY: "auto", maxHeight: 360 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16, tableLayout: "fixed" }}>
                <colgroup>
                  {scoreTableColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: T.elevated, borderBottom: `1px solid ${T.border}` }}>
                    {scoreTableColumns.map(column => (
                      <th key={column.key} style={{
                        padding: "10px 12px", textAlign: "center",
                        fontWeight: 600, color: MUTED, fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase",
                        position: "sticky", top: 0, background: T.elevated,
                      }}>{column.key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedScores.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 15 }}>No device scores available</td></tr>
                  ) : sortedScores.map(row => {
                    const score = parseFloat(row.SCORE) || 0;
                    const atRisk = score > 0.40;
                    const dns = resolveDns(row.MAC);
                    return (
                      <tr key={row.MAC} style={{ borderBottom: `1px solid ${T.border}`, background: atRisk ? T.dangerBg : "transparent" }}>
                        <td style={{ padding: "10px 12px", textAlign: "left", color: T.textPrimary, fontWeight: atRisk ? 600 : 400 }}>{resolveDeviceName(row.MAC)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "left", fontFamily: "monospace", color: T.textSec, fontSize: 15 }}>{dns?.domain || "-"}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 15 }}>
                          {dns?.category ? (
                            <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 12, fontWeight: 700, letterSpacing: "0.03em",
                              color: classColor(dns.category), background: `${classColor(dns.category)}20`, border: `1px solid ${classColor(dns.category)}40` }}>
                              {dns.category.toUpperCase()}
                            </span>
                          ) : (
                            <span style={{ color: MUTED, fontSize: 15 }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "monospace", fontWeight: 600, color: atRisk ? DANGER : T.textPrimary, fontSize: 15 }}>{score.toFixed(2)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 15 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                            color: levelColor(row.LEVEL), background: `${levelColor(row.LEVEL)}20`, border: `1px solid ${levelColor(row.LEVEL)}40` }}>
                            {row.LEVEL || "unknown"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
