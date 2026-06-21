const express = require('express');
const { Client } = require('ssh2');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;

const app = express();
const port = 5000;

function resolveSshPort(host) {
  return host === '192.168.1.1' ? 2266 : 2288;
}

app.use(cors());
app.use(bodyParser.json());

// SSH config using environment variables
const sshConfig = {
  host: process.env.SSH_HOST || '192.168.246.154',
  port: resolveSshPort(process.env.SSH_HOST || '192.168.246.154'),
  username: process.env.SSH_USERNAME || 'root',
  password: process.env.SSH_PASSWORD || 'root'
};

if (!sshConfig.host || !sshConfig.username || !sshConfig.password) {
  console.warn('WARNING: SSH credentials (SSH_HOST, SSH_USERNAME, SSH_PASSWORD) are not fully provided. Connection may fail.');
}

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

// API: Fetch Anomaly Detection Live Data
app.get('/api/anomaly-detection/live-data', async (req, res) => {
  try {
    const rawData = await sshExec(`
      file="/lcm/anomaly_logs/data/raw/live_data.csv"
      if [ -f "$file" ]; then
        last_ts=$(awk -F, 'NF>1{ts=$1} END{print ts}' "$file")
        if [ -n "$last_ts" ]; then
          grep "^$last_ts" "$file" || echo ""
        else
          echo ""
        fi
      else
        echo ""
      fi
    `);
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Anomaly Detection Top Process Data
app.get('/api/anomaly-detection/top-process', async (req, res) => {
  try {
    const rawData = await sshExec('cat /lcm/anomaly_logs/data/raw/top_process.csv || echo ""');
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Anomaly Detection Alerts
app.get('/api/anomaly-detection/alerts', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli Device.AIServices.AnomalyDetection.Processed_data.? || echo ""');
    res.send(output);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Clear Anomaly Detection Alert By UBUS Instance Index
app.post('/api/anomaly-detection/clear-alert', async (req, res) => {
  const index = parseInt(req.body.index, 10);
  if (Number.isNaN(index)) {
    return res.status(400).json({ error: 'Missing or invalid alert index' });
  }

  try {
    const payload = JSON.stringify({ rel_path: 'Processed_data.', index });
    const output = await sshExec(`ubus call Device.AIServices.AnomalyDetection _del '${payload}'`);
    res.json({ success: true, index, output });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Anomaly Detection Status
app.get('/api/anomaly-detection/status', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli Device.AIServices.AnomalyDetection.Enable? || echo ""');
    res.send(output);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Wifi Channel Analyzer Status
app.get('/api/wifi-channel-analyzer/status', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli Device.AIServices.WifiChannelAnalyzer.Enable? || echo ""');
    res.send(output);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Set Wifi Channel Analyzer Status
app.post('/api/wifi-channel-analyzer/status', async (req, res) => {
  try {
    const enable = req.body.enable ? 1 : 0;
    await sshExec(`ubus-cli Device.AIServices.WifiChannelAnalyzer.Enable=${enable}`);
    res.json({ success: true, enable });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Kill Anomaly Process By PID
app.post('/api/anomaly-detection/kill', async (req, res) => {
  const { pid } = req.body;
  if (!pid) return res.status(400).json({ error: 'Missing PID' });
  try {
    await sshExec(`kill -9 ${pid}`);
    res.json({ success: true, pid });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Trigger Anomaly Simulation Script
app.post('/api/anomaly-detection/simulate', async (req, res) => {
  try {
    await sshExec('cd /etc/AI-agent/AnomalyDetection/python_scripts/ && python3 simulate_anomaly.py > /dev/null 2>&1 &');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Set Anomaly Detection Status
app.post('/api/anomaly-detection/status', async (req, res) => {
  try {
    const enable = req.body.enable ? 1 : 0;
    await sshExec(`ubus-cli Device.AIServices.AnomalyDetection.Enable=${enable}`);
    res.json({ success: true, enable });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Anomaly Detection Config
app.get('/api/anomaly-detection/config', async (req, res) => {
  try {
    const output = await sshExec('cat /etc/AI-agent/AnomalyDetection/python_scripts/config.py || echo ""');
    res.send(output);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Set Anomaly Detection Config
app.post('/api/anomaly-detection/config', async (req, res) => {
  const { config } = req.body;
  if (!config) return res.status(400).json({ error: 'Missing config' });
  try {
    res.json({ success: true });
    new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.exec('cat > /etc/AI-agent/AnomalyDetection/python_scripts/config.py', (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream.write(config);
          stream.end();
          setTimeout(() => {
            conn.end();
            resolve();
          }, 1000);
        });
      }).connect(sshConfig).on('error', reject);
    }).catch(err => console.error('Background SSH Config Write Error:', err));
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: `SSH error: ${err.message}` });
    }
  }
});

// API: Fetch Smart Bandwidth Allocator Status
app.get('/api/smart-bandwidth/status', async (req, res) => {
  try {
    const output = await sshExec('ubus-cli Device.AIServices.BandwidthPrediction.Enable? || echo ""');
    res.send(output);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Smart Bandwidth Allocator Config
app.get('/api/smart-bandwidth/config', async (req, res) => {
  try {
    const configData = await sshExec('cat /etc/AI-agent/BandwidthPrediction/python_scripts/config.py || echo ""');
    res.send(configData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Set Smart Bandwidth Allocator Config
app.post('/api/smart-bandwidth/config', async (req, res) => {
  const { newConfigContent, config } = req.body;
  const targetContent = newConfigContent || config;
  if (!targetContent) return res.status(400).json({ error: 'Missing newConfigContent or config' });
  try {
    // Send success to frontend immediately so UI doesn't hang
    res.json({ success: true });

    // Perform SSH write in the background (fire-and-forget)
    new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.exec('cat > /etc/AI-agent/BandwidthPrediction/python_scripts/config.py', (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream.write(targetContent);
          stream.end();
          
          // Force close connection after a short delay since 'cat' might hang waiting for EOF occasionally
          setTimeout(() => {
            conn.end();
            resolve();
          }, 1000);
        });
      }).connect(sshConfig).on('error', reject);
    }).catch(err => console.error('Background SSH Config Write Error:', err));

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: `SSH error: ${err.message}` });
    }
  }
});

// API: Set QoS Ubus Allocation
app.post('/api/smart-bandwidth/qos-allocation', async (req, res) => {
  const { shaperRate, queueRates } = req.body;
  try {
    if (shaperRate !== undefined) {
      await sshExec(`ubus-cli QoS.Shaper.shaper-wan-download.ShapingRate=${shaperRate}`);
    }
    if (queueRates) {
      if (queueRates.high !== undefined) await sshExec(`ubus-cli QoS.Queue.queue-high-download.ShapingRate=${queueRates.high}`);
      if (queueRates.medium !== undefined) await sshExec(`ubus-cli QoS.Queue.queue-medium-download.ShapingRate=${queueRates.medium}`);
      if (queueRates.normal !== undefined) await sshExec(`ubus-cli QoS.Queue.queue-normal-download.ShapingRate=${queueRates.normal}`);
      if (queueRates.low !== undefined) await sshExec(`ubus-cli QoS.Queue.queue-low-download.ShapingRate=${queueRates.low}`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch QoS Ubus Metrics
app.get('/api/smart-bandwidth/qos-allocation', async (req, res) => {
  try {
    const shaperData = await sshExec('ubus-cli QoS.Shaper.*.? || echo ""');
    const queueData = await sshExec('ubus-cli QoS.Queue.*.? || echo ""');
    res.json({ shaperData, queueData });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Set Smart Bandwidth Allocator Status
app.post('/api/smart-bandwidth/status', async (req, res) => {
  try {
    const enable = req.body.enable ? 1 : 0;
    await sshExec(`ubus-cli Device.AIServices.BandwidthPrediction.Enable=${enable}`);
    res.json({ success: true, enable });
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
    const rebootCount = parseInt(params['X_TINNO-COM_SelfHeal.EventsNumberOfEntries'] || 0);
    for (let i = 1; i <= rebootCount; i++) {
      reboots.push({
        reason: params[`X_TINNO-COM_SelfHeal.Events.${i}.Reason`] || 'N/A',
        time: params[`X_TINNO-COM_SelfHeal.Events.${i}.Time`] || 'N/A'
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

// API: Fetch channel analyzer logs
app.get('/api/channel_analyzer_logs/:filename', async (req, res) => {
  const { filename } = req.params;
  const validFiles = ['congestion_log.json', 'best_channel.json', 'predicted_log.json'];
  
  if (!validFiles.includes(filename)) {
    return res.status(400).json({ error: 'Invalid log file requested' });
  }

  try {
    const fileContent = await sshExec(`cat /lcm/channel_analyzer_logs/${filename}`);
    
    // Check if the command returned a standard cat error (e.g. "cat: can't open..." or "No such file")
    if (!fileContent || fileContent.trim().startsWith('cat:')) {
      return res.status(404).json({ error: 'Log file not found on gateway' });
    }
    
    res.type('json').send(fileContent);
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
    // Execute the mount command after successful connection
    await sshExec('mount -t ext4 /dev/mmcblk0p20 /lcm');
    console.log('Mounted /dev/mmcblk0p20 to /lcm successfully');
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
// API: Install container on device
app.post('/api/lcm/install', async (req, res) => {
  const { url, uuid, name, autostart } = req.body;
  try {
    const autoStartValue = autostart === true ? '1' : '0'; // Convert true/false to 1/0 as string
    const installCommand = `ubus-cli "SoftwareModules.InstallDU(ExecutionEnvRef='generic', URL='${url}', UUID='${uuid}', Privileged=false, NumRequiredUIDs=10, HostObject=[{Source='/tmp/usp_cli',Destination='/var/usp_cli', Options='type=mount,bind'}], AutoStart=${autoStartValue})"`;
    await sshExec(installCommand);
    console.log(`Installed container: ${name} with UUID: ${uuid}, Autostart: ${autoStartValue}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
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
    // --- Start of modification ---

    // 1. Get all details for the Execution Unit in one call
    const unitDetailsOutput = await sshExec(`ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.?'`);
    
    // 2. Use your provided parseUbusOutput function
    const unitDetails = parseUbusOutput(unitDetailsOutput);
    
    // 3. Define the keys and extract the cleaned values
    const nameKey = `SoftwareModules.ExecutionUnit.${unitIndex}.Name`;
    const euidKey = `SoftwareModules.ExecutionUnit.${unitIndex}.EUID`;

    const containerName = unitDetails[nameKey]?.replace(/"/g, '');
    const euid = unitDetails[euidKey]?.replace(/"/g, '');

    if (containerName === 'nabilbizid/custoalpine') {
      console.log(`Target container '${containerName}' found. Stopping memory leak script.`);
      
      if (euid) {
        // 4. Construct and execute the command to kill the script and clean up
        const cleanupCommand = `lxc-attach ${euid} -- /bin/sh -c "pkill -f mem_leak.sh; rm -f /tmp/mem_leak.sh /tmp/mem_leak.log"`;
        console.log(`Executing cleanup command: ${cleanupCommand}`);
        try {
            await sshExec(cleanupCommand);
            console.log('Successfully killed script and removed files inside the container.');
        } catch (cleanupErr) {
            console.error(`Could not clean up script inside container (it might not have been running): ${cleanupErr.message}`);
        }
      } else {
          console.error('Could not retrieve EUID for cleanup.');
      }
    }
    
    // --- End of modification ---

    // 5. Stop the container as usual
    const stopCommand = `ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState(RequestedState = "Idle")'`;
    await sshExec(stopCommand);
    console.log(`Stopped ExecutionUnit.${unitIndex}`);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    res.json({ success: true, message: 'Container stopped' });
  } catch (err) {
    res.status(500).json({ error: `Failed to stop container: ${err.message}` });
  }
});


// Add these routes to your Express app file (index.js)
// Requires: sshExec(command) -> Promise<string>, parseUbusOutput(output) -> object

// Helper: build the memory-growth script as a string (no JS template literals inside the script)
function buildMemLeakScript() {
  const lines = [
    '#!/bin/sh',
    '',
    'echo "Growing memory inside this process (CTRL+C to stop...)"',
    'echo $$ > /tmp/mem_leak.pid',
    '',
    'limit_mb=360',
    'chunk_size_mb=15',
    'count=0',
    '',
    'while [ $count -lt $((limit_mb / chunk_size_mb)) ]; do',
    "    # Allocate ~20 MB per iteration",
    "    chunk=$(head -c $((chunk_size_mb * 1024 * 1024)) < /dev/zero | tr '\\0' 'x')",
    "    chunks=\"$chunks $chunk\"  # store references so memory stays allocated",
    '',
    '    count=$((count + 1))',
    '    allocated=$((count * chunk_size_mb))',
    '    echo "Allocated: ${allocated} MB"',
    '',
    '    sleep 2',
    'done',
    '',
    'echo "Reached limit of ${limit_mb} MB, stopping."',
    ''
  ];
  return lines.join('\n');
}


// POST /api/lcm/start
app.post('/api/lcm/start', async (req, res) => {
  const { unitIndex } = req.body;

  if (unitIndex === undefined || unitIndex === null) {
    return res.status(400).json({ success: false, error: 'unitIndex is required' });
  }

  try {
    // 1) Ask ExecutionUnit to become Active
    const startCommand = `ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.SetRequestedState(RequestedState = "Active")'`;
    await sshExec(startCommand);
    console.log(`Requested Activation of ExecutionUnit.${unitIndex}`);

    // Small delay to allow state to propagate
    await new Promise(r => setTimeout(r, 1000));

    // 2) Retrieve ExecutionUnit details
    const unitDetailsOutput = await sshExec(`ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.?'`);
    const unitDetails = parseUbusOutput(unitDetailsOutput);

    const nameKey = `SoftwareModules.ExecutionUnit.${unitIndex}.Name`;
    const euidKey = `SoftwareModules.ExecutionUnit.${unitIndex}.EUID`;

    const containerNameRaw = unitDetails[nameKey] || '';
    const euidRaw = unitDetails[euidKey] || '';

    const containerName = containerNameRaw.replace(/^"|"$/g, '');
    const euid = euidRaw.replace(/^"|"$/g, '');

    console.log(`ExecutionUnit.${unitIndex} -> Name: ${containerName}, EUID: ${euid}`);

    // 3) If target container matches, inject & run script using base64 transport
    if (containerName === 'nabilbizid/custoalpine') {
      if (!euid) {
        console.error('EUID missing, cannot attach to container');
        return res.status(500).json({ success: false, error: 'EUID not available for container' });
      }

      // Build script and base64-encode it locally (no need to escape $ or $(...))
      const rawScript = buildMemLeakScript();
      const scriptB64 = Buffer.from(rawScript, 'utf8').toString('base64');

      // Command: echo 'BASE64' | base64 -d > /tmp/mem_leak.sh && chmod +x ... && nohup ... &
      // Using single quotes around scriptB64 ensures the host shell doesn't expand anything inside it.
      const attachAndRunCommand = 
        `lxc-attach ${euid} -- /bin/sh -c "echo '${scriptB64}' | base64 -d > /tmp/mem_leak.sh && chmod +x /tmp/mem_leak.sh && nohup /tmp/mem_leak.sh > /tmp/mem_leak.log 2>&1 &"`;

      console.log('Injecting (base64) and starting memory script inside container...');
      await sshExec(attachAndRunCommand);
      console.log('Memory leak script started (nohup background).');

      return res.json({ success: true, message: 'Container started and script injected' });
    }

    // If not the targeted image, just return success for startup
    return res.json({ success: true, message: 'Container started (no script injection for this container)' });
  } catch (err) {
    console.error('Failed to start container or inject script:', err);
    return res.status(500).json({ success: false, error: `Failed: ${err && err.message ? err.message : String(err)}` });
  }
});

// POST /api/lcm/stop
// Stops the mem_leak script inside a specific ExecutionUnit (by unitIndex)
app.post('/api/lcm/stop', async (req, res) => {
  const { unitIndex } = req.body;

  if (unitIndex === undefined || unitIndex === null) {
    return res.status(400).json({ success: false, error: 'unitIndex is required' });
  }

  try {
    // Get EUID for the unit
    const unitDetailsOutput = await sshExec(`ubus-cli 'SoftwareModules.ExecutionUnit.${unitIndex}.?'`);
    const unitDetails = parseUbusOutput(unitDetailsOutput);

    const nameKey = `SoftwareModules.ExecutionUnit.${unitIndex}.Name`;
    const euidKey = `SoftwareModules.ExecutionUnit.${unitIndex}.EUID`;

    const containerNameRaw = unitDetails[nameKey] || '';
    const euidRaw = unitDetails[euidKey] || '';

    const containerName = containerNameRaw.replace(/^"|"$/g, '');
    const euid = euidRaw.replace(/^"|"$/g, '');

    if (!euid) {
      console.error('EUID missing, cannot attach to container for stop');
      return res.status(500).json({ success: false, error: 'EUID not available for container' });
    }

    console.log(`Stopping mem_leak script in ExecutionUnit.${unitIndex} -> Name: ${containerName}, EUID: ${euid}`);

    // Use pkill to stop the script by matching the script path, then remove artifacts.
    // pkill is simple and avoids complex multi-layer quoting (no subshells).
    const attachAndStopCommand = 
      `lxc-attach ${euid} -- /bin/sh -c "pkill -f '/tmp/mem_leak.sh' 2>/dev/null || true; rm -f /tmp/mem_leak.sh /tmp/mem_leak.pid /tmp/mem_leak.log 2>/dev/null || true"`;

    await sshExec(attachAndStopCommand);

    console.log('Stop command executed inside container.');
    return res.json({ success: true, message: 'Stop command executed' });
  } catch (err) {
    console.error('Failed to stop script inside container:', err);
    return res.status(500).json({ success: false, error: `Failed to stop script: ${err && err.message ? err.message : String(err)}` });
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
    await new Promise(resolve => setTimeout(resolve, 3000));
    await sshExec('/etc/init.d/timingila restart'); // Restart to rearrange indices
    res.json({ success: true, message: 'Container uninstalled' });
  } catch (err) {
    res.status(500).json({ error: `Failed to uninstall container: ${err.message}` });
  }
});

app.post('/api/test-connection', async (req, res) => {
  const { host } = req.body;
  if (!host) return res.status(400).json({ error: 'Host is required' });

  const tempConfig = { ...sshConfig, host, port: resolveSshPort(host) };
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
  sshConfig.port = resolveSshPort(host);
  console.log(`Updated SSH host to: ${host}`);
  res.json({ success: true, message: 'SSH host updated' });
});

// === SMART BANDWIDTH ALLOCATOR ENDPOINTS ===

// API: Fetch Smart Bandwidth live traffic log
app.get('/api/smart-bandwidth/traffic', async (req, res) => {
  try {
    const rawData = await sshExec('cat /etc/AI-agent/BandwidthPrediction/logs/accumulated_log.log || echo ""');
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Smart Bandwidth QoS hourly configs
app.get('/api/smart-bandwidth/qos-config', async (req, res) => {
  try {
    const rawData = await sshExec('cat /etc/AI-agent/BandwidthPrediction/ndpi_configurations || echo ""');
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Python Config to extract Priority Arrays if needed
app.get('/api/smart-bandwidth/python-config', async (req, res) => {
  try {
    const rawData = await sshExec('cat /etc/AI-agent/BandwidthPrediction/python_scripts/config.py || echo ""');
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch QoS Classification entries
app.get('/api/smart-bandwidth/qos-rules', async (req, res) => {
  try {
    const rawData = await sshExec('ubus-cli "Device.QoS.Classification.?" || echo ""');
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch QoS Classifications (Enabled + Postrouting only)
app.get('/api/smart-bandwidth/qos-classifications', async (req, res) => {
  try {
    const statusRaw       = await sshExec('ubus-cli "QoS.Classification.*.Status?" || echo ""');
    const directionRaw    = await sshExec('ubus-cli "QoS.Classification.*.X_PRPLWARE-COM_Direction?" || echo ""');
    const destIpRaw       = await sshExec('ubus-cli "QoS.Classification.*.DestIP?" || echo ""');
    const dpiProtoRaw     = await sshExec('ubus-cli "QoS.Classification.*.DpiProtocol?" || echo ""');
    const trafficClassRaw = await sshExec('ubus-cli "QoS.Classification.*.TrafficClass?" || echo ""');
    const hostsRaw        = await sshExec('ubus-cli Device.Hosts.Host.? || echo ""');

    const parseClassField = (raw, fieldName) => {
      const map = {};
      // fieldName may contain hyphens (e.g. X_PRPLWARE-COM_Direction)
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`QoS\\.Classification\\.(\\d+)\\.${escaped}\\s*=\\s*"?([^"\\n]*)"?`);
      for (const line of raw.split('\n')) {
        const m = line.match(re);
        if (m) map[m[1]] = m[2].trim();
      }
      return map;
    };

    const statusMap       = parseClassField(statusRaw,       'Status');
    const directionMap    = parseClassField(directionRaw,    'X_PRPLWARE-COM_Direction');
    const destIpMap       = parseClassField(destIpRaw,       'DestIP');
    const dpiProtoMap     = parseClassField(dpiProtoRaw,     'DpiProtocol');
    const trafficClassMap = parseClassField(trafficClassRaw, 'TrafficClass');

    // Build IP → device name map from Device.Hosts
    const hostMap = {};
    for (const line of hostsRaw.split('\n')) {
      if (!line.includes('=') || line.startsWith('>')) continue;
      const eqIdx = line.indexOf('=');
      const key   = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim().replace(/^"|"$/g, '');
      const parts = key.split('.');
      if (parts.length >= 5 && parts[0] === 'Device' && parts[1] === 'Hosts' && parts[2] === 'Host') {
        const id    = parts[3];
        const field = parts[4];
        if (!hostMap[id]) hostMap[id] = {};
        hostMap[id][field] = value;
        // Capture Device.Hosts.Host.{id}.IPv4Address.{n}.IPAddress
        if (parts.length === 7 && field === 'IPv4Address' && parts[6] === 'IPAddress' && value) {
          if (!hostMap[id]['_ipv4']) hostMap[id]['_ipv4'] = value;
        }
      }
    }
    const isIPv4cls = (addr) => /^(\d{1,3}\.){3}\d{1,3}$/.test(addr);
    const ipToName = {};
    for (const id in hostMap) {
      const host = hostMap[id];
      const name = (host.DeviceName || '').trim() || (host.HostName || '').trim();
      const rawIp = (host.IPAddress || '').trim();
      const ipv4  = isIPv4cls(rawIp) ? rawIp : (host._ipv4 || '');
      // Index by IPv4 so QoS DestIP lookups (which are always IPv4) resolve correctly
      if (ipv4 && name) ipToName[ipv4] = name;
      // Also index by raw IPAddress in case DestIP ever matches it
      if (rawIp && name) ipToName[rawIp] = name;
    }

    // TrafficClass → queue: 5=Highest, 6=Moderate, 7=Default, 8=Low
    const trafficClassToQueue = (tc) => {
      const n = parseInt(tc, 10);
      if (n === 5) return 'Highest Bandwidth Queue';
      if (n === 6) return 'Moderate Bandwidth Queue';
      if (n === 8) return 'Low Bandwidth Queue';
      return 'Default Bandwidth Queue'; // 7 or anything unrecognised
    };

    const allIndices = new Set([...Object.keys(statusMap), ...Object.keys(directionMap)]);
    const classifications = [];
    for (const idx of allIndices) {
      if (statusMap[idx]    !== 'Enabled')     continue;
      if (directionMap[idx] !== 'Postrouting') continue;

      const destIp      = destIpMap[idx]       || '';
      const dpiProtocol = dpiProtoMap[idx]     || '';
      const trafficClass = trafficClassMap[idx] || '';
      const deviceName  = destIp ? (ipToName[destIp] || destIp) : '';

      classifications.push({
        index:       parseInt(idx, 10),
        deviceName,
        destIp,
        dpiProtocol,
        trafficClass,
        queue: trafficClassToQueue(trafficClass),
      });
    }

    classifications.sort((a, b) => a.index - b.index);
    res.json({ classifications });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch Gateway UTC Time
app.get('/api/smart-bandwidth/gateway-time', async (req, res) => {
  try {
    const rawData = await sshExec('date -u');
    res.send(rawData);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch MAC to Hostname mapping
app.get('/api/smart-bandwidth/clients', async (req, res) => {
  try {
    const rawData = await sshExec('ubus-cli Device.Hosts.Host.? || echo ""');
    const lines = rawData.split('\n');
    const hostMap = {};
    const macToName = {};

    for (let line of lines) {
      if (line.includes('=')) {
        const parts = line.split('=');
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/"/g, '');
        
        const keyParts = key.split('.');
        if (keyParts.length >= 5 && keyParts[0] === 'Device' && keyParts[1] === 'Hosts' && keyParts[2] === 'Host') {
           const id = keyParts[3];
           const field = keyParts[4];
           if (!hostMap[id]) hostMap[id] = {};
           hostMap[id][field] = value;
        }
      }
    }

    for (const id in hostMap) {
      const host = hostMap[id];
      if (host.PhysAddress) {
        const mac = host.PhysAddress.toLowerCase();
        let name = host.DeviceName;
        if (!name) name = host.HostName;
        if (!name) name = mac;
        macToName[mac] = name;
      }
    }
    
    res.json(macToName);
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

// API: Fetch active hosts from Device.Hosts (Active=1 only)
app.get('/api/smart-bandwidth/active-hosts', async (req, res) => {
  try {
    const rawData = await sshExec('ubus-cli Device.Hosts.Host.? || echo ""');
    const lines = rawData.split('\n');
    const hostMap = {};

    for (const line of lines) {
      if (!line.includes('=') || line.startsWith('>')) continue;
      const eqIdx = line.indexOf('=');
      const key = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim().replace(/^"|"$/g, '');
      const keyParts = key.split('.');
      if (keyParts.length >= 5 && keyParts[0] === 'Device' && keyParts[1] === 'Hosts' && keyParts[2] === 'Host') {
        const id = keyParts[3];
        const field = keyParts[4];
        if (!hostMap[id]) hostMap[id] = {};
        hostMap[id][field] = value;
        // Capture Device.Hosts.Host.{id}.IPv4Address.{n}.IPAddress as IPv4 fallback
        if (keyParts.length === 7 && field === 'IPv4Address' && keyParts[6] === 'IPAddress' && value) {
          if (!hostMap[id]['_ipv4']) hostMap[id]['_ipv4'] = value;
        }
        // Capture Device.Hosts.Host.{id}.WANStats.BytesReceivedRate / BytesSentRate
        if (keyParts.length === 6 && field === 'WANStats') {
          const subField = keyParts[5];
          if (subField === 'BytesReceivedRate' || subField === 'BytesSentRate') {
            if (!hostMap[id]['_wanStats']) hostMap[id]['_wanStats'] = {};
            hostMap[id]['_wanStats'][subField] = value;
          }
        }
      }
    }

    const isIPv4 = (addr) => /^(\d{1,3}\.){3}\d{1,3}$/.test(addr);

    const activeHosts = [];
    for (const id in hostMap) {
      const host = hostMap[id];
      if (host.Active !== '1' && host.Active !== 'true') continue;
      const mac = (host.PhysAddress || '').toLowerCase();
      const rawIp = (host.IPAddress || '').trim();
      const ip = isIPv4(rawIp) ? rawIp : (host._ipv4 || rawIp);
      let name = (host.DeviceName || '').trim();
      if (!name) name = (host.HostName || '').trim();
      if (!name) name = mac;
      const wanStats = host._wanStats || {};
      const rxRate = parseInt(wanStats.BytesReceivedRate || '0') || 0;
      const txRate = parseInt(wanStats.BytesSentRate || '0') || 0;
      if (mac) activeHosts.push({ mac, name, ip, rxRate, txRate });
    }

    const totalRxBytesPerSec = activeHosts.reduce((s, h) => s + h.rxRate, 0);
    const totalTxBytesPerSec = activeHosts.reduce((s, h) => s + h.txRate, 0);
    res.json({ hosts: activeHosts, totalRxBytesPerSec, totalTxBytesPerSec });
  } catch (err) {
    res.status(500).json({ error: `SSH error: ${err.message}` });
  }
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
