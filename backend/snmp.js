const snmp = require('net-snmp');

const SNMP_COMMUNITY = process.env.SNMP_COMMUNITY || 'public';

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
};

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
};

// Human-readable value mappings, ported from Selfheal-Dashboard/app.py VALUE_MAPPINGS.
const VALUE_MAPPINGS = {
  tinnoSelfhealEnable: { 0: 'Disabled', 1: 'Enabled' },
  tinnoSHSpeedTestEnable: { 0: 'Disabled', 1: 'Enabled' },
  tinnoCmDoc31AccessSshEnable: { 0: 'Disabled', 1: 'Enabled' },
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

// These Tinno enterprise OIDs are table columns, not scalars — the device publishes
// the actual value under instance .2 (the cable/DOCSIS interface index). Ported from
// app.py's `/api/snmpset`, which appended ".2" the same way before every SNMP write.
function resolveOid(oid) {
  return oid.endsWith('.2') ? oid : `${oid}.2`;
}

function withSession(host, fn) {
  const session = snmp.createSession(host, SNMP_COMMUNITY, {
    version: snmp.Version2c,
    timeout: 5000,
    retries: 1,
  });
  return fn(session).finally(() => session.close());
}

function snmpGet(host, oid) {
  return withSession(host, (session) => new Promise((resolve, reject) => {
    session.get([oid], (error, varbinds) => {
      if (error) return reject(error);
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
      resolve(toJsValue(vb));
    });
  }));
}

function snmpSet(host, oid, type, value) {
  return withSession(host, (session) => new Promise((resolve, reject) => {
    session.set([{ oid, type, value }], (error, varbinds) => {
      if (error) return reject(error);
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
      resolve(toJsValue(vb));
    });
  }));
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
  getSelfhealParams,
  coerceWriteValue,
};
