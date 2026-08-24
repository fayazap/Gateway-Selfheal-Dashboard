const snmp = require('net-snmp');

const SNMP_COMMUNITY = process.env.SNMP_COMMUNITY || 'public';

// The eMTA (voice) side is a separate device from the gateway — it only ever gets
// contacted for the Voice DQoS read below, never for the gateway's own OIDs.
const MTA_IP = process.env.MTA_IP || '';
const MTA_COMMUNITY = process.env.MTA_COMMUNITY || 'private';

// Tinno self-heal OIDs, ported from Selfheal-Dashboard/app.py OID_LIST.
const OID_LIST = {
  tinnoSelfhealEnable: '1.3.6.1.4.1.62596.1.1.1.25',
  tinnoRMInterval: '1.3.6.1.4.1.62596.1.1.1.27',
  tinnoAvgMemoryThreshold: '1.3.6.1.4.1.62596.1.1.1.28',
  tinnoAvgCPUThreshold: '1.3.6.1.4.1.62596.1.1.1.30',
  tinnoConnTestPingInterval: '1.3.6.1.4.1.62596.1.1.1.36',
  tinnoIPv4PingServer: '1.3.6.1.4.1.62596.1.1.1.38',
  tinnoSHSpeedTestEnable: '1.3.6.1.4.1.62596.1.1.1.40',
  tinnoSHSpeedTestInterval: '1.3.6.1.4.1.62596.1.1.1.41',
  tinnoSHSpeedTestThreshold: '1.3.6.1.4.1.62596.1.1.1.42',
  tinnoSHIsLowThroughput: '1.3.6.1.4.1.62596.1.1.1.43',
  tinnoTemperatureThreshold: '1.3.6.1.4.1.62596.1.1.1.44',
  tinnoLastRebootReason: '1.3.6.1.4.1.62596.1.1.1.47',
  tinnoLastRebootCounter: '1.3.6.1.4.1.62596.1.1.1.48',
  tinnoLastActionTakenTime: '1.3.6.1.4.1.62596.1.1.1.49',
  tinnoHistoricalRebootReason: '1.3.6.1.4.1.62596.1.1.1.50',
  tinnoCmDoc31AccessSshEnable: '1.3.6.1.4.1.62596.1.1.1.12.2',

  // Anomaly Detection (AI process monitor) OIDs. Leaf numbers 56-72, added
  // by the MAPLE-334 patch set (2001/2002/2003). Verified against this
  // device's tinnoHistoricalRebootReason at leaf 50 matching exactly above
  // -- confirms this is the same tinnoCfgEntry MIB fork. Re-verify with a
  // MIB browser/snmpwalk before pointing this dashboard at a different
  // product SKU, since leaf numbering is fork-specific.
  tinnoADEnable: '1.3.6.1.4.1.62596.1.1.1.56',
  tinnoADProcessData: '1.3.6.1.4.1.62596.1.1.1.57',
  tinnoADProcessTimestamp: '1.3.6.1.4.1.62596.1.1.1.58',
  tinnoADProcessID: '1.3.6.1.4.1.62596.1.1.1.59',
  tinnoADProcessCMD: '1.3.6.1.4.1.62596.1.1.1.60',
  tinnoADCPUUsage: '1.3.6.1.4.1.62596.1.1.1.61',
  tinnoADMemUsage: '1.3.6.1.4.1.62596.1.1.1.62',
  tinnoADCPUAvg: '1.3.6.1.4.1.62596.1.1.1.63',
  tinnoADCPUMin: '1.3.6.1.4.1.62596.1.1.1.64',
  tinnoADCPUMax: '1.3.6.1.4.1.62596.1.1.1.65',
  tinnoADMemAvg: '1.3.6.1.4.1.62596.1.1.1.66',
  tinnoADMemMin: '1.3.6.1.4.1.62596.1.1.1.67',
  tinnoADMemMax: '1.3.6.1.4.1.62596.1.1.1.68',
  tinnoADAnomalyCount: '1.3.6.1.4.1.62596.1.1.1.69',
  tinnoADNewProcCPUThreshold: '1.3.6.1.4.1.62596.1.1.1.70',
  tinnoADNewProcMemThreshold: '1.3.6.1.4.1.62596.1.1.1.71',
  tinnoADCorrectiveActionEnable: '1.3.6.1.4.1.62596.1.1.1.72',
};

