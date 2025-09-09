import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Plus, Trash2, Check } from 'lucide-react';
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
  const [usedUuids, setUsedUuids] = useState(new Set()); // Track used UUIDs

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
      const executionUnits = lcmData.ExecutionUnits;
      const deploymentUnits = lcmData.DeploymentUnits;

      const activeContainers = executionUnits.reduce((count, unit) => {
        const statusKey = Object.keys(unit).find(key => key.endsWith('.Status'));
        return count + (statusKey && unit[statusKey]?.replace(/"/g, '') === 'Active' ? 1 : 0);
      }, 0);

      const totalCpuUsed = parseFloat(summaryData.cpuUsage?.replace('%', '') || '0');
      const totalMemoryUsed = parseFloat(summaryData.memoryUsage?.replace(/"/g, '') || '0');

      setSummary({ totalContainers, activeContainers, totalMemoryUsed, totalCpuUsed });

      const allContainers = [];
      const seenDuids = new Set();
      const processUnit = (unit) => {
        const duidKey = Object.keys(unit).find(key => key.endsWith('.DUID') || key.endsWith('.EUID'));
        const uuidKey = Object.keys(unit).find(key => key.endsWith('.UUID'));
        const nameKey = Object.keys(unit).find(key => key.endsWith('.Name'));
        const statusKey = Object.keys(unit).find(key => key.endsWith('.Status'));
        const duid = duidKey ? unit[duidKey]?.replace(/"/g, '') : uuidKey ? unit[uuidKey]?.replace(/"/g, '') : null;

        if (duid && !seenDuids.has(duid)) {
          seenDuids.add(duid);
          allContainers.push({
            ...unit,
            index: allContainers.length + 1,
            name: unit[nameKey]?.replace(/"/g, '') || 'Unnamed',
            url: unit[Object.keys(unit).find(key => key.endsWith('.URL'))]?.replace(/"/g, '') || 'N/A',
            description: unit[Object.keys(unit).find(key => key.endsWith('.Description'))]?.replace(/"/g, '') || 'N/A',
            vendor: unit[Object.keys(unit).find(key => key.endsWith('.Vendor'))]?.replace(/"/g, '') || 'N/A',
            version: unit[Object.keys(unit).find(key => key.endsWith('.Version'))]?.replace(/"/g, '') || 'N/A',
            alias: unit[Object.keys(unit).find(key => key.endsWith('.Alias'))]?.replace(/"/g, '') || 'N/A',
            duid: duid || 'N/A',
            installed: unit[Object.keys(unit).find(key => key.endsWith('.Installed') || key.endsWith('.CreationTime'))]?.replace(/"/g, '') || 'N/A',
            lastUpdate: unit[Object.keys(unit).find(key => key.endsWith('.LastUpdate'))]?.replace(/"/g, '') || 'N/A',
            status: statusKey ? unit[statusKey]?.replace(/"/g, '') : 'N/A',
            uuid: unit[Object.keys(unit).find(key => key.endsWith('.UUID'))]?.replace(/"/g, '') || 'N/A',
          });
        }
      };

      deploymentUnits.forEach(processUnit);
      executionUnits.forEach(processUnit);

      const newExistingContainers = allContainers;
      setExistingContainers(newExistingContainers);
      setContainers(lcmData.ContainerLibrary || []); // Sync with backend storage

      // Update used UUIDs from existing containers and library
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
    setNewContainer({ ...newContainer, [e.target.name]: e.target.value });
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
          await fetchData(); // Refresh data after adding
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
      await fetchData(); // Refresh data after deleting
    } catch (err) {
      console.error('Error deleting container:', err);
    }
  };

  const handleInstallContainer = async (index) => {
    const container = containers[index];
    try {
        // Check if the container is already installed by comparing URLs
        const isAlreadyInstalled = existingContainers.some(c => c.url === container.url);
        if (isAlreadyInstalled) {
        alert(`Container ${container.name} is already installed on the device.`);
        setShowInstallConfirm(null);
        return;
        }

        // Generate a unique UUID by replacing the last digit
        let newUuid = "00000000-0000-5000-b000-000000000001";
        let lastDigit = 1;
        while (usedUuids.has(newUuid)) {
        lastDigit = (lastDigit % 9) + 1; // Cycle through 1-9
        newUuid = `00000000-0000-5000-b000-00000000000${lastDigit}`;
        }
        usedUuids.add(newUuid);
        setUsedUuids(new Set(usedUuids)); // Update state with new UUID

        const response = await axios.post('/api/lcm/install', {
        url: container.url,
        uuid: newUuid,
        name: container.name,
        });
        if (response.data.success) {
        const newContainers = containers.filter((_, i) => i !== index);
        setContainers(newContainers);
        setShowInstallConfirm(null);
        await fetchData(); // Refresh data after installing
        }
    } catch (err) {
        console.error('Error installing container:', err);
    }
  };

  const handleStopContainer = async (index) => {
    try {
      await axios.post('/api/lcm/stop', { unitIndex: existingContainers[index].index });
      setShowStopConfirm(null);
      await fetchData(); // Refresh data after stopping
    } catch (err) {
      console.error('Error stopping container:', err);
    }
  };

  const handleUninstallContainer = async (index) => {
    try {
      await axios.post('/api/lcm/uninstall', {
        unitIndex: existingContainers[index].index,
        deploymentIndex: existingContainers[index].index,
      });
      const newContainers = existingContainers.filter((_, i) => i !== index);
      setExistingContainers(newContainers);
      setShowUninstallConfirm(null);
      await fetchData(); // Refresh data after uninstalling
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
            { label: 'Total Containers', value: summary.totalContainers },
            { label: 'Active Containers', value: summary.activeContainers },
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
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Add New Container</h3>
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
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.03 }}
              className="p-4 bg-gradient-to-br from-white to-gray-100 rounded-xl border border-gray-200 shadow-lg transition-all duration-300 cursor-pointer"
              onClick={() => handleViewDetails(container)}
            >
              <h3 className="text-base font-semibold mb-3 text-gray-800">{container.name}</h3>
              <div className="flex gap-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); setShowStopConfirm(index); }}
                  className="flex-1 px-2 py-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                >
                  <Trash2 size={14} />
                  <span className="text-xs">Stop</span>
                </motion.button>
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
                  <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-200" style={{ minWidth: '200px' }}>
                    <p className="text-xs text-red-700">Are you sure you want to delete {container.name}?</p>
                    <div className="mt-2 flex justify-end gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); handleUninstallContainer(index); }}
                        className="px-3 py-1 bg-red-600 text-white rounded-full hover:bg-red-700 text-xs"
                        style={{ minWidth: '40px' }}
                      >
                        Yes
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); setShowUninstallConfirm(null); }}
                        className="px-3 py-1 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 text-xs"
                        style={{ minWidth: '40px' }}
                      >
                        No
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
              {container.status && (
                <div className="mt-2 flex justify-end">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {container.status}
                  </span>
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
                  <p><strong className="text-gray-900">URL:</strong> {selectedContainer.url}</p>
                  <p><strong className="text-gray-900">Description:</strong> {selectedContainer.description}</p>
                  <p><strong className="text-gray-900">Vendor:</strong> {selectedContainer.vendor}</p>
                  <p><strong className="text-gray-900">Version:</strong> {selectedContainer.version}</p>
                  <p><strong className="text-gray-900">Alias:</strong> {selectedContainer.alias}</p>
                  <p><strong className="text-gray-900">DUID:</strong> {selectedContainer.duid}</p>
                  <p><strong className="text-gray-900">Installed:</strong> {selectedContainer.installed}</p>
                  <p><strong className="text-gray-900">Last Update:</strong> {selectedContainer.lastUpdate}</p>
                  <p><strong className="text-gray-900">Status:</strong> {selectedContainer.status}</p>
                  <p><strong className="text-gray-900">UUID:</strong> {selectedContainer.uuid}</p>
                </>
              ) : (
                <>
                  <p><strong className="text-gray-900">URL:</strong> {selectedContainer.url}</p>
                  <p><strong className="text-gray-900">Description:</strong> {selectedContainer.description}</p>
                  <p><strong className="text-gray-900">Vendor:</strong> {selectedContainer.vendor}</p>
                  <p><strong className="text-gray-900">Version:</strong> {selectedContainer.version}</p>
                </>
              )}
            </div>
            <div className="space-y-2 mt-4">
              {('alias' in selectedContainer && selectedContainer.alias !== undefined) ? (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => { e.stopPropagation(); setShowStopConfirm(existingContainers.findIndex(c => c.index === selectedContainer.index)); }}
                    className="w-full px-3 py-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-colors flex items-center justify-center gap-1 shadow-md text-xs"
                  >
                    <Trash2 size={14} />
                    <span className="text-xs">Stop</span>
                  </motion.button>
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