import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Plus, Trash2, Check, Play } from 'lucide-react';
import axios from 'axios';

function LCMPage() {
  const [summary, setSummary] = useState({
    totalContainers: 0,
    activeContainers: 0,
    totalMemoryUsed: 0,
    totalCpuUsed: 0,
  });
  const [containers, setContainers] = useState([]);
  const [existingContainers, setExistingContainers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showInstallConfirm, setShowInstallConfirm] = useState(null);
  const [showStartConfirm, setShowStartConfirm] = useState(null);
  const [showStopConfirm, setShowStopConfirm] = useState(null);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [newContainer, setNewContainer] = useState({
    url: '',
    name: '',
    description: '',
    vendor: '',
    version: '',
  });
  const [usedUuids, setUsedUuids] = useState(new Set());

  useEffect(() => {
    fetchData();
  }, []);

const fetchData = async () => {
  try {
    const lcmResponse     = await axios.get(`/api/lcm?_=${Date.now()}`);
    const lcmData         = lcmResponse.data;
    const summaryResponse = await axios.get(`/api/summary?_=${Date.now()}`);
    const summaryData     = summaryResponse.data;

    const sm = lcmData.SoftwareModules || {};
    const totalContainers = parseInt(sm.ExecutionUnitNumberOfEntries || '0', 10);
    const executionUnits  = lcmData.ExecutionUnits  || [];
    const deploymentUnits = lcmData.DeploymentUnits || [];

    const field = (unit, leafName) => {
      const val = unit[leafName];
      return (val !== undefined && val !== null && val !== '') ? val : 'N/A';
    };

    const activeContainers = executionUnits.reduce((count, unit) => {
      return count + (field(unit, 'Status') === 'Active' ? 1 : 0);
    }, 0);

    const totalCpuUsed    = parseFloat(summaryData.cpuUsage?.replace('%', '') || '0');
    const totalMemoryUsed = parseFloat(summaryData.memoryUsage || '0');
    setSummary({ totalContainers, activeContainers, totalMemoryUsed, totalCpuUsed });

    const containersMap = new Map();

    // --- DeploymentUnits: key by DUID ---
    deploymentUnits.forEach((unit) => {
  const duid = field(unit, 'DUID') !== 'N/A' ? field(unit, 'DUID') : field(unit, 'UUID');
  if (duid === 'N/A') return;

  containersMap.set(duid, {
    unitIndex:        null,
    deploymentIndex:  unit._instanceIndex,  // ← "3", not containersMap.size+1
    index:            containersMap.size + 1, // display-only counter
    name:             field(unit, 'Name'),
    url:              field(unit, 'URL'),
    description:      field(unit, 'Description'),
    vendor:           field(unit, 'Vendor'),
    version:          field(unit, 'Version'),
    alias:            field(unit, 'Alias'),
    duid,
    installed:        field(unit, 'Installed') !== 'N/A'
                        ? field(unit, 'Installed')
                        : field(unit, 'CreationTime'),
    lastUpdate:       field(unit, 'LastUpdate'),
    deploymentStatus: field(unit, 'Status'),
    executionStatus:  'N/A',
    faultCode:        'N/A',
    faultMessage:     'N/A',
    uuid:             field(unit, 'UUID'),
  });
});

    // --- ExecutionUnits: merge by EUID matching DUID ---
    executionUnits.forEach((unit) => {
      // _instanceIndex is the real dmcli index ("2", "3", etc.) set by backend
      const realIndex = unit._instanceIndex;
      const euid = field(unit, 'EUID') !== 'N/A'
        ? field(unit, 'EUID')
        : field(unit, 'ExecEnvLabel');
      if (euid === 'N/A') return;

      const existing = containersMap.get(euid);
      if (existing) {
        existing.executionStatus = field(unit, 'Status');
        existing.unitIndex       = realIndex;   // ← real dmcli index for start/stop calls
        existing.faultCode       = field(unit, 'ExecutionFaultCode');
        existing.faultMessage    = field(unit, 'ExecutionFaultMessage');
      } else {
        // EU with no matching DU
        containersMap.set(euid, {
          unitIndex:        realIndex,
          index:            containersMap.size + 1,
          name:             field(unit, 'Name'),
          url:              'N/A',
          description:      field(unit, 'Description'),
          vendor:           field(unit, 'Vendor'),
          version:          field(unit, 'Version'),
          alias:            field(unit, 'Alias'),
          duid:             euid,
          installed:        'N/A',
          lastUpdate:       'N/A',
          deploymentStatus: 'N/A',
          executionStatus:  field(unit, 'Status'),
          faultCode:        field(unit, 'ExecutionFaultCode'),
          faultMessage:     field(unit, 'ExecutionFaultMessage'),
          uuid:             field(unit, 'EUID'),
        });
      }
    });

    const allContainers = [...containersMap.values()];

    // Debug log — remove once confirmed working
    console.log('Containers after merge:',
      allContainers.map(c => ({
        name: c.name,
        unitIndex: c.unitIndex,
        executionStatus: c.executionStatus,
        duid: c.duid,
      }))
    );

    setExistingContainers(allContainers);
    setContainers(lcmData.ContainerLibrary || []);

    const allUuids = new Set(
      allContainers.map(c => c.uuid).filter(uuid => uuid !== 'N/A')
    );
    setUsedUuids(allUuids);

  } catch (error) {
    console.error('Error fetching data:', error);
  }
};

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewContainer({
      ...newContainer,
      [name]: type === "checkbox" ? checked : value,
    });
  };


  const handleAddContainer = async (e) => {
    e.preventDefault();
    if (newContainer.name && newContainer.url) {
      try {
        const response = await axios.post('/api/lcm/add', newContainer);
        if (response.data.success) {
          setContainers([...containers, response.data.container]);
          setNewContainer({ url: '', name: '', description: '', vendor: '', version: '' });
          setShowAddForm(false);
          await fetchData();
        }
      } catch (err) {
        console.error('Error adding container:', err);
      }
    }
  };