// Anomaly Detection params that are read-only telemetry, not configuration --
// used by getAnomalyDetectionParams() below to fetch AD-specific OIDs
// without pulling in every self-heal OID too. tinnoHistoricalRebootReason
// is deliberately NOT in this list even though AD events live inside it --
// it's fetched once by getSelfhealParams() and the AD events are parsed
// out of that same shared value by parseAnomalyEvents(), never fetched
// twice.
const ANOMALY_OID_NAMES = [
  'tinnoADEnable',
  'tinnoADProcessData',
  'tinnoADProcessTimestamp',
  'tinnoADProcessID',
  'tinnoADProcessCMD',
  'tinnoADCPUUsage',
  'tinnoADMemUsage',
  'tinnoADCPUAvg',
  'tinnoADCPUMin',
  'tinnoADCPUMax',
  'tinnoADMemAvg',
  'tinnoADMemMin',
  'tinnoADMemMax',
  'tinnoADAnomalyCount',
  'tinnoADNewProcCPUThreshold',
  'tinnoADNewProcMemThreshold',
  'tinnoADCorrectiveActionEnable',
];

// Network Quality Status OIDs, ported from Selfheal-Dashboard/app.py.
// ifInDiscards/ifOutDiscards live on the gateway (same host/community as OID_LIST above).
const NETWORK_QUALITY_OIDS = {
  ifInDiscards: '1.3.6.1.2.1.2.2.1.13.2',
  ifOutDiscards: '1.3.6.1.2.1.2.2.1.19.2',
};

// Voice DQoS lives on the eMTA — a different device reached only via MTA_IP/MTA_COMMUNITY,
// never the gateway host/community used everywhere else in this file. It's already a
// scalar (.0), unlike the table-column OIDs above, so it must NOT go through resolveOid().
const DEVICE_DQOS_OID = '1.3.6.1.4.1.17318.1.25.50.30.100.0';
const DQOS_DIRECTION_MAPPING = { 0: 'Disabled', 1: 'Send and Receive', 2: 'Send Only' };

// Device summary OIDs — replace the old SSH/dmcli lookups on /api/summary.
// sysDescr/sysUpTime are standard MIB-II scalars (already .0); the tinno live-stat
// OIDs and ifPhysAddress are table columns, so — like NETWORK_QUALITY_OIDS above —
// the ".2" (cable/DOCSIS interface index) is hardcoded here rather than resolved.
const SUMMARY_OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  liveCpuStat: '1.3.6.1.4.1.62596.1.1.1.51.2',
  liveMemoryStat: '1.3.6.1.4.1.62596.1.1.1.52.2',
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6.2',
};

// Total device RAM in KB, from `free` on the gateway (total column). Used to derive
// Memory Usage % from tinnoLiveMemoryStat (free KB) as (total - free) / total.
const MEM_TOTAL_KB = parseInt(process.env.MEM_TOTAL_KB, 10) || 1910720;

