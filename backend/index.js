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
  host: process.env.SSH_HOST || '192.168.246.151',
  port: 22,
  username: process.env.SSH_USERNAME || 'root',
  password: process.env.SSH_PASSWORD || 'root'
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

// Parse ubus-cli output into object
function parseUbusOutput(output) {
  const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('>'));
  const result = {};
  lines.forEach(line => {
    if (line.includes('=')) {
      const [key, value] = line.split('=');
      result[key.trim()] = value.trim();
      console.log(`Parsed: ${key.trim()} = ${value.trim()}`); // Debug log
    }
  });
  return result;
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

// API: Fetch device summary
app.get('/api/summary', async (req, res) => {
  try {
    const hostname = await sshExec('cat /proc/sys/kernel/hostname');
    const uptime = await sshExec('uptime -p || uptime | cut -d"," -f1 | cut -d" " -f3-');
    const cpuUsage = await sshExec('awk \'/^cpu / {usage=($2+$4)*100/($2+$4+$5); printf "%.1f%%\\n", usage}\' /proc/stat');
    const memoryUsage = await sshExec('free | awk \'/Mem:/ {print int($3*100/$2) "%"}\'');
    const ipAddress = await sshExec('ip route get 8.8.8.8 | awk \'{print $7; exit}\'');
    const macAddress = await sshExec('cat /sys/class/net/$(ip route show default | awk \'/default/ {print $5}\')/address');
    const defaultGateway = await sshExec('ip route | grep default | awk \'{print $3}\' | head -1');
    const dnsServers = await sshExec('cat /etc/resolv.conf | grep nameserver | awk \'{print $2}\' | tr \'\\n\' \', \' | sed \'s/,$//\'');

    const firmwareVersion = await sshExec('cat /etc/openwrt_release | grep DISTRIB_RELEASE | cut -d"\'" -f2 || uname -r');
    const deviceModelRaw = await sshExec('cat /proc/device-tree/model');
    const deviceModel = deviceModelRaw ? deviceModelRaw.trim() : 'N/A';
    const manufacturer = await sshExec('cat /proc/device-tree/compatible | cut -d, -f1 || echo "Unknown"');

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

// API: Fetch all selfheal params and reboots
app.get('/api/selfheal', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli X_TINNO-COM_SelfHeal.?');
    console.log('Raw Selfheal Output:', output); // Debug log
    const params = parseUbusOutput(output);

    const reboots = [];
    const rebootCount = parseInt(params['X_TINNO-COM_SelfHeal.RebootNumberOfEntries'] || 0);
    for (let i = 1; i <= rebootCount; i++) {
      reboots.push({
        reason: params[`X_TINNO-COM_SelfHeal.Reboot.${i}.Reason`] || 'N/A',
        time: params[`X_TINNO-COM_SelfHeal.Reboot.${i}.Time`] || 'N/A'
      });
    }

    const lastReboot = reboots.length > 0 ? reboots[reboots.length - 1] : { reason: 'No History', time: 'No History' };

    const avgCpuThreshold = parseInt(params['X_TINNO-COM_SelfHeal.AvgCPUThreshold'] || 0);
    const avgMemoryThreshold = parseInt(params['X_TINNO-COM_SelfHeal.AvgMemoryThreshold'] || 0);
    const avgTemperatureThreshold = parseInt(params['X_TINNO-COM_SelfHeal.AvgTemperatureThreshold'] || 120);

    res.json({
      params,
      reboots,
      lastRebootReason: lastReboot.reason,
      lastRebootTime: lastReboot.time,
      rebootCount: rebootCount,
      avgCpuThreshold,
      avgMemoryThreshold,
      avgTemperatureThreshold,
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
    const updated = await sshExec(`ubus-cli ${param}?`);
    res.json({ success: true, updatedValue: updated.split('=')[1]?.trim() });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
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

// API: Fetch LCM data
app.get('/api/lcm', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli SoftwareModules.?');
    const data = parseUbusOutput(output);

    const executionUnits = [];
    const totalUnits = parseInt(data['SoftwareModules.ExecutionUnitNumberOfEntries'] || 0);
    for (let i = 1; i <= totalUnits; i++) {
      const unitOutput = await sshExec(`ubus-cli SoftwareModules.ExecutionUnit.${i}.?`);
      const unitData = parseUbusOutput(unitOutput);
      executionUnits.push(unitData);
    }

    const deploymentUnits = [];
    const totalDeployments = parseInt(data['SoftwareModules.DeploymentUnitNumberOfEntries'] || 0);
    for (let i = 1; i <= totalDeployments; i++) {
      const unitOutput = await sshExec(`ubus-cli SoftwareModules.DeploymentUnit.${i}.?`);
      const unitData = parseUbusOutput(unitOutput);
      deploymentUnits.push(unitData);
    }

    // Load container library
    const containerLibrary = await loadData('containers.json');

    res.json({
      SoftwareModules: data,
      ExecutionUnits: executionUnits,
      DeploymentUnits: deploymentUnits,
      ContainerLibrary: containerLibrary,
    });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Add container to library
app.post('/api/lcm/add', async (req, res) => {
  const { url, name, description, vendor, version } = req.body;
  if (!url || !name) return res.status(400).json({ error: 'URL and name are required' });

  try {
    const containerLibrary = await loadData('containers.json');
    const newContainer = {
      url,
      name,
      description: description || '',
      vendor: vendor || '',
      version: version || '',
      uuid: Date.now().toString(), // Simple UUID generation based on timestamp
      addedAt: new Date().toISOString(),
    };
    containerLibrary.push(newContainer);
    await saveData('containers.json', containerLibrary);
    console.log(`Added container: ${name}, UUID: ${newContainer.uuid}`);
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
    containerLibrary = containerLibrary.filter(c => c.name !== name);
    await saveData('containers.json', containerLibrary);
    console.log(`Deleted container: ${name}`);
    await sshExec('/etc/init.d/timingila restart'); // Restart to rearrange indices
    res.json({ success: true, message: 'Container deleted from library' });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete container: ${err.message}` });
  }
});

// API: Install container on device
app.post('/api/lcm/install', async (req, res) => {
  const { url, uuid, name } = req.body;
  try {
    const installCommand = `ubus-cli "SoftwareModules.InstallDU(ExecutionEnvRef='generic', URL='${url}', UUID='${uuid}', Privileged=false, NumRequiredUIDs=10, HostObject=[{Source='/tmp/usp_cli',Destination='/var/usp_cli', Options='type=mount,bind'}])"`;
    await sshExec(installCommand);
    console.log(`Installed container: ${name} with UUID: ${uuid}`);
    await sshExec('/etc/init.d/timingila restart'); // Restart to rearrange indices
    res.json({ success: true, message: 'Container installed on device' });
  } catch (err) {
    res.status(500).json({ error: `Failed to install container: ${err.message}` });
  }
});

// API: Stop container
app.post('/api/lcm/stop', async (req, res) => {
  const { unitIndex } = req.body;
  try {
    const stopCommand = `ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState(RequestedState = "Idle")'`;
    await sshExec(stopCommand);
    console.log(`Stopped ExecutionUnit.${unitIndex}`);
    res.json({ success: true, message: 'Container stopped' });
  } catch (err) {
    res.status(500).json({ error: `Failed to stop container: ${err.message}` });
  }
});

app.post('/api/lcm/start', async (req, res) => {
  const { unitIndex } = req.body;
  try {
    const startCommand = `ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState(RequestedState = "Active")'`;
    await sshExec(startCommand);
    console.log(`Started ExecutionUnit.${unitIndex}`);
    res.json({ success: true, message: 'Container started' });
  } catch (err) {
    res.status(500).json({ error: `Failed to start container: ${err.message}` });
  }
});

// API: Uninstall container
app.post('/api/lcm/uninstall', async (req, res) => {
  const { unitIndex, deploymentIndex } = req.body;
  try {
    const stopCommand = `ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState(RequestedState = "Idle")'`;
    const uninstallCommand = `ubus-cli 'SoftwareModules.DeploymentUnit.${deploymentIndex}.Uninstall()'`;
    await sshExec(stopCommand);
    await sshExec(uninstallCommand);
    console.log(`Uninstalled DeploymentUnit.${deploymentIndex} and stopped ExecutionUnit.${unitIndex}`);
    await sshExec('/etc/init.d/timingila restart'); // Restart to rearrange indices
    res.json({ success: true, message: 'Container uninstalled' });
  } catch (err) {
    res.status(500).json({ error: `Failed to uninstall container: ${err.message}` });
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