const handleDeleteContainer = async (index) => {
  const container = containers[index];
  try {
    await axios.post('/api/lcm/delete', { name: container.name });
    const newContainers = containers.filter((_, i) => i !== index);
    setContainers(newContainers);
    setShowDeleteConfirm(null);
    await fetchData(); // Add this line to refresh all data
  } catch (err) {
    console.error('Error deleting container:', err);
  }
};

const handleInstallContainer = async (index) => {
  const container = containers[index];
  try {
    // Check by URL (dmcli value includes full docker:// URL so this still works)
    const isAlreadyInstalled = existingContainers.some(
      c => c.url !== 'N/A' && c.url === container.url
    );
    if (isAlreadyInstalled) {
      console.error(`Container ${container.name} is already installed on the device.`);
      setShowInstallConfirm(null);
      return;
    }

    // Generate UUID in the format cthulhu expects
    const generateUniqueLast12 = () =>
      Math.floor(Math.random() * 0x1000000000000)
        .toString(16)
        .padStart(12, '0');

    let newUuid = `00000000-0000-5000-b000-${generateUniqueLast12()}`;
    let attempts = 0;
    while (usedUuids.has(newUuid) && attempts < 100) {
      newUuid = `00000000-0000-5000-b000-${generateUniqueLast12()}`;
      attempts++;
    }
    if (attempts >= 100) throw new Error('Unable to generate a unique UUID after 100 attempts');

    usedUuids.add(newUuid);
    setUsedUuids(new Set(usedUuids));

    const response = await axios.post('/api/lcm/install', {
      url: container.url,
      uuid: newUuid,
      name: container.name,
      autostart: container.autostart ?? true,  // default autostart true
    });

    if (response.data.success) {
      console.log(`Container ${container.name} installed successfully.`);
      setContainers(prev => prev.filter((_, i) => i !== index));
      setShowInstallConfirm(null);
      await fetchData(); // re-poll dmcli to reflect new state
    }
  } catch (err) {
    console.error('Error installing container:', err);
    console.error(`Install failed: ${err.response?.data?.error || err.message}`);
  }
};

const handleStopContainer = async (index) => {
  try {
    const container = existingContainers[index];
    if (container.unitIndex === undefined || container.unitIndex === null) {
      console.warn("No unitIndex for container:", container.name);
      return;
    }

    // Optimistic update to 'Stopping...' while backend polls
    const optimistic = [...existingContainers];
    optimistic[index] = { ...optimistic[index], executionStatus: 'Stopping...' };
    setExistingContainers(optimistic);
    setShowStopConfirm(null);

    const response = await axios.post('/api/lcm/stop', { unitIndex: container.unitIndex });
    
    // Use confirmed status from backend poll, then full refresh
    if (response.data.status) {
      const confirmed = [...existingContainers];
      confirmed[index] = { ...confirmed[index], executionStatus: response.data.status };
      setExistingContainers(confirmed);
    }

    await fetchData(); // Full refresh to sync everything

  } catch (err) {
    console.error('Error stopping container:', err);
    await fetchData(); // Revert on failure
  }
};