// SNMP type used when writing a parameter via snmpset.
const PARAM_TYPES = {
  tinnoSelfhealEnable: snmp.ObjectType.Integer,
  tinnoRMInterval: snmp.ObjectType.Integer,
  tinnoAvgMemoryThreshold: snmp.ObjectType.Integer,
  tinnoAvgCPUThreshold: snmp.ObjectType.Integer,
  tinnoConnTestPingInterval: snmp.ObjectType.Integer,
  tinnoIPv4PingServer: snmp.ObjectType.OctetString,
  tinnoSHSpeedTestEnable: snmp.ObjectType.Integer,
  tinnoSHSpeedTestInterval: snmp.ObjectType.Integer,
  tinnoSHSpeedTestThreshold: snmp.ObjectType.Integer,
  tinnoTemperatureThreshold: snmp.ObjectType.Integer,
  tinnoCmDoc31AccessSshEnable: snmp.ObjectType.Integer,

  // Anomaly Detection -- only these four are ever written via /api/configure.
  // The other tinnoAD* OIDs (process telemetry) are read-only and never
  // appear here; PARAM_TYPES is only consulted on the SET path.
  tinnoADEnable: snmp.ObjectType.Integer,
  tinnoADNewProcCPUThreshold: snmp.ObjectType.Integer,
  tinnoADNewProcMemThreshold: snmp.ObjectType.Integer,
  tinnoADCorrectiveActionEnable: snmp.ObjectType.Integer,
};

// Human-readable value mappings, ported from Selfheal-Dashboard/app.py VALUE_MAPPINGS.
const VALUE_MAPPINGS = {
  tinnoSelfhealEnable: { 0: 'Disabled', 1: 'Enabled' },
  tinnoSHSpeedTestEnable: { 0: 'Disabled', 1: 'Enabled' },
  tinnoCmDoc31AccessSshEnable: { 0: 'Disabled', 1: 'Enabled' },
  tinnoADEnable: { 0: 'Disabled', 1: 'Enabled' },
  tinnoADCorrectiveActionEnable: { 0: 'Detect only', 1: 'Detect and respond' },
  tinnoLastRebootReason: {
    0: 'Power Cycle',
    1: 'High CPU Usage',
    2: 'Memory Overload',
    3: 'Firmware Issue',
    4: 'Network Failure',
  },
  tinnoHistoricalRebootReason: {
    CPU_THRESHOLD: 'High CPU Usage',
    POWER_CYCLE: 'Power Cycle',
    MEMORY_OVERLOAD: 'Memory Overload',
    FIRMWARE_ISSUE: 'Firmware Issue',
    NETWORK_FAILURE: 'Network Failure',
  },
};

function toJsValue(varbind) {
  if (Buffer.isBuffer(varbind.value)) return varbind.value.toString().trim();
  return varbind.value;
}

// Values that mean "the device reported nothing here" — displayed as '-' rather than blank.
const EMPTY_PLACEHOLDER = '-';
const UNREACHABLE_PLACEHOLDER = 'Unable to connect to modem';
const UNAVAILABLE_PLACEHOLDER = 'Unavailable';

// Formats a raw SNMP varbind value for a given param name (applies mappings/timestamp parsing).
// Returns '-' when the device reports an empty value, instead of a blank string.
function formatValue(name, rawValue) {
  const value = Buffer.isBuffer(rawValue) ? rawValue.toString().trim() : rawValue;

  if (value === undefined || value === null || value === '') return EMPTY_PLACEHOLDER;

  if (name === 'tinnoLastActionTakenTime') {
    const match = String(value).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
    return String(value);
  }

  const mapping = VALUE_MAPPINGS[name];
  if (mapping && Object.prototype.hasOwnProperty.call(mapping, value)) return mapping[value];
  return value;
}

// Parses the comma-separated "timestamp - REASON_CODE" list from tinnoHistoricalRebootReason.
function parseHistoricalReboots(raw) {
  if (!raw || typeof raw !== 'string') return [];
  if (raw === EMPTY_PLACEHOLDER || raw === UNREACHABLE_PLACEHOLDER) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    // Anomaly Detection events share this OID but use a different line
    // format (see parseAnomalyEvents below) -- without this they'd fall
    // through to the 'reason: N/A' case, since they contain no ' - '.
    .filter((entry) => !entry.includes('ANOMALY_KILL'))
    .slice(0, 10)
    .map((entry) => {
      const sepIndex = entry.indexOf(' - ');
      if (sepIndex === -1) return { time: entry, reason: 'N/A' };
      const time = entry.slice(0, sepIndex).trim();
      const code = entry.slice(sepIndex + 3).trim();
      const reason = VALUE_MAPPINGS.tinnoHistoricalRebootReason[code] || code;
      return { time, reason };
    });
}

