const express = require('express');
const { Client } = require('ssh2');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const {
  OID_LIST,
  PARAM_TYPES,
  snmp,
  snmpGet,
  snmpSet,
  resolveOid,
  formatValue,
  parseHistoricalReboots,
  getSelfhealParams,
  getAnomalyDetectionParams,
  getNetworkQuality,
  coerceWriteValue,
} = require('./snmp');

const ANOMALY_REPORT_PATH = '/log/anomaly_logs/data/outputs/anomalies.csv';
const ANOMALY_REPORT_TAIL_LINES = 30; // plenty to cover 5 displayed rows plus some margin

// Fixed column order test.py's own writer uses -- confirmed directly against
// the real device and the real test.py source (anomalies_only.to_csv(...)).
// This file is written EXCLUSIVELY by the anomaly detection agent itself
// (test.py filters to anomaly==1 rows before writing), with no sharing with
// self-heal and no SNMP size cap -- unlike reboot_log.txt/
// tinnoHistoricalRebootReason, which both self-heal and remediate.py write
// to, and which is capped at 1024 bytes over SNMP. This is the dedicated
// source for "what did the detector itself observe", not "what did
// corrective action do about it" (that's still only in reboot_log.txt).
const ANOMALY_CSV_COLUMNS = [
  'timestamp', 'iteration', 'process_name', 'cpu_usage_pct', 'memory_usage_pct',
  'anomaly', 'state_cpu', 'state_mem',
  'cpu_avg', 'cpu_min', 'cpu_max', 'mem_avg', 'mem_min', 'mem_max',
];

// Minimal RFC4180-ish CSV line parser -- handles quoted fields containing
// commas (pandas quotes these; e.g. a captured "ps -eo pid,cmd,%cpu,%mem --"
// command line, seen for real on this device) and doubled-quote escaping.
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseAnomaliesCsv(output) {
  if (!output) return [];
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('timestamp,')) // skip header if tail happened to include it
    .map((line) => {
      const fields = parseCsvLine(line);
      if (fields.length !== ANOMALY_CSV_COLUMNS.length) return null; // skip any malformed/partial line
      const row = {};
      ANOMALY_CSV_COLUMNS.forEach((col, i) => { row[col] = fields[i]; });
      return row;
    })
    .filter(Boolean)
    .reverse(); // file is append-only oldest-first; newest-first for display
}

async function getRecentDetections(host) {
  const output = await sshExec(`tail -n ${ANOMALY_REPORT_TAIL_LINES} ${ANOMALY_REPORT_PATH} 2>/dev/null`);
  return parseAnomaliesCsv(output);
}

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

// SSH config using environment variables
const sshConfig = {
  host: '192.168.246.76',
  port: 22,
  username: process.env.SSH_USERNAME || 'root',
  password: process.env.SSH_PASSWORD || 'Hari@123'
};

// Helper to execute SSH command and return output
function sshExec(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk) => { stdout += chunk; });
        stream.stderr.on('data', (chunk) => { stderr += chunk; });
        stream.on('close', (code) => {
          conn.end();
          // dmcli exits 1 even on success — never treat non-zero as fatal
          // resolve with stdout; caller checks content for real errors
          resolve(stdout.trim());
        });
      });
    })
    .connect(sshConfig)
    .on('error', reject);
  });
}

// Parse dmcli output into a flat object
function parseDmcliOutput(output) {
  const result = {};
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Match: "Parameter   N name: Device.SoftwareModules.Foo"
    const nameMatch = lines[i].match(/Parameter\s+\d+\s+name:\s+(.+)/);
    if (!nameMatch) continue;

    const fullKey = nameMatch[1].trim();
    // Strip "Device." prefix → "SoftwareModules.ExecEnv.1.Status"
    const key = fullKey.startsWith('Device.') ? fullKey.slice(7) : fullKey;

    // Value is on the very next line: "               type:  string,    value: Up"
    // Use greedy match after last "value:" to handle values containing colons (e.g. URLs, datetimes)
    const valueLine = lines[i + 1] || '';
    const valueMatch = valueLine.match(/value:\s*(.*)/);
    const value = valueMatch ? valueMatch[1].trim() : '';

    result[key] = value;
    i++; // skip the consumed value line
  }

  return result;
}

