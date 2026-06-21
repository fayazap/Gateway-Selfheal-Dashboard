import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Plus, Trash2, Check, Play } from 'lucide-react';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';

const FONT = "'Inter', system-ui, sans-serif";
const R = 16;

function LCMPage() {
  const { T } = useTheme();
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
    setNewContainer({ ...newContainer, [name]: type === 'checkbox' ? checked : value });
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
      setContainers(containers.filter((_, i) => i !== index));
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
        setContainers(containers.filter((_, i) => i !== index));
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
      } else {
        console.warn('No unitIndex found for container:', container.name);
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
      } else {
        console.warn('No unitIndex found for container:', container.name);
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
        await axios.post('/api/lcm/uninstall', { unitIndex: container.unitIndex, deploymentIndex: container.index });
        setExistingContainers(existingContainers.filter((_, i) => i !== index));
        setShowUninstallConfirm(null);
        await fetchData();
      } else {
        console.warn('No unitIndex or index found for container:', container.name);
      }
    } catch (err) {
      console.error('Error uninstalling container:', err);
    }
  };

  const handleViewDetails = (container) => setSelectedContainer(container);
  const closePopup = () => setSelectedContainer(null);

  // ── Style helpers ──────────────────────────────────────────────
  const section = {
    background: T.cardBg,
    border: `1px solid ${T.border}`,
    borderRadius: R,
    boxShadow: T.shadow,
    padding: 24,
    marginBottom: 24,
    backdropFilter: 'blur(16px)',
  };

  const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 20, border: 'none',
    background: T.accent, color: '#fff',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
  };

  const btnDanger = { ...btnPrimary, background: T.danger };
  const btnWarning = { ...btnPrimary, background: T.warning };
  const btnNeutral = { ...btnPrimary, background: T.elevated, color: T.textSec };
  const btnSm = { ...btnPrimary, padding: '4px 10px', fontSize: 11 };
  const btnSmDanger = { ...btnSm, background: T.danger };
  const btnSmWarning = { ...btnSm, background: T.warning };
  const btnSmNeutral = { ...btnSm, background: T.elevated, color: T.textSec };

  const confirmBox = (bg, border, textColor) => ({
    marginTop: 8, padding: '10px 12px',
    background: bg, border: `1px solid ${border}`,
    borderRadius: 10,
  });

  const inputStyle = {
    width: '100%', padding: '8px 12px',
    background: T.elevated, border: `1px solid ${T.border}`,
    borderRadius: 8, color: T.textPrimary, fontSize: 13,
    outline: 'none', boxSizing: 'border-box', fontFamily: FONT,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const onFocus = e => { e.target.style.borderColor = T.accent; e.target.style.boxShadow = `0 0 0 3px ${T.accentMuted}`; };
  const onBlur  = e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: 24, fontFamily: FONT }}>
      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={section}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart size={20} color={T.accent} />
          Services Summary
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { label: 'Total Services', value: summary.totalContainers },
            { label: 'Active Services', value: summary.activeContainers },
            { label: 'Total Memory Used (%)', value: summary.totalMemoryUsed.toFixed(1) },
            { label: 'Total CPU Used (%)', value: summary.totalCpuUsed.toFixed(1) },
          ].map((item, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.04 }}
              style={{
                padding: '14px 16px',
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 500, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{item.value}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Service Library */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        style={section}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: T.textPrimary }}>Service Library</h2>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAddForm(true)}
            style={btnPrimary}
          >
            <Plus size={14} />
            Add Service
          </motion.button>
        </div>

        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: 16, marginBottom: 16,
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: T.textPrimary }}>Add New Service</h3>
            <form onSubmit={handleAddContainer} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" name="url" value={newContainer.url} onChange={handleInputChange} placeholder="URL (e.g., docker://registry-1.docker.io/...)" style={inputStyle} onFocus={onFocus} onBlur={onBlur} required />
              <input type="text" name="name" value={newContainer.name} onChange={handleInputChange} placeholder="Name" style={inputStyle} onFocus={onFocus} onBlur={onBlur} required />
              <input type="text" name="description" value={newContainer.description} onChange={handleInputChange} placeholder="Description" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              <input type="text" name="vendor" value={newContainer.vendor} onChange={handleInputChange} placeholder="Vendor" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              <input type="text" name="version" value={newContainer.version} onChange={handleInputChange} placeholder="Version" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" name="autostart" checked={newContainer.autostart || false} onChange={handleInputChange} style={{ width: 15, height: 15, accentColor: T.accent }} />
                <label style={{ fontSize: 13, color: T.textSec }}>Autostart</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="submit" style={btnPrimary}>Add</motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="button" onClick={() => setShowAddForm(false)} style={btnNeutral}>Cancel</motion.button>
              </div>
            </form>
          </motion.div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {containers.map((container, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => handleViewDetails(container)}
              style={{
                padding: 16, background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 14, boxShadow: T.shadow,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: T.textPrimary }}>
                {container.name} — {container.vendor}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={e => { e.stopPropagation(); setShowDeleteConfirm(index); }}
                  style={{ ...btnDanger, width: '100%', justifyContent: 'center' }}
                >
                  <Trash2 size={13} /> Delete
                </motion.button>
                {showDeleteConfirm === index && (
                  <div style={confirmBox(T.dangerBg, `${T.danger}30`, T.danger)}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: T.danger }}>Are you sure you want to delete {container.name}?</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleDeleteContainer(index); }} style={btnSmDanger}>Yes</motion.button>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowDeleteConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                    </div>
                  </div>
                )}
                {!existingContainers.some(c => c.url === container.url) && (
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={e => { e.stopPropagation(); setShowInstallConfirm(index); }}
                    style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}
                  >
                    <Check size={13} /> Add to Device
                  </motion.button>
                )}
                {showInstallConfirm === index && (
                  <div style={confirmBox(T.successBg, `${T.success}30`, T.success)}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: T.success }}>Are you sure you want to install {container.name}?</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleInstallContainer(index); }} style={{ ...btnSm, background: T.success }}>Yes</motion.button>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowInstallConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Active Services */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
        style={section}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600, color: T.textPrimary }}>Active Services</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {existingContainers.map((container, index) => (
            <motion.div
              key={container.duid || container.uuid || container.index}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => handleViewDetails(container)}
              style={{
                padding: 16, background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 14, boxShadow: T.shadow,
                cursor: 'pointer', position: 'relative',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ position: 'absolute', top: 10, left: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  background: container.executionStatus === 'Active' ? T.successBg : T.warningBg,
                  color: container.executionStatus === 'Active' ? T.success : T.warning,
                }}>
                  {container.executionStatus || 'N/A'}
                </span>
              </div>
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  background: container.deploymentStatus === 'Installed' ? T.warningBg : T.successBg,
                  color: container.deploymentStatus === 'Installed' ? T.warning : T.success,
                }}>
                  {container.deploymentStatus || 'N/A'}
                </span>
              </div>

              <h3 style={{ margin: '28px 0 4px', fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{container.name}</h3>
              <p style={{ margin: '0 0 2px', fontSize: 12, color: T.textMuted }}>Vendor: {container.vendor || 'N/A'}</p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: T.textMuted }}>Version: {container.version || 'N/A'}</p>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {container.executionStatus === 'Idle' && (
                  <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={e => { e.stopPropagation(); setShowStartConfirm(index); }}
                    style={{ ...btnSm, flex: 1, justifyContent: 'center', background: T.success }}
                  >
                    <Play size={12} /> Start
                  </motion.button>
                )}
                {container.executionStatus === 'Active' && (
                  <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={e => { e.stopPropagation(); setShowStopConfirm(index); }}
                    style={{ ...btnSmWarning, flex: 1, justifyContent: 'center' }}
                  >
                    <Trash2 size={12} /> Stop
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={e => { e.stopPropagation(); setShowUninstallConfirm(index); }}
                  style={{ ...btnSmDanger, flex: 1, justifyContent: 'center' }}
                >
                  <Trash2 size={12} /> Delete
                </motion.button>
              </div>

              {showStartConfirm === index && (
                <div style={confirmBox(T.successBg, `${T.success}30`, T.success)}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: T.success }}>Are you sure you want to start {container.name}?</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleStartContainer(index); }} style={{ ...btnSm, background: T.success }}>Yes</motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowStartConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                  </div>
                </div>
              )}
              {showStopConfirm === index && (
                <div style={confirmBox(T.warningBg, `${T.warning}30`, T.warning)}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: T.warning }}>Are you sure you want to stop {container.name}?</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleStopContainer(index); }} style={btnSmWarning}>Yes</motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowStopConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                  </div>
                </div>
              )}
              {showUninstallConfirm === index && (
                <div style={confirmBox(T.dangerBg, `${T.danger}30`, T.danger)}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: T.danger }}>Are you sure you want to delete {container.name}?</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleUninstallContainer(index); }} style={btnSmDanger}>Yes</motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowUninstallConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Detail popup */}
      {selectedContainer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={closePopup}
        >
          <motion.div
            initial={{ y: 40, scale: 0.92 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, scale: 0.92 }}
            style={{
              background: T.cardBg,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${T.border}`,
              padding: 24,
              borderRadius: 20,
              boxShadow: T.shadowHover,
              maxWidth: 480,
              width: '100%',
              margin: '0 16px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: T.textPrimary }}>{selectedContainer.name}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: T.textSec }}>
              {('alias' in selectedContainer && selectedContainer.alias !== undefined) ? (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>URL:</strong> {selectedContainer.url || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Description:</strong> {selectedContainer.description || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Vendor:</strong> {selectedContainer.vendor || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Version:</strong> {selectedContainer.version || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Alias:</strong> {selectedContainer.alias || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>DUID:</strong> {selectedContainer.duid || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Installed:</strong> {selectedContainer.installed || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Last Update:</strong> {selectedContainer.lastUpdate || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Execution Status:</strong> {selectedContainer.executionStatus || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Deployment Status:</strong> {selectedContainer.deploymentStatus || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>UUID:</strong> {selectedContainer.uuid || 'N/A'}</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>URL:</strong> {selectedContainer.url || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Description:</strong> {selectedContainer.description || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Vendor:</strong> {selectedContainer.vendor || 'N/A'}</p>
                  <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>Version:</strong> {selectedContainer.version || 'N/A'}</p>
                </>
              )}
            </div>

            {('alias' in selectedContainer && selectedContainer.alias !== undefined) && (() => {
              const idx = existingContainers.findIndex(c => c.index === selectedContainer.index);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  {selectedContainer.executionStatus === 'Idle' && (
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                      onClick={e => { e.stopPropagation(); setShowStartConfirm(idx); }}
                      style={{ ...btnPrimary, justifyContent: 'center', background: T.success }}
                    >
                      <Play size={13} /> Start
                    </motion.button>
                  )}
                  {selectedContainer.executionStatus === 'Active' && (
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                      onClick={e => { e.stopPropagation(); setShowStopConfirm(idx); }}
                      style={{ ...btnWarning, justifyContent: 'center' }}
                    >
                      <Trash2 size={13} /> Stop
                    </motion.button>
                  )}
                  {showStartConfirm === idx && (
                    <div style={confirmBox(T.successBg, `${T.success}30`, T.success)}>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: T.success }}>Are you sure you want to start {selectedContainer.name}?</p>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleStartContainer(idx); }} style={{ ...btnSm, background: T.success }}>Yes</motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowStartConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                      </div>
                    </div>
                  )}
                  {showStopConfirm === idx && (
                    <div style={confirmBox(T.warningBg, `${T.warning}30`, T.warning)}>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: T.warning }}>Are you sure you want to stop {selectedContainer.name}?</p>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleStopContainer(idx); }} style={btnSmWarning}>Yes</motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowStopConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                      </div>
                    </div>
                  )}
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={e => { e.stopPropagation(); setShowUninstallConfirm(idx); }}
                    style={{ ...btnDanger, justifyContent: 'center' }}
                  >
                    <Trash2 size={13} /> Delete
                  </motion.button>
                  {showUninstallConfirm === idx && (
                    <div style={confirmBox(T.dangerBg, `${T.danger}30`, T.danger)}>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: T.danger }}>Are you sure you want to delete {selectedContainer.name}?</p>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); handleUninstallContainer(idx); }} style={btnSmDanger}>Yes</motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); setShowUninstallConfirm(null); }} style={btnSmNeutral}>No</motion.button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={closePopup}
              style={{ ...btnPrimary, marginTop: 16 }}
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