// Parses the ANOMALY_KILL-tagged entries out of the same raw
// tinnoHistoricalRebootReason string parseHistoricalReboots() reads --
// the two feature areas share this one OID, but use different line
// formats, so this looks for the ANOMALY_KILL tag specifically and
// leaves every other line (real self-heal reboot reasons) untouched.
// Line format written by remediate.py's _log_corrective_action():
//   "MM-DD-YY HH:MM:SS ANOMALY_KILL pid=<pid> cmd=<cmd> <RESOURCE>=<pct>% (threshold=<pct>%) result=<killed|kill_failed>"
const ANOMALY_KILL_PATTERN =
  /^(\S+ \S+) ANOMALY_KILL pid=(\d+) cmd=(.+?) (CPU|MEM)=([\d.]+)% \(threshold=(\d+)%\) result=(\w+)$/;

function parseAnomalyEvents(raw) {
  if (!raw || typeof raw !== 'string') return [];
  if (raw === EMPTY_PLACEHOLDER || raw === UNREACHABLE_PLACEHOLDER) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes('ANOMALY_KILL'))
    // reboot_log.txt is append-only (remediate.py opens it with mode "a"),
    // so entries arrive oldest-first. Reverse BEFORE slicing so the cap
    // keeps the most recent events and drops the oldest ones, not the
    // other way around, and so callers get newest-first order to display.
    .reverse()
    .slice(0, 20)
    .map((entry) => {
      const match = entry.match(ANOMALY_KILL_PATTERN);
      if (!match) return { time: entry, cmd: 'N/A', resource: 'N/A', value: null, threshold: null, result: 'unknown' };
      const [, time, pid, cmd, resource, value, threshold, result] = match;
      return { time, pid, cmd, resource, value: Number(value), threshold: Number(threshold), result };
    });
}


// These Tinno enterprise OIDs are table columns, not scalars — the device publishes
// the actual value under instance .2 (the cable/DOCSIS interface index). Ported from
// app.py's `/api/snmpset`, which appended ".2" the same way before every SNMP write.
function resolveOid(oid) {
  return oid.endsWith('.2') ? oid : `${oid}.2`;
}

// community defaults to SNMP_COMMUNITY (the gateway's) — callers only pass a different
// one for the eMTA (MTA_COMMUNITY), never mixing the two.
function withSession(host, fn, community = SNMP_COMMUNITY) {
  const session = snmp.createSession(host, community, {
    version: snmp.Version2c,
    timeout: 5000,
    retries: 1,
  });
  return fn(session).finally(() => session.close());
}

// `raw: true` skips toJsValue()'s Buffer -> string conversion and resolves with the
// varbind's value untouched. Needed for binary OctetStrings like PhysAddress — the
// default .toString() is lossy (UTF-8) and mangles raw MAC bytes (e.g. 0x00) before
// any caller gets a chance to format them.
function snmpGet(host, oid, community, { raw = false } = {}) {
  return withSession(host, (session) => new Promise((resolve, reject) => {
    session.get([oid], (error, varbinds) => {
      if (error) return reject(error);
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
      resolve(raw ? vb.value : toJsValue(vb));
    });
  }), community);
}

function snmpSet(host, oid, type, value, community) {
  return withSession(host, (session) => new Promise((resolve, reject) => {
    session.set([{ oid, type, value }], (error, varbinds) => {
      if (error) return reject(error);
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
      resolve(toJsValue(vb));
    });
  }), community);
}