// Parses anomaly-detection-start.sh's `status` output into a flat object.
// Real output looks like:
//   [anomaly-detection] Daemon      : running (PID: 1238)
//   [anomaly-detection] Python agent: NOT running
//   [anomaly-detection] Socket      : present (/var/run/anomaly_detection.sock)
// Keyed on the labeled prefix and the presence of "running"/"NOT running"/
// "present"/"MISSING", not exact whitespace, so minor script formatting
// changes (spacing, wording) don't silently break this.
function parseAnomalyServiceStatus(output) {
  const lines = String(output || '').split('\n');
  const status = {
    daemonRunning: false, daemonPid: null,
    agentRunning: false, agentPid: null,
    socketPresent: false,
  };

  for (const line of lines) {
    if (/Daemon\s*:/.test(line)) {
      status.daemonRunning = /running/i.test(line) && !/NOT running/i.test(line);
      const pidMatch = line.match(/PID:\s*(\d+)/);
      if (pidMatch) status.daemonPid = pidMatch[1];
    } else if (/Python agent\s*:/.test(line)) {
      status.agentRunning = /running/i.test(line) && !/NOT running/i.test(line);
      const pidMatch = line.match(/PID:\s*(\d+)/);
      if (pidMatch) status.agentPid = pidMatch[1];
    } else if (/Socket\s*:/.test(line)) {
      status.socketPresent = /present/i.test(line);
    }
  }
  return status;
}

// Load data from file or initialize
async function loadData(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.warn(`Failed to load ${filePath}, initializing empty: ${err.message}`);
    return [];
  }
}