const handleStartContainer = async (index) => {
  try {
    const container = existingContainers[index];
    if (container.unitIndex === undefined || container.unitIndex === null) {
      console.warn("No unitIndex for container:", container.name);
      return;
    }

    const optimistic = [...existingContainers];
    optimistic[index] = { ...optimistic[index], executionStatus: 'Starting...' };
    setExistingContainers(optimistic);
    setShowStartConfirm(null);

    const response = await axios.post('/api/lcm/start', { unitIndex: container.unitIndex });

    if (response.data.status) {
      const confirmed = [...existingContainers];
      confirmed[index] = { ...confirmed[index], executionStatus: response.data.status };
      setExistingContainers(confirmed);
    }

    await fetchData();

  } catch (err) {
    console.error('Error starting container:', err);
    await fetchData();
  }
};

const handleUninstallContainer = async (index) => {
  try {
    const container = existingContainers[index];

    console.log('Uninstall target:', {
      name:            container.name,
      unitIndex:       container.unitIndex,       // EU dmcli index e.g. "3"
      deploymentIndex: container.deploymentIndex, // DU dmcli index e.g. "3"
      displayIndex:    container.index,           // array counter — NOT used for dmcli
    });

    if (container.unitIndex === undefined || container.unitIndex === null) {
      console.warn("No unitIndex for container:", container.name);
      return;
    }
    if (container.deploymentIndex === undefined || container.deploymentIndex === null) {
      console.warn("No deploymentIndex for container:", container.name);
      return;
    }

    setShowUninstallConfirm(null);

    await axios.post('/api/lcm/uninstall', {
      unitIndex:       container.unitIndex,       // ← real EU index
      deploymentIndex: container.deploymentIndex, // ← real DU index, NOT container.index
    });

    await fetchData();

  } catch (err) {
    console.error('Error uninstalling container:', err);
    await fetchData();
  }
};

  const handleViewDetails = (container) => {
    setSelectedContainer(container);
  };

  const closePopup = () => {
    setSelectedContainer(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6 font-inter">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-2xl mb-8 border border-gray-100"
      >
        <h2 className="text-xl font-semibold mb-6 text-gray-800 flex items-center gap-3">
          <BarChart className="text-tinno-green-700" size={24} />
          Services Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Services', value: summary.totalContainers },
            { label: 'Active Services', value: summary.activeContainers },
            { label: 'Total Memory Used (%)', value: summary.totalMemoryUsed.toFixed(1) },
            { label: 'Total CPU Used (%)', value: summary.totalCpuUsed.toFixed(1) },
          ].map((item, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.05 }}
              className="p-4 bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 shadow-md text-center transition-all duration-300"
            >
              <p className="text-gray-600 text-xs font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{item.value}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-2xl mb-8 border border-gray-100"
      >
        <h2 className="text-xl font-semibold mb-6 text-gray-800 flex items-center justify-between">
          <span>Service Library</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors flex items-center gap-2 shadow-md"
          >
            <Plus size={16} />
            <span className="text-xs">Add Service</span>
          </motion.button>
        </h2>

        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-lg mb-4"
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Add New Service</h3>
            <form onSubmit={handleAddContainer} className="space-y-3">
              <input
                type="text"
                name="url"
                value={newContainer.url}
                onChange={handleInputChange}
                placeholder="URL (e.g., docker://registry-1.docker.io/...)"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tinno-green-600 focus:border-transparent transition text-sm"
                required
              />
              <input
                type="text"
                name="name"
                value={newContainer.name}
                onChange={handleInputChange}
                placeholder="Name"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tinno-green-600 focus:border-transparent transition text-sm"
                required
              />
              <input
                type="text"
                name="description"
                value={newContainer.description}
                onChange={handleInputChange}
                placeholder="Description"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tinno-green-600 focus:border-transparent transition text-sm"
              />
              <input
                type="text"
                name="vendor"
                value={newContainer.vendor}
                onChange={handleInputChange}
                placeholder="Vendor"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tinno-green-600 focus:border-transparent transition text-sm"
              />
              <input
                type="text"
                name="version"
                value={newContainer.version}
                onChange={handleInputChange}
                placeholder="Version"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tinno-green-600 focus:border-transparent transition text-sm"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="autostart"
                  checked={newContainer.autostart || false}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-tinno-green-600 focus:ring-tinno-green-600 border-gray-300 rounded"
                />
                <label className="text-sm text-gray-700">Autostart</label>
              </div>
              <div className="flex justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  className="px-4 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors shadow-md text-sm"
                >
                  Add
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition-colors shadow-md text-sm"
                >
                  Cancel
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {containers.map((container, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.03 }}
              className="p-4 bg-gradient-to-br from-white to-gray-100 rounded-xl border border-gray-200 shadow-lg transition-all duration-300 cursor-pointer"
              onClick={() => handleViewDetails(container)}
            >
              <h3 className="text-base font-semibold mb-3 text-gray-800">{`${container.name} - ${container.vendor}`}</h3>
              <div className="space-y-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(index); }}
                  className="w-full px-3 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                >
                  <Trash2 size={14} />
                  <span className="text-xs">Delete</span>
                </motion.button>
                {showDeleteConfirm === index && (
                  <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-700">Are you sure you want to delete {container.name}?</p>
                    <div className="mt-2 flex justify-end gap-1">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteContainer(index); }}
                        className="px-2 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 text-xs"
                      >
                        Yes
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                        className="px-2 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                      >
                        No
                      </motion.button>
                    </div>
                  </div>
                )}
                {!existingContainers.some(c => c.url === container.url) && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => { e.stopPropagation(); setShowInstallConfirm(index); }}
                    className="w-full px-3 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                  >
                    <Check size={14} />
                    <span className="text-xs">Add to Device</span>
                  </motion.button>
                )}
                {showInstallConfirm === index && (
                  <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs text-green-700">Are you sure you want to install {container.name}?</p>
                    <div className="mt-2 flex justify-end gap-1">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); handleInstallContainer(index); }}
                        className="px-2 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 text-xs"
                      >
                        Yes
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); setShowInstallConfirm(null); }}
                        className="px-2 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                      >
                        No
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
  className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-100"