// Fetches every known self-heal OID from the device. Returns:
//   params — human-readable display values (e.g. "Enabled"), for the read-only table
//   raw    — device-native values (e.g. 1), for pre-filling the Configure form
// Result key order always matches OID_LIST's declaration order — the per-OID SNMP
// GETs resolve concurrently, but building the objects from `results` (not inside the
// Promise.all callbacks) keeps insertion order stable across requests.
async function getSelfhealParams(host) {
  const results = await Promise.all(
    Object.entries(OID_LIST).map(async ([name, oid]) => {
      try {
        const value = await snmpGet(host, resolveOid(oid));
        return [name, value];
      } catch (err) {
        return [name, null];
      }
    })
  );

  const params = {};
  const raw = {};
  for (const [name, value] of results) {
    raw[name] = value;
    params[name] = value === null ? UNREACHABLE_PLACEHOLDER : formatValue(name, value);
  }
  return { params, raw };
}

// Fetches every Anomaly Detection OID, plus the shared
// tinnoHistoricalRebootReason field (parsed here into AD-specific events
// via parseAnomalyEvents, distinct from parseHistoricalReboots' self-heal
// parsing of that same raw string). Mirrors getSelfhealParams()'s shape
// (params/raw) so the frontend can reuse the same display/form-seeding
// pattern already used for self-heal config.
async function getAnomalyDetectionParams(host) {
  const namesToFetch = [...ANOMALY_OID_NAMES, 'tinnoHistoricalRebootReason'];
  const results = await Promise.all(
    namesToFetch.map(async (name) => {
      try {
        const value = await snmpGet(host, resolveOid(OID_LIST[name]));
        return [name, value];
      } catch (err) {
        return [name, null];
      }
    })
  );

  const params = {};
  const raw = {};
  for (const [name, value] of results) {
    raw[name] = value;
    params[name] = value === null ? UNREACHABLE_PLACEHOLDER : formatValue(name, value);
  }
  const events = parseAnomalyEvents(params.tinnoHistoricalRebootReason);
  return { params, raw, events };
}

// Fetches Voice DQoS from the eMTA (MTA_IP/MTA_COMMUNITY) — never the gateway host/community.
// Returns a display string; falls back to 'Unavailable' if MTA_IP isn't configured or unreachable.
async function getVoiceDQoS() {
  if (!MTA_IP) return UNAVAILABLE_PLACEHOLDER;
  try {
    const raw = await snmpGet(MTA_IP, DEVICE_DQOS_OID, MTA_COMMUNITY);
    const value = Buffer.isBuffer(raw) ? raw.toString().trim() : raw;
    return Object.prototype.hasOwnProperty.call(DQOS_DIRECTION_MAPPING, value)
      ? DQOS_DIRECTION_MAPPING[value]
      : String(value);
  } catch (err) {
    return UNAVAILABLE_PLACEHOLDER;
  }
}

// Ported from Selfheal-Dashboard/app.py's set_qos_direction: forces the eMTA's Voice DQoS
// to "Send and Receive" (INTEGER 1) via MTA_IP/MTA_COMMUNITY. MTA-only — never touches the
// gateway host/community. A failed adjustment is logged and swallowed (matches app.py, which
// treats it as best-effort and still returns the discard counters either way).
async function setDeviceDQosSendRecv() {
  if (!MTA_IP) return false;
  try {
    await snmpSet(MTA_IP, DEVICE_DQOS_OID, snmp.ObjectType.Integer, 1, MTA_COMMUNITY);
    return true;
  } catch (err) {
    console.warn(`Voice DQoS adjustment failed (MTA ${MTA_IP}): ${err.message}`);
    return false;
  }
}

// host -> whether the DQoS remediation succeeded, for the discard episode currently in
// progress on that host. Presence of a key means "already remediated (or attempted) this
// episode, don't repeat the write"; the key is removed as soon as a poll sees no discards,
// so the next episode can trigger the snmpset again. /api/summary polls every ~5s, and
// without this the write would otherwise fire on every single poll for as long as the
// discard condition persists.
const discardEpisodeByHost = new Map();