// Save data to file
async function saveData(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save ${filePath}: ${err.message}`);
  }
}

// Load stats from file or initialize
async function loadStats(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.warn(`Failed to load ${filePath}, initializing empty: ${err.message}`);
    return [];
  }
}

// Save stats to file
async function saveStats(filePath, stats) {
  try {
    await fs.writeFile(filePath, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error(`Failed to save ${filePath}: ${err.message}`);
  }
}

const ANOMALY_EVENTS_FILE = 'anomaly_events.json';
const ANOMALY_EVENTS_ARCHIVE_CAP = 200; // generous vs. the ~9 entries that fit in the device's 1024-byte SNMP window

// tinnoHistoricalRebootReason is served through a fixed-size (1024 byte)
// SNMP buffer on the device, read oldest-line-first -- once enough new
// ANOMALY_KILL entries accumulate, the OLDEST bytes get truncated off
// before the device ever sends them, and since new entries are appended
// at the end, it's always the newest ones that get pushed past the
// truncation point and lost from the live SNMP response entirely. That's
// a device-side limit no amount of frontend/backend parsing can recover.
//
// Instead: every time we successfully see an event (i.e. it was still
// within the un-truncated window at poll time), archive it locally,
// deduped by a key unique to that specific detection. Once archived, an
// event survives here even after later truncation pushes it out of the
// live SNMP response -- this can't recover events that were ALREADY
// truncated before this archiving started, but it permanently closes the
// gap going forward, without touching device firmware at all.
function anomalyEventKey(ev) {
  return `${ev.time}|${ev.pid}|${ev.cmd}|${ev.result}`;
}

async function archiveAnomalyEvents(liveEvents) {
  const archive = await loadStats(ANOMALY_EVENTS_FILE);
  const seen = new Set(archive.map(anomalyEventKey));

  let added = false;
  for (const ev of liveEvents) {
    const key = anomalyEventKey(ev);
    if (!seen.has(key)) {
      archive.push(ev);
      seen.add(key);
      added = true;
    }
  }

  if (!added) return archive; // avoid an unnecessary disk write when nothing changed

  // Newest first, capped -- matches the ordering/shape parseAnomalyEvents
  // already returns, so nothing downstream needs to know this merge happened.
  archive.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  const trimmed = archive.slice(0, ANOMALY_EVENTS_ARCHIVE_CAP);
  await saveStats(ANOMALY_EVENTS_FILE, trimmed);
  return trimmed;
}

// API: Fetch device summary
app.get('/api/summary', async (req, res) => {
  try {
    const hostname = await sshExec('dmcli eRT getv Device.DeviceInfo.DeviceCategory 2>/dev/null | awk \'/value:/{sub(/.*value:[ \\t]*/,""); print}\' || cat /proc/sys/kernel/hostname || dmcli eRT getv Device.DeviceInfo.X_COMCAST-COM_CM_MAC 2>/dev/null | awk \'/value:/{print $NF}\'');
    const uptime = await sshExec("uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}'");
    const cpuUsage = await sshExec('awk \'/^cpu / {usage=($2+$4)*100/($2+$4+$5); printf "%.1f%%\\n", usage}\' /proc/stat');
    const memoryUsage = await sshExec("free 2>/dev/null | awk '/Mem:/ {print int($3*100/$2) \"%\"}' | grep -v '^$' || " + "awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{print int((t-a)*100/t) \"%\"}' /proc/meminfo");
    const ipAddress = await sshExec("/sbin/ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i==\"src\") print $(i+1); exit}' || " + "/sbin/ip -4 addr 2>/dev/null | awk '/inet / && !/127.0.0.1/{print $2}' | cut -d/ -f1 | head -n1");
    const macAddress = await sshExec("iface=$(/sbin/ip route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i==\"dev\") print $(i+1); exit}'); " + "[ -n \"$iface\" ] && cat /sys/class/net/$iface/address 2>/dev/null || " + "/sbin/ip link 2>/dev/null | awk '/ether/{print $2; exit}'");
    const defaultGateway = await sshExec('/sbin/ip route show default | awk \'{print $3; exit}\'');
    const dnsServers = await sshExec('dmcli eRT getv Device.DNS.Client.Server.1.DNSServer 2>/dev/null | awk \'/value:/{print $NF}\' || grep nameserver /etc/resolv.conf /tmp/resolv.conf 2>/dev/null | awk \'{print $2}\' | sort -u | tr \'\\n\' \',\' | sed \'s/,$//\'');
    const firmwareVersion = await sshExec("awk -F= '/^VERSION=/{gsub(/[\" ]/,\"\",$2); print $2; exit}' /etc/rdk-image-version 2>/dev/null || " + "awk -F= '/^BRANCH=/{gsub(/[\" ]/,\"\",$2); print $2; exit}' /etc/rdk-image-version 2>/dev/null || " + "dmcli eRT getv Device.DeviceInfo.SoftwareVersion 2>/dev/null | awk '/value:/{print $NF}' || " + "uname -r");
    const deviceModelRaw = await sshExec('cat /proc/device-tree/model');
    const deviceModel = await sshExec('dmcli eRT getv Device.DeviceInfo.ModelName 2>/dev/null | awk \'/value:/{print $NF}\' || cat /proc/device-tree/model 2>/dev/null || echo "B521FG"');
    const manufacturer = await sshExec('dmcli eRT getv Device.DeviceInfo.Manufacturer 2>/dev/null | awk \'/value:/{print $NF}\' || echo "Tinno"');
    const cpuStats = await loadStats('cpu_stats.json');
    const newCpuValue = parseFloat(cpuUsage) || 0;
    cpuStats.push({ time: new Date().toISOString(), value: newCpuValue });
    if (cpuStats.length > 20) cpuStats.shift();
    await saveStats('cpu_stats.json', cpuStats);

    const memoryStats = await loadStats('memory_stats.json');
    const newMemoryValue = parseFloat(memoryUsage) || 0;
    memoryStats.push({ time: new Date().toISOString(), value: newMemoryValue });
    if (memoryStats.length > 20) memoryStats.shift();
    await saveStats('memory_stats.json', memoryStats);

    const tempRaw = await sshExec('cat /sys/class/thermal/thermal_zone0/temp || echo 0');
    const tempCelsius = parseInt(tempRaw) / 1000 || 0;
    const tempStats = await loadStats('temp_stats.json');
    tempStats.push({ time: new Date().toISOString(), value: tempCelsius });
    if (tempStats.length > 20) tempStats.shift();
    await saveStats('temp_stats.json', tempStats);

    res.json({
      hostname: hostname || 'N/A',
      uptime: uptime || 'N/A',
      cpuUsage: cpuUsage || 'N/A',
      memoryUsage: memoryUsage || 'N/A',
      ipAddress: ipAddress || 'N/A',
      macAddress: macAddress || 'N/A',
      defaultGateway: defaultGateway || 'N/A',
      dnsServers: dnsServers || 'N/A',
      firmwareVersion: firmwareVersion || 'N/A',
      deviceModel: deviceModel,
      manufacturer: manufacturer || 'N/A',
    });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch all selfheal params and reboots via SNMP (device target = gateway IP set at login)
app.get('/api/selfheal', async (req, res) => {
  try {
    const host = sshConfig.host;
    const { params, raw } = await getSelfhealParams(host);
    const reboots = parseHistoricalReboots(params.tinnoHistoricalRebootReason);

    const rebootCount = parseInt(params.tinnoLastRebootCounter, 10) || 0;
    const avgCpuThreshold = parseInt(params.tinnoAvgCPUThreshold, 10) || 0;
    const avgMemoryThreshold = parseInt(params.tinnoAvgMemoryThreshold, 10) || 0;
    const avgTemperatureThreshold = parseInt(params.tinnoTemperatureThreshold, 10) || 0;

    res.json({
      params,
      raw,
      reboots,
      lastRebootReason: params.tinnoLastRebootReason,
      lastRebootTime: params.tinnoLastActionTakenTime,
      rebootCount,
      avgCpuThreshold,
      avgMemoryThreshold,
      avgTemperatureThreshold,
    });
  } catch (err) {
    console.error('GET /api/selfheal failed:', err);
    res.status(500).json({ error: `SNMP error: ${err.message}` });
  }
});

// API: Fetch Anomaly Detection status, config, and recent events
app.get('/api/anomaly-detection', async (req, res) => {
  try {
    const host = sshConfig.host;

    // SNMP data (config/telemetry) and service status (daemon/agent/socket
    // liveness) come from two entirely different sources -- SNMP has no
    // OID for "is the Python agent process actually alive right now",
    // that's process/PID state only visible via the device shell. Fetch
    // both in parallel; a failure in one shouldn't block the other.
    const [adResult, serviceStatusResult, detectionsResult] = await Promise.allSettled([
      getAnomalyDetectionParams(host),
      sshExec('/usr/sbin/anomaly-detection-start.sh status').then(parseAnomalyServiceStatus),
      getRecentDetections(host),
    ]);

    if (adResult.status !== 'fulfilled') throw adResult.reason;
    const { params, raw, events: liveEvents } = adResult.value;

    // Archive whatever's currently visible over SNMP, then serve the
    // archive (newest first) instead of the raw live events -- this is
    // what protects the dashboard from the device's 1024-byte
    // tinnoHistoricalRebootReason truncation silently dropping newly
    // detected anomalies once the log grows past that size.
    const events = await archiveAnomalyEvents(liveEvents);

    const serviceStatus = serviceStatusResult.status === 'fulfilled'
      ? serviceStatusResult.value
      : { daemonRunning: null, agentRunning: null, socketPresent: null, error: String(serviceStatusResult.reason?.message || serviceStatusResult.reason) };

    // Dedicated, agent-only detection history (anomalies.csv via SSH) --
    // separate from `events` (reboot_log.txt/SNMP), which is still fetched
    // above and used only for the Current Anomaly panel's kill/log status,
    // since that information genuinely only exists in remediate.py's log.
    const detections = detectionsResult.status === 'fulfilled' ? detectionsResult.value : [];
    if (detectionsResult.status !== 'fulfilled') {
      console.error('Failed to fetch recent detections:', detectionsResult.reason);
    }

    const anomalyCount = parseInt(params.tinnoADAnomalyCount, 10) || 0;
    const cpuThreshold = parseInt(params.tinnoADNewProcCPUThreshold, 10) || 0;
    const memThreshold = parseInt(params.tinnoADNewProcMemThreshold, 10) || 0;

    res.json({
      params,
      raw,
      events,
      detections,
      serviceStatus,
      enabled: raw.tinnoADEnable === 1 || raw.tinnoADEnable === '1',
      correctiveActionEnabled: raw.tinnoADCorrectiveActionEnable === 1 || raw.tinnoADCorrectiveActionEnable === '1',
      anomalyCount,
      cpuThreshold,
      memThreshold,
      currentTarget: {
        cmd: params.tinnoADProcessCMD,
        pid: params.tinnoADProcessID,
        timestamp: params.tinnoADProcessTimestamp,
        cpuUsage: params.tinnoADCPUUsage,
        memUsage: params.tinnoADMemUsage,
        cpuAvg: params.tinnoADCPUAvg,
        cpuMin: params.tinnoADCPUMin,
        cpuMax: params.tinnoADCPUMax,
        memAvg: params.tinnoADMemAvg,
        memMin: params.tinnoADMemMin,
        memMax: params.tinnoADMemMax,
      },
    });
  } catch (err) {
    console.error('GET /api/anomaly-detection failed:', err);
    res.status(500).json({ error: `SNMP error: ${err.message}` });
  }
});

// API: Fetch Network Quality Status (discard counters from the gateway, Voice DQoS from the eMTA)
app.get('/api/network-quality', async (req, res) => {
  try {
    const host = sshConfig.host;
    const networkQuality = await getNetworkQuality(host);
    res.json(networkQuality);
  } catch (err) {
    console.error('GET /api/network-quality failed:', err);
    res.status(500).json({ error: `SNMP error: ${err.message}` });
  }
});

// API: Configure a self-heal parameter via SNMP SET
app.post('/api/configure', async (req, res) => {
  const { param, value } = req.body;
  if (!param || value === undefined || value === null || value === '') {
    return res.status(400).json({ error: 'Missing param or value' });
  }
  if (!OID_LIST[param]) return res.status(400).json({ error: `Unknown parameter: ${param}` });

  const type = PARAM_TYPES[param] || snmp.ObjectType.OctetString;
  const setValue = coerceWriteValue(param, type, value);
  if (type === snmp.ObjectType.Integer && Number.isNaN(setValue)) {
    return res.status(400).json({ error: `"${value}" is not a valid value for ${param}` });
  }

  try {
    const host = sshConfig.host;
    const oid = resolveOid(OID_LIST[param]);

    await snmpSet(host, oid, type, setValue);
    const updatedRaw = await snmpGet(host, oid);
    res.json({ success: true, updatedValue: formatValue(param, updatedRaw) });
  } catch (err) {
    console.error(`POST /api/configure failed for ${param}=${value}:`, err);
    res.status(500).json({ error: `SNMP error: ${err.message}` });
  }
});

// API: Fetch historical stats
app.get('/api/stats', async (req, res) => {
  try {
    const cpuStats = await loadStats('cpu_stats.json');
    const memoryStats = await loadStats('memory_stats.json');
    const tempStats = await loadStats('temp_stats.json');
    res.json({ cpuStats, memoryStats, tempStats });
  } catch (err) {
    res.status(500).json({ error: `File read error: ${err.message}` });
  }
});

// API: Fetch LCM data (dmcli backend)
app.get('/api/lcm', async (req, res) => {
  try {
    // Prevent nginx/browser from caching this — data changes after install/start/stop
    res.set('Cache-Control', 'no-store');
    const output = await sshExec('dmcli eRT getv Device.SoftwareModules.');

    if (!output.includes('Parameter') || !output.includes('SoftwareModules')) {
      throw new Error('dmcli returned no SoftwareModules data: ' + output.slice(0, 200));
    }

    const flat = parseDmcliOutput(output);

    // Discover actual instance indices from flat keys instead of assuming 1..N
    function discoverIndices(prefix) {
      // prefix e.g. "SoftwareModules.ExecutionUnit."
      // keys look like "SoftwareModules.ExecutionUnit.2.Status"
      const indices = new Set();
      for (const k of Object.keys(flat)) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);       // "2.Status"
          const idx = rest.split('.')[0];             // "2"
          if (/^\d+$/.test(idx)) indices.add(idx);
        }
      }
      return [...indices].sort((a, b) => parseInt(a) - parseInt(b));
    }

    function extractInstance(prefix) {
      // prefix e.g. "SoftwareModules.ExecutionUnit.2."
      const obj = {};
      for (const [k, v] of Object.entries(flat)) {
        if (k.startsWith(prefix)) {
          obj[k.slice(prefix.length)] = v;
        }
      }
      return obj;
    }

    const softwareModules = {
      ExecutionUnitNumberOfEntries:  flat['SoftwareModules.ExecutionUnitNumberOfEntries']  || '0',
      ExecEnvNumberOfEntries:        flat['SoftwareModules.ExecEnvNumberOfEntries']        || '0',
      DeploymentUnitNumberOfEntries: flat['SoftwareModules.DeploymentUnitNumberOfEntries'] || '0',
      NetworkConfig: {
        DefaultBridge:        flat['SoftwareModules.NetworkConfig.DefaultBridge']        || '',
        DefaultFirewallChain: flat['SoftwareModules.NetworkConfig.DefaultFirewallChain'] || '',
      },
    };

    // Use discovered indices — handles gaps like [2], [1,3], etc.
    const execEnvIndices    = discoverIndices('SoftwareModules.ExecEnv.');
    const execUnitIndices   = discoverIndices('SoftwareModules.ExecutionUnit.');
    const deployUnitIndices = discoverIndices('SoftwareModules.DeploymentUnit.');

    const execEnvs = execEnvIndices.map(i =>
      extractInstance(`SoftwareModules.ExecEnv.${i}.`)
    );
    
    const executionUnits = execUnitIndices.map(i => ({
      _instanceIndex: i,                                    
      ...extractInstance(`SoftwareModules.ExecutionUnit.${i}.`),
    }));

    const deploymentUnits = deployUnitIndices.map(i => ({
      _instanceIndex: i,
      ...extractInstance(`SoftwareModules.DeploymentUnit.${i}.`),
   }));

    const containerLibrary = await loadData('containers.json');

    res.json({
      SoftwareModules:  softwareModules,
      ExecEnvs:         execEnvs,
      ExecutionUnits:   executionUnits,
      DeploymentUnits:  deploymentUnits,
      ContainerLibrary: containerLibrary,
    });

  } catch (err) {
    res.status(500).json({ error: `LCM error: ${err.message}` });
  }
});

// API: Add container to library
app.post('/api/lcm/add', async (req, res) => {
  const { url, name, description, vendor, version, autostart } = req.body;
  if (!url || !name) return res.status(400).json({ error: 'URL and name are required' });

  try {
    const containerLibrary = await loadData('containers.json');
    const newContainer = {
      url,
      name,
      description: description || '',
      vendor: vendor || '',
      version: version || '',
      autostart: autostart || false, // Default to false if not provided
      uuid: Date.now().toString(), // Simple UUID generation based on timestamp
      addedAt: new Date().toISOString(),
    };
    containerLibrary.push(newContainer);
    await saveData('containers.json', containerLibrary);
    console.log(`Added container: ${name}, UUID: ${newContainer.uuid}, Autostart: ${newContainer.autostart}`);
    res.json({ success: true, message: 'Container added to library', container: newContainer });
  } catch (err) {
    res.status(500).json({ error: `Failed to add container: ${err.message}` });
  }
});

// API: Delete container from library (simulated)
app.post('/api/lcm/delete', async (req, res) => {
  const { name } = req.body;
  try {
    let containerLibrary = await loadData('containers.json');
    const initialLength = containerLibrary.length;
    containerLibrary = containerLibrary.filter(c => c.name !== name);
    
    if (containerLibrary.length === initialLength) {
      return res.status(404).json({ error: 'Container not found' });
    }
    
    await saveData('containers.json', containerLibrary);
    console.log(`Deleted container: ${name}`);
    res.json({ success: true, message: 'Container deleted from library' });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete container: ${err.message}` });
  }
});