>
  <h2 className="text-xl font-semibold mb-6 text-gray-800">Active Services</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {existingContainers.map((container, index) => (
      <motion.div
        key={container.duid || container.uuid || container.index} // Use unique identifier
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.03 }}
        className="p-4 bg-gradient-to-br from-white to-gray-100 rounded-xl border border-gray-200 shadow-lg transition-all duration-300 cursor-pointer relative"
        onClick={() => handleViewDetails(container)}
      >
        <div className="absolute top-2 left-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            container.executionStatus === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {container.executionStatus || 'N/A'}
          </span>
        </div>
        <div className="absolute top-2 right-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            container.deploymentStatus === 'Installed' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
          }`}>
            {container.deploymentStatus || 'N/A'}
          </span>
        </div>

        <h3 className="text-base font-semibold mt-2 mb-1 text-gray-800">{container.name}</h3>
        <p className="text-xs text-gray-600 mb-1">Vendor: {container.vendor || 'N/A'}</p>
        <p className="text-xs text-gray-600 mb-1">Version: {container.version || 'N/A'}</p>
        <div className="flex gap-1 mt-2">
          {container.executionStatus === 'Idle' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => { e.stopPropagation(); setShowStartConfirm(index); }}
              className="flex-1 px-2 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
            >
              <Play size={14} />
              <span className="text-xs">Start</span>
            </motion.button>
          )}
          {container.executionStatus === 'Active' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => { e.stopPropagation(); setShowStopConfirm(index); }}
              className="flex-1 px-2 py-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
            >
              <Trash2 size={14} />
              <span className="text-xs">Stop</span>
            </motion.button>
          )}
          {showStartConfirm === index && (
            <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-green-700">Are you sure you want to start {container.name}?</p>
              <div className="mt-2 flex justify-end gap-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); handleStartContainer(index); }}
                  className="px-1 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 text-xs"
                >
                  Yes
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); setShowStartConfirm(null); }}
                  className="px-1 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                >
                  No
                </motion.button>
              </div>
            </div>
          )}
          {showStopConfirm === index && (
            <div className="mt-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-700">Are you sure you want to stop {container.name}?</p>
              <div className="mt-2 flex justify-end gap-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); handleStopContainer(index); }}
                  className="px-1 py-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 text-xs"
                >
                  Yes
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); setShowStopConfirm(null); }}
                  className="px-1 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                >
                  No
                </motion.button>
              </div>
            </div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(index); }}
            className="flex-1 px-2 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
          >
            <Trash2 size={14} />
            <span className="text-xs">Delete</span>
          </motion.button>
          {showUninstallConfirm === index && (
            <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs text-red-700">Are you sure you want to delete {container.name}?</p>
              <div className="mt-2 flex justify-end gap-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); handleUninstallContainer(index); }}
                  className="px-1 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 text-xs"
                >
                  Yes
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(null); }}
                  className="px-1 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                >
                  No
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    ))}
  </div>
</motion.div>

      {selectedContainer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closePopup}
        >
          <motion.div
            initial={{ y: 50, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 50, scale: 0.9 }}
            className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-2xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-800">{selectedContainer.name}</h3>
            <div className="space-y-2 text-sm text-gray-700">
              {('alias' in selectedContainer && selectedContainer.alias !== undefined) ? (
                <>
                  <p><strong className="text-gray-900">URL:</strong> {selectedContainer.url || 'N/A'}</p>
                  <p><strong className="text-gray-900">Description:</strong> {selectedContainer.description || 'N/A'}</p>
                  <p><strong className="text-gray-900">Vendor:</strong> {selectedContainer.vendor || 'N/A'}</p>
                  <p><strong className="text-gray-900">Version:</strong> {selectedContainer.version || 'N/A'}</p>
                  <p><strong className="text-gray-900">Alias:</strong> {selectedContainer.alias || 'N/A'}</p>
                  <p><strong className="text-gray-900">DUID:</strong> {selectedContainer.duid || 'N/A'}</p>
                  <p><strong className="text-gray-900">Installed:</strong> {selectedContainer.installed || 'N/A'}</p>
                  <p><strong className="text-gray-900">Last Update:</strong> {selectedContainer.lastUpdate || 'N/A'}</p>
                  <p><strong className="text-gray-900">Execution Status:</strong> {selectedContainer.executionStatus || 'N/A'}</p>
                  <p><strong className="text-gray-900">Deployment Status:</strong> {selectedContainer.deploymentStatus || 'N/A'}</p>
                  <p><strong className="text-gray-900">UUID:</strong> {selectedContainer.uuid || 'N/A'}</p>
                </>
              ) : (
                <>
                  <p><strong className="text-gray-900">URL:</strong> {selectedContainer.url || 'N/A'}</p>
                  <p><strong className="text-gray-900">Description:</strong> {selectedContainer.description || 'N/A'}</p>
                  <p><strong className="text-gray-900">Vendor:</strong> {selectedContainer.vendor || 'N/A'}</p>
                  <p><strong className="text-gray-900">Version:</strong> {selectedContainer.version || 'N/A'}</p>
                </>
              )}
            </div>
            <div className="space-y-2 mt-4">
              {('alias' in selectedContainer && selectedContainer.alias !== undefined) ? (
                <>
                  {selectedContainer.executionStatus === 'Idle' && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); setShowStartConfirm(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                      className="w-full px-3 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                    >
                      <Play size={14} />
                      <span className="text-xs">Start</span>
                    </motion.button>
                  )}
                  {selectedContainer.executionStatus === 'Active' && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); setShowStopConfirm(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                      className="w-full px-3 py-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                    >
                      <Trash2 size={14} />
                      <span className="text-xs">Stop</span>
                    </motion.button>
                  )}
                  {showStartConfirm === existingContainers.findIndex(c => c.index === selectedContainer.index) && (
                    <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-green-700">Are you sure you want to start {selectedContainer.name}?</p>
                      <div className="mt-2 flex justify-end gap-1">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); handleStartContainer(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                          className="px-1 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 text-xs"
                        >
                          Yes
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); setShowStartConfirm(null); }}
                          className="px-1 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                        >
                          No
                        </motion.button>
                      </div>
                    </div>
                  )}
                  {showStopConfirm === existingContainers.findIndex(c => c.index === selectedContainer.index) && (
                    <div className="mt-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-xs text-yellow-700">Are you sure you want to stop {selectedContainer.name}?</p>
                      <div className="mt-2 flex justify-end gap-1">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); handleStopContainer(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                          className="px-1 py-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 text-xs"
                        >
                          Yes
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); setShowStopConfirm(null); }}
                          className="px-1 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                        >
                          No
                        </motion.button>
                      </div>
                    </div>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                    className="w-full px-3 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                  >
                    <Trash2 size={14} />
                    <span className="text-xs">Delete</span>
                  </motion.button>
                  {showUninstallConfirm === existingContainers.findIndex(c => c.index === selectedContainer.index) && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs text-red-700">Are you sure you want to delete {selectedContainer.name}?</p>
                      <div className="mt-2 flex justify-end gap-1">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); handleUninstallContainer(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                          className="px-1 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 text-xs"
                        >
                          Yes
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(null); }}
                          className="px-1 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                        >
                          No
                        </motion.button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={closePopup}
              className="mt-4 px-4 py-1 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors shadow-md text-sm"
            >
              Close
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default LCMPage;