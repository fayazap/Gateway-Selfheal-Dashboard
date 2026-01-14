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
      const lcmResponse = await axios.get('/api/lcm');
      const lcmData = lcmResponse.data;
      const summaryResponse = await axios.get('/api/summary');
      const summaryData = summaryResponse.data;
      const totalContainers = parseInt(lcmData.SoftwareModules?.['SoftwareModules.ExecutionUnitNumberOfEntries']?.replace(/"/g, '') || '0');
      const executionUnits = lcmData.ExecutionUnits || [];
      const deploymentUnits = lcmData.DeploymentUnits || [];

      const activeContainers = executionUnits.reduce((count, unit) => {
        const statusKey = Object.keys(unit).find(key => key.endsWith('.Status'));
        return count + (statusKey && unit[statusKey]?.replace(/"/g, '') === 'Active' ? 1 : 0);
      }, 0);

      const totalCpuUsed = parseFloat(summaryData.cpuUsage?.replace('%', '') || '0');
      const totalMemoryUsed = parseFloat(summaryData.memoryUsage?.replace(/"/g, '') || '0');

      setSummary({ totalContainers, activeContainers, totalMemoryUsed, totalCpuUsed });

      const allContainers = [];
      const seenDuids = new Set();
      const containersMap = new Map();

      deploymentUnits.forEach(unit => {
        const duidKey = Object.keys(unit).find(key => key.endsWith('.DUID') || key.endsWith('.EUID'));
        const uuidKey = Object.keys(unit).find(key => key.endsWith('.UUID'));
        const nameKey = Object.keys(unit).find(key => key.endsWith('.Name'));
        const statusKey = Object.keys(unit).find(key => key.endsWith('.Status'));
        const urlKey = Object.keys(unit).find(key => key.endsWith('.URL'));
        const descriptionKey = Object.keys(unit).find(key => key.endsWith('.Description'));
        const vendorKey = Object.keys(unit).find(key => key.endsWith('.Vendor'));
        const versionKey = Object.keys(unit).find(key => key.endsWith('.Version'));
        const aliasKey = Object.keys(unit).find(key => key.endsWith('.Alias'));
        const installedKey = Object.keys(unit).find(key => key.endsWith('.Installed') || key.endsWith('.CreationTime'));
        const lastUpdateKey = Object.keys(unit).find(key => key.endsWith('.LastUpdate'));

        const duid = duidKey ? unit[duidKey]?.replace(/"/g, '') : uuidKey ? unit[uuidKey]?.replace(/"/g, '') : null;

        if (duid) {
          const containerData = {
            unitIndex: null,
            index: allContainers.length + 1,
            name: unit[nameKey]?.replace(/"/g, '') || 'Unnamed',
            url: urlKey ? unit[urlKey]?.replace(/"/g, '') : 'N/A',
            description: descriptionKey ? unit[descriptionKey]?.replace(/"/g, '') : 'N/A',
            vendor: vendorKey ? unit[vendorKey]?.replace(/"/g, '') : 'N/A',
            version: versionKey ? unit[versionKey]?.replace(/"/g, '') : 'N/A',
            alias: aliasKey ? unit[aliasKey]?.replace(/"/g, '') : 'N/A',
            duid: duid || 'N/A',
            installed: installedKey ? unit[installedKey]?.replace(/"/g, '') : 'N/A',
            lastUpdate: lastUpdateKey ? unit[lastUpdateKey]?.replace(/"/g, '') : 'N/A',
            deploymentStatus: statusKey ? unit[statusKey]?.replace(/"/g, '') : 'N/A',
            executionStatus: 'N/A',
            uuid: uuidKey ? unit[uuidKey]?.replace(/"/g, '') : 'N/A',
          };
          containersMap.set(duid, containerData);
          seenDuids.add(duid);
        }
      });

      executionUnits.forEach((unit, unitIdx) => {
        const duidKey = Object.keys(unit).find(key => key.endsWith('.DUID') || key.endsWith('.EUID'));
        const uuidKey = Object.keys(unit).find(key => key.endsWith('.UUID'));
        const nameKey = Object.keys(unit).find(key => key.endsWith('.Name'));
        const statusKey = Object.keys(unit).find(key => key.endsWith('.Status'));
        const aliasKey = Object.keys(unit).find(key => key.endsWith('.Alias'));
        const installedKey = Object.keys(unit).find(key => key.endsWith('.Installed') || key.endsWith('.CreationTime'));
        const lastUpdateKey = Object.keys(unit).find(key => key.endsWith('.LastUpdate'));

        const duid = duidKey ? unit[duidKey]?.replace(/"/g, '') : uuidKey ? unit[uuidKey]?.replace(/"/g, '') : null;

        if (duid) {
          let containerData = containersMap.get(duid);
          if (!containerData) {
            containerData = {
              unitIndex: unitIdx + 1,
              index: allContainers.length + 1,
              name: unit[nameKey]?.replace(/"/g, '') || 'Unnamed',
              url: 'N/A',
              description: 'N/A',
              vendor: 'N/A',
              version: 'N/A',
              alias: unit[aliasKey]?.replace(/"/g, '') || 'N/A',
              duid: duid || 'N/A',
              installed: unit[installedKey]?.replace(/"/g, '') || 'N/A',
              lastUpdate: lastUpdateKey ? unit[lastUpdateKey]?.replace(/"/g, '') : 'N/A',
              deploymentStatus: 'N/A',
              executionStatus: statusKey ? unit[statusKey]?.replace(/"/g, '') : 'N/A',
              uuid: uuidKey ? unit[uuidKey]?.replace(/"/g, '') : 'N/A',
            };
            seenDuids.add(duid);
          } else {
            containerData.executionStatus = statusKey ? unit[statusKey]?.replace(/"/g, '') : containerData.executionStatus;
            containerData.unitIndex = unitIdx + 1;
          }
          containersMap.set(duid, containerData);
        }
      });

      containersMap.forEach(value => allContainers.push(value));

      const newExistingContainers = allContainers;
      setExistingContainers(newExistingContainers);
      setContainers(lcmData.ContainerLibrary || []);

      const allUuids = new Set([
        ...newExistingContainers.map(c => c.uuid),
        ...containers.map(c => c.uuid),
      ].filter(uuid => uuid !== 'N/A' && uuid !== undefined));
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
      await fetchData();
    } catch (err) {
      console.error('Error deleting container:', err);
    }
  };

  const handleInstallContainer = async (index) => {
    const container = containers[index];
    try {
      const isAlreadyInstalled = existingContainers.some(c => c.url === container.url);
      if (isAlreadyInstalled) {
        alert(`Container ${container.name} is already installed on the device.`);
        setShowInstallConfirm(null);
        return;
      }

      const generateUniqueLast12 = () => Math.floor(Math.random() * 0x1000000000000).toString(16).padStart(12, '0');
      let newUuid = `00000000-0000-5000-b000-${generateUniqueLast12()}`;
      let attempts = 0;
      while (usedUuids.has(newUuid) && attempts < 100) {
        newUuid = `00000000-0000-5000-b000-${generateUniqueLast12()}`;
        attempts++;
      }
      if (attempts >= 100) throw new Error('Unable to generate a unique UUID after 100 attempts');

      usedUuids.add(newUuid);
      setUsedUuids(new Set(usedUuids));

      const response = await axios.post('/api/lcm/install', { url: container.url, uuid: newUuid, name: container.name });
      if (response.data.success) {
        const newContainers = containers.filter((_, i) => i !== index);
        setContainers(newContainers);
        setShowInstallConfirm(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Error installing container:', err);
    }
  };

  const handleStartContainer = async (index) => {
    try {
      const container = existingContainers[index];
      if (container.unitIndex) {
        await axios.post('/api/lcm/start', { unitIndex: container.unitIndex });
        setShowStartConfirm(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Error starting container:', err);
    }
  };

  const handleStopContainer = async (index) => {
    try {
      const container = existingContainers[index];
      if (container.unitIndex) {
        const updatedContainers = [...existingContainers];
        updatedContainers[index].executionStatus = 'Idle';
        setExistingContainers(updatedContainers);
        setShowStopConfirm(null);
        await axios.post('/api/lcm/stop', { unitIndex: container.unitIndex });
        await fetchData();
      }
    } catch (err) {
      console.error('Error stopping container:', err);
      await fetchData();
    }
  };

  const handleUninstallContainer = async (index) => {
    try {
      const container = existingContainers[index];
      if (container.unitIndex && container.index) {
        await axios.post('/api/lcm/uninstall', {
          unitIndex: container.unitIndex,
          deploymentIndex: container.index,
        });
        const newContainers = existingContainers.filter((_, i) => i !== index);
        setExistingContainers(newContainers);
        setShowUninstallConfirm(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Error uninstalling container:', err);
    }
  };

  const handleViewDetails = (container) => {
    setSelectedContainer(container);
  };

  const closePopup = () => {
    setSelectedContainer(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white/85 backdrop-blur-sm p-6 rounded-2xl shadow-xl mb-8 border border-blue-200/40"
      >
        <h2 className="text-xl font-semibold mb-6 text-[#1e40af] flex items-center gap-3">
          <BarChart className="text-blue-600" size={24} />
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
              whileHover={{ scale: 1.04 }}
              className="p-5 bg-white/70 backdrop-blur-sm rounded-xl border border-blue-100 shadow-md text-center transition-all"
            >
              <p className="text-blue-700 text-xs font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-2xl font-bold text-[#1e40af] mt-2">{item.value}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="bg-white/85 backdrop-blur-sm p-6 rounded-2xl shadow-xl mb-8 border border-blue-200/40"
      >
        <h2 className="text-xl font-semibold mb-6 text-[#1e40af] flex items-center justify-between">
          <span>Service Library</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-md text-sm font-medium"
          >
            <Plus size={16} />
            Add Service
          </motion.button>
        </h2>

        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-200/50 shadow-lg mb-6"
          >
            <h3 className="text-lg font-semibold mb-4 text-[#1e40af]">Add New Service</h3>
            <form onSubmit={handleAddContainer} className="space-y-4">
              <input
                type="text"
                name="url"
                value={newContainer.url}
                onChange={handleInputChange}
                placeholder="URL (e.g., docker://registry-1.docker.io/...)"
                className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition text-sm bg-white/70"
                required
              />
              <input
                type="text"
                name="name"
                value={newContainer.name}
                onChange={handleInputChange}
                placeholder="Name"
                className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition text-sm bg-white/70"
                required
              />
              <input
                type="text"
                name="description"
                value={newContainer.description}
                onChange={handleInputChange}
                placeholder="Description"
                className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition text-sm bg-white/70"
              />
              <input
                type="text"
                name="vendor"
                value={newContainer.vendor}
                onChange={handleInputChange}
                placeholder="Vendor"
                className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition text-sm bg-white/70"
              />
              <input
                type="text"
                name="version"
                value={newContainer.version}
                onChange={handleInputChange}
                placeholder="Version"
                className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition text-sm bg-white/70"
              />
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  name="autostart"
                  checked={newContainer.autostart || false}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                />
                <label className="text-sm text-blue-800">Autostart on boot</label>
              </div>
              <div className="flex justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md text-sm font-medium"
                >
                  Add Service
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors shadow-md text-sm font-medium"
                >
                  Cancel
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {containers.map((container, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.03 }}
              className="p-5 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-200/40 shadow-lg transition-all cursor-pointer hover:shadow-xl"
              onClick={() => handleViewDetails(container)}
            >
              <h3 className="text-base font-semibold mb-4 text-[#1e40af]">{`${container.name} - ${container.vendor}`}</h3>
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(index); }}
                  className="w-full px-4 py-2 bg-red-600/90 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-md text-sm"
                >
                  <Trash2 size={16} />
                  Delete from Library
                </motion.button>

                {showDeleteConfirm === index && (
                  <div className="mt-3 p-3 bg-red-50/80 backdrop-blur-sm rounded-lg border border-red-200/60">
                    <p className="text-sm text-red-800 mb-3">Delete {container.name} from library?</p>
                    <div className="flex justify-end gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteContainer(index); }}
                        className="px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                      >
                        Yes
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                        className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                      >
                        No
                      </motion.button>
                    </div>
                  </div>
                )}

                {!existingContainers.some(c => c.url === container.url) && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { e.stopPropagation(); setShowInstallConfirm(index); }}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-md text-sm"
                  >
                    <Check size={16} />
                    Install on Device
                  </motion.button>
                )}

                {showInstallConfirm === index && (
                  <div className="mt-3 p-3 bg-blue-50/80 backdrop-blur-sm rounded-lg border border-blue-200/60">
                    <p className="text-sm text-blue-800 mb-3">Install {container.name} on device?</p>
                    <div className="flex justify-end gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={(e) => { e.stopPropagation(); handleInstallContainer(index); }}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Yes
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={(e) => { e.stopPropagation(); setShowInstallConfirm(null); }}
                        className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
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
        className="bg-white/85 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-blue-200/40"
      >
        <h2 className="text-xl font-semibold mb-6 text-[#1e40af]">Active Services on Device</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {existingContainers.map((container, index) => (
            <motion.div
              key={container.duid || container.uuid || container.index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.03 }}
              className="p-5 bg-white/80 backdrop-blur-sm rounded-xl border border-blue-200/40 shadow-lg transition-all cursor-pointer hover:shadow-xl relative"
              onClick={() => handleViewDetails(container)}
            >
              <div className="absolute top-3 left-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  container.executionStatus === 'Active' 
                    ? 'bg-green-100 text-green-800 border border-green-200' 
                    : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                }`}>
                  {container.executionStatus || 'Unknown'}
                </span>
              </div>
              <div className="absolute top-3 right-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  container.deploymentStatus === 'Installed' 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-green-100 text-green-800 border border-green-200'
                }`}>
                  {container.deploymentStatus || 'N/A'}
                </span>
              </div>

              <h3 className="text-base font-semibold mt-10 mb-2 text-[#1e40af]">{container.name}</h3>
              <p className="text-sm text-blue-700 mb-1">Vendor: {container.vendor || 'N/A'}</p>
              <p className="text-sm text-blue-700 mb-4">Version: {container.version || 'N/A'}</p>

              <div className="flex flex-wrap gap-2 mt-3">
                {container.executionStatus === 'Idle' && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { e.stopPropagation(); setShowStartConfirm(index); }}
                    className="flex-1 min-w-[90px] px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm text-sm"
                  >
                    <Play size={14} />
                    Start
                  </motion.button>
                )}

                {container.executionStatus === 'Active' && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { e.stopPropagation(); setShowStopConfirm(index); }}
                    className="flex-1 min-w-[90px] px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm text-sm"
                  >
                    <Trash2 size={14} />
                    Stop
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(index); }}
                  className="flex-1 min-w-[90px] px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm text-sm"
                >
                  <Trash2 size={14} />
                  Uninstall
                </motion.button>
              </div>

              {/* Confirmation dialogs */}
              {showStartConfirm === index && (
                <div className="mt-4 p-4 bg-blue-50/90 backdrop-blur-sm rounded-xl border border-blue-200/60">
                  <p className="text-sm text-blue-800 mb-3">Start {container.name}?</p>
                  <div className="flex justify-end gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { e.stopPropagation(); handleStartContainer(index); }}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      Yes
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { e.stopPropagation(); setShowStartConfirm(null); }}
                      className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                    >
                      No
                    </motion.button>
                  </div>
                </div>
              )}

              {showStopConfirm === index && (
                <div className="mt-4 p-4 bg-yellow-50/90 backdrop-blur-sm rounded-xl border border-yellow-200/60">
                  <p className="text-sm text-yellow-800 mb-3">Stop {container.name}?</p>
                  <div className="flex justify-end gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { e.stopPropagation(); handleStopContainer(index); }}
                      className="px-4 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                    >
                      Yes
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { e.stopPropagation(); setShowStopConfirm(null); }}
                      className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                    >
                      No
                    </motion.button>
                  </div>
                </div>
              )}

              {showUninstallConfirm === index && (
                <div className="mt-4 p-4 bg-red-50/90 backdrop-blur-sm rounded-xl border border-red-200/60">
                  <p className="text-sm text-red-800 mb-3">Uninstall {container.name}?</p>
                  <div className="flex justify-end gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { e.stopPropagation(); handleUninstallContainer(index); }}
                      className="px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                    >
                      Yes
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(null); }}
                      className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                    >
                      No
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {selectedContainer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closePopup}
        >
          <motion.div
            initial={{ y: 60, scale: 0.92 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 60, scale: 0.92 }}
            className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-2xl max-w-lg w-full border border-blue-200/40"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-5 text-[#1e40af]">{selectedContainer.name}</h3>
            <div className="space-y-3 text-sm text-blue-800">
              <p><strong className="text-blue-900">URL:</strong> {selectedContainer.url || 'N/A'}</p>
              <p><strong className="text-blue-900">Description:</strong> {selectedContainer.description || 'N/A'}</p>
              <p><strong className="text-blue-900">Vendor:</strong> {selectedContainer.vendor || 'N/A'}</p>
              <p><strong className="text-blue-900">Version:</strong> {selectedContainer.version || 'N/A'}</p>
              {('alias' in selectedContainer && selectedContainer.alias !== undefined) && (
                <>
                  <p><strong className="text-blue-900">Alias:</strong> {selectedContainer.alias || 'N/A'}</p>
                  <p><strong className="text-blue-900">DUID:</strong> {selectedContainer.duid || 'N/A'}</p>
                  <p><strong className="text-blue-900">UUID:</strong> {selectedContainer.uuid || 'N/A'}</p>
                  <p><strong className="text-blue-900">Installed:</strong> {selectedContainer.installed || 'N/A'}</p>
                  <p><strong className="text-blue-900">Last Update:</strong> {selectedContainer.lastUpdate || 'N/A'}</p>
                  <p><strong className="text-blue-900">Execution Status:</strong> {selectedContainer.executionStatus || 'N/A'}</p>
                  <p><strong className="text-blue-900">Deployment Status:</strong> {selectedContainer.deploymentStatus || 'N/A'}</p>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {('alias' in selectedContainer && selectedContainer.alias !== undefined) && (
                <>
                  {selectedContainer.executionStatus === 'Idle' && (
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const idx = existingContainers.findIndex(c => c.index === selectedContainer.index);
                        if (idx !== -1) setShowStartConfirm(idx);
                      }}
                      className="w-full px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-md"
                    >
                      <Play size={16} />
                      Start Service
                    </motion.button>
                  )}

                  {selectedContainer.executionStatus === 'Active' && (
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        const idx = existingContainers.findIndex(c => c.index === selectedContainer.index);
                        if (idx !== -1) setShowStopConfirm(idx);
                      }}
                      className="w-full px-5 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center justify-center gap-2 shadow-md"
                    >
                      <Trash2 size={16} />
                      Stop Service
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      const idx = existingContainers.findIndex(c => c.index === selectedContainer.index);
                      if (idx !== -1) setShowUninstallConfirm(idx);
                    }}
                    className="w-full px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-md"
                  >
                    <Trash2 size={16} />
                    Uninstall Service
                  </motion.button>
                </>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={closePopup}
              className="mt-6 w-full px-5 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-md text-sm font-medium"
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