// Fetches the Network Quality Status metrics shown on the summary page, and ports app.py's
// set_qos_direction auto-remediation:
//   ifInDiscards/ifOutDiscards — from the gateway (host/community passed in, same as selfheal)
//   rising edge (no discards -> discards) — force the eMTA's Voice DQoS to "Send and Receive"
//                                            exactly once per episode (see discardEpisodeByHost)
//   voiceDQoS                  — read back from the eMTA afterwards, so the display reflects
//                                 any adjustment just made
async function getNetworkQuality(host) {
  const [inDiscards, outDiscards] = await Promise.all([
    snmpGet(host, NETWORK_QUALITY_OIDS.ifInDiscards).catch(() => null),
    snmpGet(host, NETWORK_QUALITY_OIDS.ifOutDiscards).catch(() => null),
  ]);

  const hasDiscards = (Number(inDiscards) || 0) > 0 || (Number(outDiscards) || 0) > 0;

  let adjustedDueToDiscards = false;
  if (hasDiscards) {
    if (discardEpisodeByHost.has(host)) {
      // Still within the same episode — already remediated (or attempted), don't repeat the write.
      adjustedDueToDiscards = discardEpisodeByHost.get(host);
    } else {
      // Rising edge: a new discard episode just started — fire the remediation exactly once.
      adjustedDueToDiscards = await setDeviceDQosSendRecv();
      discardEpisodeByHost.set(host, adjustedDueToDiscards);
    }
  } else {
    // No discards this poll — any episode is over, so a future one can trigger again.
    discardEpisodeByHost.delete(host);
  }

  const voiceDQoS = await getVoiceDQoS();

  return {
    inDiscards: inDiscards === null || inDiscards === undefined ? null : Number(inDiscards),
    outDiscards: outDiscards === null || outDiscards === undefined ? null : Number(outDiscards),
    voiceDQoS,
    adjustedDueToDiscards,
  };
}

// Parses sysDescr.0, e.g.:
//   "DOCSIS EMTA <<HW_REV: 160.0; VENDOR: Tinno, Inc.; BOOTR: NONE; SW_REV: 8.6.0.0.114-1.0.1; MODEL: B521DE>>"
// The text before "<<" is the device name; the "<<...>>" block is a "; "-separated
// list of "KEY: value" pairs. Any field the device omits falls back to '-'.
function parseSysDescr(raw) {
  const value = Buffer.isBuffer(raw) ? raw.toString().trim() : String(raw || '').trim();
  const bracketMatch = value.match(/<<(.*)>>/);
  const deviceName = value.split('<<')[0].trim() || EMPTY_PLACEHOLDER;

  const fields = {};
  if (bracketMatch) {
    bracketMatch[1].split(';').forEach((part) => {
      const sep = part.indexOf(':');
      if (sep === -1) return;
      fields[part.slice(0, sep).trim()] = part.slice(sep + 1).trim();
    });
  }

  return {
    deviceName,
    manufacturer: fields.VENDOR || EMPTY_PLACEHOLDER,
    firmwareVersion: fields.SW_REV || EMPTY_PLACEHOLDER,
    deviceModel: fields.MODEL || EMPTY_PLACEHOLDER,
  };
}