// API: Install container on device
app.post('/api/lcm/install', async (req, res) => {
  const { url, uuid, name, autostart } = req.body;
  try {
    const line1 = `method_values Device.SoftwareModules.InstallDU() URL string ${url} UUID string ${uuid} ExecutionEnvRef string generic NumRequiredUIDs uint32 10 Privileged boolean true`;

    const writeCommand = `printf '${line1}\\nquit\\n' > /tmp/du.txt`;
    await sshExec(writeCommand);

    const verify = await sshExec('cat /tmp/du.txt');
    console.log(`/tmp/du.txt content:\n${verify}`);

    const installOutput = await sshExec('rbuscli -i < /tmp/du.txt');
    console.log(`InstallDU output for ${name} (${uuid}):\n${installOutput}`);

    if (
      installOutput.toLowerCase().includes('invalid') ||
      installOutput.toLowerCase().includes('error') ||
      installOutput.toLowerCase().includes('failed')
    ) {
      throw new Error(`rbuscli reported failure: ${installOutput}`);
    }

    console.log(`Installed container: ${name} with UUID: ${uuid}`);

    // Wait for cthulhu to activate the container
    await new Promise(resolve => setTimeout(resolve, 5000));

    const restartOutput = await sshExec('/etc/init.d/timingila restart');
    console.log(`timingila restart: ${restartOutput}`);

    // Give timingila time to re-index TR-181 instances
    await new Promise(resolve => setTimeout(resolve, 2000));

    // --- Autostart handling ---
    // Container always comes up Active after install.
    // If autostart is false, stop it now to bring it to Idle.
    if (autostart !== true) {
      console.log(`Autostart is false for ${name} — stopping container after install...`);

      // Discover the new ExecutionUnit index by matching UUID in the flat dmcli output
      const dmcliOutput = await sshExec('dmcli eRT getv Device.SoftwareModules.');
      const flat = parseDmcliOutput(dmcliOutput);

      // Find the EU index whose UUID field matches what we just installed
      // ExecEnvLabel on the EU matches the DUID on the DU, both derived from the UUID we passed
      // The simplest match: find an EU whose EUID appears in keys and whose parent DU has our UUID
      let newUnitIndex = null;
      for (const [k, v] of Object.entries(flat)) {
        // Look for DeploymentUnit.N.UUID = our uuid
        const duUuidMatch = k.match(/^SoftwareModules\.DeploymentUnit\.(\d+)\.UUID$/);
        if (duUuidMatch && v === uuid) {
          const duIdx = duUuidMatch[1];
          // DUID of this DU
          const duid = flat[`SoftwareModules.DeploymentUnit.${duIdx}.DUID`] || '';
          // Find the EU whose EUID matches this DUID
          for (const [ek] of Object.entries(flat)) {
            const euEuidMatch = ek.match(/^SoftwareModules\.ExecutionUnit\.(\d+)\.EUID$/);
            if (euEuidMatch && flat[ek] === duid) {
              newUnitIndex = euEuidMatch[1];
              break;
            }
          }
          break;
        }
      }

      if (newUnitIndex) {
        console.log(`Found new ExecutionUnit.${newUnitIndex} — sending Idle request...`);

        const stopLine = `method_values Device.SoftwareModules.ExecutionUnit.${newUnitIndex}.SetRequestedState() RequestedState string Idle`;
        await sshExec(`printf '${stopLine}\\nquit\\n' > /tmp/stop.txt`);
        const stopOutput = await sshExec('rbuscli -i < /tmp/stop.txt');
        console.log(`Post-install stop output: "${stopOutput}"`);

        // Poll until Idle
        let status = 'unknown';
        for (let attempt = 1; attempt <= 8; attempt++) {
          await new Promise(r => setTimeout(r, 2000));
          const checkOutput = await sshExec(`dmcli eRT getv Device.SoftwareModules.ExecutionUnit.${newUnitIndex}.Status`);
          const checkFlat   = parseDmcliOutput(checkOutput);
          status = checkFlat[`SoftwareModules.ExecutionUnit.${newUnitIndex}.Status`] || 'unknown';
          console.log(`Post-install stop poll ${attempt}/8: ExecutionUnit.${newUnitIndex}.Status = ${status}`);
          if (status === 'Idle') break;
        }

        console.log(`Container ${name} post-install status: ${status}`);
      } else {
        console.warn(`Could not find ExecutionUnit for UUID ${uuid} — skipping post-install stop`);
      }
    } else {
      console.log(`Autostart is true for ${name} — leaving container Active`);
    }

    res.json({ success: true, message: `Container ${name} installed successfully` });

  } catch (err) {
    console.error(`Install failed for ${name}:`, err.message);
    res.status(500).json({ error: `Failed to install container: ${err.message}` });
  }
});

