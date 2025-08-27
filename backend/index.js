const express = require('express');
const { Client } = require('ssh2');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());


// SSH config using environment variables
const sshConfig = {
  host: process.env.SSH_HOST || '192.168.246.160', // Default to '192.168.246.157' if not provided
  port: 22,
  username: process.env.SSH_USERNAME || 'root',    // Default to 'root' if not provided
  password: process.env.SSH_PASSWORD || 'root'     // Default to 'root' if not provided
};

// Helper to execute SSH command and return output
function sshExec(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let data = '';
        stream.on('data', (chunk) => { data += chunk; });
        stream.stderr.on('data', (chunk) => { data += chunk; });
        stream.on('close', (code) => {
          conn.end();
          if (code !== 0) {
            console.log(`Command "${command}" failed with code ${code}, output: ${data}`);
          }
          resolve(data.trim());
        });
      });
    }).connect(sshConfig).on('error', reject);
  });
}

// Parse ubus-cli output into object (key: value, handles reboots)
function parseUbusOutput(output) {
  const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('>'));
  const result = {};
  lines.forEach(line => {
    if (line.includes('=')) {
      const [key, value] = line.split('=');
      result[key.trim()] = value.trim();
    } else if (line.endsWith('.')) {
      // Handle reboot entries like X_TINNO-COM_SelfHeal.Reboot.1.
    }
  });
  return result;
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

// API: Fetch device summary
app.get('/api/summary', async (req, res) => {
  try {
    // Basic device info
    const hostname = await sshExec('cat /proc/sys/kernel/hostname');
    const uptime = await sshExec('uptime -p || uptime | cut -d"," -f1 | cut -d" " -f3-');
    const cpuUsage = await sshExec('awk \'/^cpu / {usage=($2+$4)*100/($2+$4+$5); printf "%.1f%%\\n", usage}\' /proc/stat');
    const memoryUsage = await sshExec('free | awk \'/Mem:/ {print int($3*100/$2) "%"}\'');
    const ipAddress = await sshExec('ip route get 8.8.8.8 | awk \'{print $7; exit}\'');
    const macAddress = await sshExec('cat /sys/class/net/$(ip route show default | awk \'/default/ {print $5}\')/address');
    const defaultGateway = await sshExec('ip route | grep default | awk \'{print $3}\' | head -1');
    const dnsServers = await sshExec('cat /etc/resolv.conf | grep nameserver | awk \'{print $2}\' | tr \'\\n\' \', \' | sed \'s/,$//\'');

    // Advanced info
    const firmwareVersion = await sshExec('cat /etc/openwrt_release | grep DISTRIB_RELEASE | cut -d"\'" -f2 || uname -r');
    const deviceModelRaw = await sshExec('cat /proc/device-tree/model');
    const deviceModel = deviceModelRaw ? deviceModelRaw.trim() : 'N/A';
    const manufacturer = await sshExec('cat /proc/device-tree/compatible | cut -d, -f1 || echo "Unknown"');

    // Update stats files
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

    // Add temperature (assuming a thermal zone file exists, adjust path if needed)
    const tempRaw = await sshExec('cat /sys/class/thermal/thermal_zone0/temp || echo 0');
    const tempCelsius = parseInt(tempRaw) / 1000 || 0; // Convert millidegrees to degrees
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

// API: Fetch all selfheal params and reboots
app.get('/api/selfheal', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli X_TINNO-COM_SelfHeal.?');
    const params = parseUbusOutput(output);

    // Extract reboot logs
    const reboots = [];
    const rebootCount = parseInt(params['X_TINNO-COM_SelfHeal.RebootNumberOfEntries'] || 0);
    for (let i = 1; i <= rebootCount; i++) {
      reboots.push({
        reason: params[`X_TINNO-COM_SelfHeal.Reboot.${i}.Reason`] || 'N/A',
        time: params[`X_TINNO-COM_SelfHeal.Reboot.${i}.Time`] || 'N/A'
      });
    }

    // Get last reboot details
    const lastReboot = reboots.length > 0 ? reboots[reboots.length - 1] : { reason: 'N/A', time: 'N/A' };

    // Add avgCpuThreshold and avgMemoryThreshold
    const avgCpuThreshold = parseInt(params['X_TINNO-COM_SelfHeal.AvgCPUThreshold'] || 0);
    const avgMemoryThreshold = parseInt(params['X_TINNO-COM_SelfHeal.AvgMemoryThreshold'] || 0);

    res.json({
      params,
      reboots,
      lastRebootReason: lastReboot.reason,
      lastRebootTime: lastReboot.time,
      rebootCount: rebootCount,
      avgCpuThreshold,
      avgMemoryThreshold,
    });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Configure a parameter
app.post('/api/configure', async (req, res) => {
  const { param, value } = req.body;
  if (!param || !value) return res.status(400).json({ error: 'Missing param or value' });

  try {
    const output = await sshExec(`ubus-cli ${param}=${value}`);
    const updated = await sshExec(`ubus-cli ${param}?`); // Verify
    res.json({ success: true, updatedValue: updated.split('=')[1]?.trim() });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// New API to fetch historical stats
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

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});