// sysUpTimeInstance is in timeticks (hundredths of a second). Formats it as
// "[Nd ]HH:MM:SS" to match the DD:HH:MM:SS style shown in the SNMP walk sample.
function formatUptimeTicks(raw) {
  const ticks = Number(raw);
  if (!Number.isFinite(ticks) || ticks < 0) return EMPTY_PLACEHOLDER;

  const totalSeconds = Math.floor(ticks / 100);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

// ifPhysAddress comes back as a raw PhysAddress OctetString (Buffer) — format it as
// the usual colon-separated hex pairs (e.g. "2C:00:2A:10:B8:74").
function formatMacAddress(raw) {
  if (Buffer.isBuffer(raw)) {
    return [...raw].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  }
  const value = String(raw || '').trim();
  return value || EMPTY_PLACEHOLDER;
}

// No gateway/DNS OIDs are available over SNMP — the gateway address is derived from
// the device's own IP (assumes a /24, i.e. "<network>.1"), which is the convention
// this device family uses. DNS has no live source at all, so it's hardcoded by the caller.
function deriveGateway(ip) {
  const octets = typeof ip === 'string' ? ip.split('.') : [];
  if (octets.length !== 4) return EMPTY_PLACEHOLDER;
  return `${octets[0]}.${octets[1]}.${octets[2]}.1`;
}

// Fetches the device summary fields shown on /api/summary's info cards, replacing the
// old SSH/dmcli lookups. `host` is the gateway IP set at login (sshConfig.host) — it
// doubles as both the SNMP target and the displayed IP Address (no separate SNMP source
// for the device's own IP exists). Gateway is derived from it; DNS has no live source
// and is hardcoded to 8.8.8.8.
async function getDeviceSummary(host) {
  const [sysDescrRaw, sysUpTimeRaw, cpuRaw, memFreeRaw, macRaw] = await Promise.all([
    snmpGet(host, SUMMARY_OIDS.sysDescr).catch(() => null),
    snmpGet(host, SUMMARY_OIDS.sysUpTime).catch(() => null),
    snmpGet(host, SUMMARY_OIDS.liveCpuStat).catch(() => null),
    snmpGet(host, SUMMARY_OIDS.liveMemoryStat).catch(() => null),
    snmpGet(host, SUMMARY_OIDS.ifPhysAddress, undefined, { raw: true }).catch(() => null),
  ]);

  const { deviceName, manufacturer, firmwareVersion, deviceModel } = parseSysDescr(sysDescrRaw);

  const cpuUsage = cpuRaw === null || cpuRaw === undefined ? EMPTY_PLACEHOLDER : `${Number(cpuRaw)}%`;

  const memFree = Number(memFreeRaw);
  const memoryUsage = memFreeRaw === null || memFreeRaw === undefined || Number.isNaN(memFree)
    ? EMPTY_PLACEHOLDER
    : `${Math.round(((MEM_TOTAL_KB - memFree) / MEM_TOTAL_KB) * 100)}%`;

  return {
    hostname: deviceName,
    deviceModel,
    manufacturer,
    firmwareVersion,
    uptime: sysUpTimeRaw === null || sysUpTimeRaw === undefined ? EMPTY_PLACEHOLDER : formatUptimeTicks(sysUpTimeRaw),
    cpuUsage,
    memoryUsage,
    macAddress: macRaw === null || macRaw === undefined ? EMPTY_PLACEHOLDER : formatMacAddress(macRaw),
    ipAddress: host,
    defaultGateway: deriveGateway(host),
    dnsServers: '8.8.8.8',
  };
}

// Reverses a mapped display label (e.g. "Enabled") back to its device-native code (e.g. 1),
// and coerces numeric-typed values to numbers. Used so a stale/human display value making
// its way into a configure request doesn't silently become NaN on the wire.
function coerceWriteValue(name, type, value) {
  if (type !== snmp.ObjectType.Integer) return value;
  if (typeof value === 'number') return value;

  const mapping = VALUE_MAPPINGS[name];
  if (mapping) {
    const match = Object.entries(mapping).find(([, label]) => label === value);
    if (match) return Number(match[0]);
  }
  return Number(value);
}

module.exports = {
  OID_LIST,
  PARAM_TYPES,
  VALUE_MAPPINGS,
  snmp,
  snmpGet,
  snmpSet,
  resolveOid,
  formatValue,
  parseHistoricalReboots,
  parseAnomalyEvents,
  getSelfhealParams,
  getAnomalyDetectionParams,
  getNetworkQuality,
  getDeviceSummary,
  coerceWriteValue,
};