// API: Stop container
app.post('/api/lcm/stop', async (req, res) => {
  const { unitIndex } = req.body;

  if (unitIndex === undefined || unitIndex === null) {
    return res.status(400).json({ success: false, error: 'unitIndex is required' });
  }

  try {
    const line1 = `method_values Device.SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState() RequestedState string Idle`;
    await sshExec(`printf '${line1}\\nquit\\n' > /tmp/stop.txt`);
    
    const stopOutput = await sshExec('rbuscli -i < /tmp/stop.txt');
    console.log(`SetRequestedState(Idle) output for ExecutionUnit.${unitIndex}: "${stopOutput}"`);

    // Poll dmcli until status is Idle (cthulhu typically takes 3-8 seconds)
    let status = 'unknown';
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const checkOutput = await sshExec(`dmcli eRT getv Device.SoftwareModules.ExecutionUnit.${unitIndex}.Status`);
      const checkFlat   = parseDmcliOutput(checkOutput);
      status = checkFlat[`SoftwareModules.ExecutionUnit.${unitIndex}.Status`] || 'unknown';
      console.log(`Poll ${attempt}/8: ExecutionUnit.${unitIndex}.Status = ${status}`);
      if (status === 'Idle') break;
    }

    console.log(`ExecutionUnit.${unitIndex} final status: ${status}`);
    return res.json({ success: true, message: `Container stopped`, status });

  } catch (err) {
    console.error(`Failed to stop ExecutionUnit.${unitIndex}:`, err);
    return res.status(500).json({ success: false, error: `Failed: ${err?.message ?? String(err)}` });
  }
});

// POST /api/lcm/start
app.post('/api/lcm/start', async (req, res) => {
  const { unitIndex } = req.body;

  if (unitIndex === undefined || unitIndex === null) {
    return res.status(400).json({ success: false, error: 'unitIndex is required' });
  }

  try {
    const line1 = `method_values Device.SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState() RequestedState string Active`;
    await sshExec(`printf '${line1}\\nquit\\n' > /tmp/active.txt`);

    const startOutput = await sshExec('rbuscli -i < /tmp/active.txt');
    console.log(`SetRequestedState(Active) output for ExecutionUnit.${unitIndex}: "${startOutput}"`);

    // Poll until Active
    let status = 'unknown';
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const checkOutput = await sshExec(`dmcli eRT getv Device.SoftwareModules.ExecutionUnit.${unitIndex}.Status`);
      const checkFlat   = parseDmcliOutput(checkOutput);
      status = checkFlat[`SoftwareModules.ExecutionUnit.${unitIndex}.Status`] || 'unknown';
      console.log(`Poll ${attempt}/8: ExecutionUnit.${unitIndex}.Status = ${status}`);
      if (status === 'Active') break;
    }

    console.log(`ExecutionUnit.${unitIndex} final status: ${status}`);
    return res.json({ success: true, message: `Container started`, status });

  } catch (err) {
    console.error(`Failed to start ExecutionUnit.${unitIndex}:`, err);
    return res.status(500).json({ success: false, error: `Failed: ${err?.message ?? String(err)}` });
  }
});

// POST /api/lcm/stop
app.post('/api/lcm/stop', async (req, res) => {
  const { unitIndex } = req.body;

  if (unitIndex === undefined || unitIndex === null) {
    return res.status(400).json({ success: false, error: 'unitIndex is required' });
  }

  try {
    const line1 = `method_values Device.SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState() RequestedState string Idle`;
    await sshExec(`printf '${line1}\\nquit\\n' > /tmp/idle.txt`);

    const startOutput = await sshExec('rbuscli -i < /tmp/idle.txt');
    console.log(`SetRequestedState(Idle) output for ExecutionUnit.${unitIndex}: "${startOutput}"`);

    // Poll until Idle
    let status = 'unknown';
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const checkOutput = await sshExec(`dmcli eRT getv Device.SoftwareModules.ExecutionUnit.${unitIndex}.Status`);
      const checkFlat   = parseDmcliOutput(checkOutput);
      status = checkFlat[`SoftwareModules.ExecutionUnit.${unitIndex}.Status`] || 'unknown';
      console.log(`Poll ${attempt}/8: ExecutionUnit.${unitIndex}.Status = ${status}`);
      if (status === 'Idle') break;
    }

    console.log(`ExecutionUnit.${unitIndex} final status: ${status}`);
    return res.json({ success: true, message: `Container stopped`, status });

  } catch (err) {
    console.error(`Failed to stop ExecutionUnit.${unitIndex}:`, err);
    return res.status(500).json({ success: false, error: `Failed: ${err?.message ?? String(err)}` });
  }
});

// API: Uninstall container
app.post('/api/lcm/uninstall', async (req, res) => {
  const { unitIndex, deploymentIndex } = req.body;

  if (!unitIndex || !deploymentIndex) {
    return res.status(400).json({ success: false, error: 'unitIndex and deploymentIndex are required' });
  }

  try {
    // Step 1: Stop the ExecutionUnit first (must be Idle before uninstall)
    const stopLine = `method_values Device.SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState() RequestedState string Idle`;
    await sshExec(`printf '${stopLine}\\nquit\\n' > /tmp/stop.txt`);

    const stopOutput = await sshExec('rbuscli -i < /tmp/stop.txt');
    console.log(`SetRequestedState(Idle) for ExecutionUnit.${unitIndex}: "${stopOutput}"`);

    // Step 2: Poll until Idle before proceeding to uninstall
    let status = 'unknown';
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const checkOutput = await sshExec(`dmcli eRT getv Device.SoftwareModules.ExecutionUnit.${unitIndex}.Status`);
      const checkFlat   = parseDmcliOutput(checkOutput);
      status = checkFlat[`SoftwareModules.ExecutionUnit.${unitIndex}.Status`] || 'unknown';
      console.log(`Poll ${attempt}/8: ExecutionUnit.${unitIndex}.Status = ${status}`);
      if (status === 'Idle') break;
    }

    if (status !== 'Idle') {
      throw new Error(`ExecutionUnit.${unitIndex} did not reach Idle state (current: ${status})`);
    }

    // Step 3: Uninstall the DeploymentUnit
    const uninstallLine = `method_noargs Device.SoftwareModules.DeploymentUnit.${deploymentIndex}.Uninstall()`;
    await sshExec(`printf '${uninstallLine}\\nquit\\n' > /tmp/uninstall.txt`);

    const uninstallOutput = await sshExec('rbuscli -i < /tmp/uninstall.txt');
    console.log(`Uninstall output for DeploymentUnit.${deploymentIndex}: "${uninstallOutput}"`);

    if (
  uninstallOutput.includes('element name does not exist') ||
  uninstallOutput.includes('RBUS_ERROR') ||
  uninstallOutput.includes('failed') && uninstallOutput.includes('err:')
) {
  throw new Error(`rbuscli uninstall reported failure: ${uninstallOutput}`);
}

    console.log(`Uninstalled DeploymentUnit.${deploymentIndex}, stopped ExecutionUnit.${unitIndex}`);

    // Step 4: Wait for cthulhu to clean up then restart timingila
    await new Promise(r => setTimeout(r, 3000));
    const restartOutput = await sshExec('/etc/init.d/timingila restart');
    console.log(`timingila restart: ${restartOutput}`);
    await new Promise(r => setTimeout(r, 2000));

    res.json({ success: true, message: `DeploymentUnit.${deploymentIndex} uninstalled` });

  } catch (err) {
    console.error(`Uninstall failed:`, err.message);
    res.status(500).json({ success: false, error: `Failed to uninstall: ${err.message}` });
  }
});

app.post('/api/test-connection', async (req, res) => {
  const { host } = req.body;
  if (!host) return res.status(400).json({ error: 'Host is required' });

  const tempConfig = { ...sshConfig, host };
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', () => {
      conn.end();
      resolve(res.json({ success: true, message: 'Connection successful' }));
    }).on('error', (err) => {
      conn.end();
      reject(res.status(500).json({ error: `Connection failed: ${err.message}` }));
    }).connect(tempConfig);
  }).catch(err => err);
});

app.post('/api/update-ssh-host', async (req, res) => {
  const { host } = req.body;
  if (!host) return res.status(400).json({ error: 'Host is required' });

  sshConfig.host = host;
  console.log(`Updated SSH host to: ${host}`);
  res.json({ success: true, message: 'SSH host updated' });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});