import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { motion } from 'framer-motion';
import {
  Globe, Cpu, Power, MemoryStick, Network, Clock, RefreshCw, AlertCircle, Thermometer,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { useTheme } from '../contexts/ThemeContext';
import PropagateLoader from '../components/PropagateLoader';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale, Filler);

const FONT = "'Inter', system-ui, sans-serif";
const R = 14;

function SummaryPage() {
  const { T } = useTheme();
  const [summary, setSummary] = useState({});
  const [selfheal, setSelfheal] = useState({
    lastRebootReason: 'No History',
    lastRebootTime: 'No History',
    rebootCount: 0,
    avgCpuThreshold: 0,
    avgMemoryThreshold: 0,
    avgTemperatureThreshold: 0,
  });
  const [cpuData, setCpuData] = useState({ datasets: [] });
  const [memoryData, setMemoryData] = useState({ datasets: [] });
  const [tempData, setTempData] = useState({ datasets: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const cpuChartRef = useRef(null);
  const memoryChartRef = useRef(null);
  const tempChartRef = useRef(null);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
        title: { display: true, text: 'Time (Last 20 Records)', font: { size: 13, weight: 'bold' }, color: T.textSec },
        grid: { color: T.border },
        ticks: { color: T.textMuted },
      },
      y: {
        beginAtZero: true,
        max: 100,
        title: { display: true, text: 'Percentage (%)', font: { size: 13, weight: 'bold' }, color: T.textSec },
        grid: { color: T.border },
        ticks: { color: T.textMuted },
      },
    },
    plugins: {
      legend: { position: 'top', labels: { font: { size: 12, weight: 'bold' }, color: T.textSec } },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        callbacks: {
          label(context) {
            return `${context.dataset.label}: ${context.parsed.y}${
              context.dataset.label.includes('Threshold') || context.dataset.label.includes('Temperature') ? '' : '%'
            }`;
          },
        },
      },
    },
    animation: { duration: 1000, easing: 'easeOutQuart' },
  }), [T]);

  const tempChartOptions = useMemo(() => ({
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        max: 150,
        title: { display: true, text: 'Temperature (°C)', font: { size: 13, weight: 'bold' }, color: T.textSec },
      },
    },
  }), [T, chartOptions]);

  const updateChartsFromStats = (cpuStats = [], memoryStats = [], tempStats = [], thresholds = {}) => {
    const formatTime = (isoTime) => new Date(isoTime);
    const limitLast20 = (data) => (data.length ? data.slice(-20) : []);
    const arraysEqual = (a = [], b = []) =>
      a.length === b.length && a.every((v, i) => v.x.getTime() === b[i].x.getTime() && v.y === b[i].y);

    const cpuUsageData = limitLast20(cpuStats).map(s => ({ x: formatTime(s.time), y: s.value || 0 }));
    const cpuThresholdData = cpuUsageData.map(p => ({ x: p.x, y: thresholds.avgCpuThreshold }));
    setCpuData(prev => {
      if (
        !arraysEqual(cpuUsageData, prev.datasets[0]?.data || []) ||
        !arraysEqual(cpuThresholdData, prev.datasets[1]?.data || []) ||
        prev.datasets[1]?.label !== `Threshold (${thresholds.avgCpuThreshold}%)`
      ) {
        return {
          datasets: [
            { label: 'CPU Usage (%)', data: cpuUsageData, borderColor: T.success, backgroundColor: T.successBg, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
            { label: `Threshold (${thresholds.avgCpuThreshold}%)`, data: cpuThresholdData, borderColor: T.danger, backgroundColor: T.dangerBg, fill: false, borderDash: [5, 5], pointRadius: 0 },
          ],
        };
      }
      return prev;
    });

    const memoryUsageData = limitLast20(memoryStats).map(s => ({ x: formatTime(s.time), y: s.value || 0 }));
    const memoryThresholdData = memoryUsageData.map(p => ({ x: p.x, y: thresholds.avgMemoryThreshold }));
    setMemoryData(prev => {
      if (
        !arraysEqual(memoryUsageData, prev.datasets[0]?.data || []) ||
        !arraysEqual(memoryThresholdData, prev.datasets[1]?.data || []) ||
        prev.datasets[1]?.label !== `Threshold (${thresholds.avgMemoryThreshold}%)`
      ) {
        return {
          datasets: [
            { label: 'Memory Usage (%)', data: memoryUsageData, borderColor: T.success, backgroundColor: T.successBg, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
            { label: `Threshold (${thresholds.avgMemoryThreshold}%)`, data: memoryThresholdData, borderColor: T.danger, backgroundColor: T.dangerBg, fill: false, borderDash: [5, 5], pointRadius: 0 },
          ],
        };
      }
      return prev;
    });

    const tempDataPoints = limitLast20(tempStats).map(s => ({ x: formatTime(s.time), y: s.value || 0 }));
    const tempThresholdData = tempDataPoints.map(p => ({ x: p.x, y: thresholds.avgTemperatureThreshold }));
    setTempData(prev => {
      if (
        !arraysEqual(tempDataPoints, prev.datasets[0]?.data || []) ||
        !arraysEqual(tempThresholdData, prev.datasets[1]?.data || []) ||
        prev.datasets[1]?.label !== `Threshold (${thresholds.avgTemperatureThreshold}°C)`
      ) {
        return {
          datasets: [
            { label: 'Temperature (°C)', data: tempDataPoints, borderColor: T.warning, backgroundColor: T.warningBg, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
            { label: `Threshold (${thresholds.avgTemperatureThreshold}°C)`, data: tempThresholdData, borderColor: T.danger, backgroundColor: T.dangerBg, fill: false, borderDash: [5, 5], pointRadius: 0 },
          ],
        };
      }
      return prev;
    });
  };

  const fetchAndUpdateAll = async () => {
    setError('');
    try {
      const [summaryRes, selfhealRes, statsRes] = await Promise.all([
        axios.get('/api/summary'),
        axios.get('/api/selfheal'),
        axios.get('/api/stats'),
      ]);
      if (summaryRes.status === 200) setSummary(summaryRes.data);
      if (selfhealRes.status === 200 && statsRes.status === 200) {
        const sh = {
          lastRebootReason: selfhealRes.data.lastRebootReason,
          lastRebootTime: selfhealRes.data.lastRebootTime,
          rebootCount: selfhealRes.data.rebootCount,
          avgCpuThreshold: selfhealRes.data.avgCpuThreshold,
          avgMemoryThreshold: selfhealRes.data.avgMemoryThreshold,
          avgTemperatureThreshold: selfhealRes.data.avgTemperatureThreshold,
        };
        setSelfheal(sh);
        updateChartsFromStats(
          statsRes.data.cpuStats || [],
          statsRes.data.memoryStats || [],
          statsRes.data.tempStats || [],
          sh
        );
      } else {
        throw new Error('Failed to load selfheal or stats data');
      }
    } catch (err) {
      setError('Failed to update charts - Ensure backend is running');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndUpdateAll();
    const interval = setInterval(fetchAndUpdateAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const card = {
    background: T.cardBg,
    border: `1px solid ${T.border}`,
    borderRadius: R,
    boxShadow: T.shadow,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)' }}>
        <PropagateLoader label="Retrieving Device Information..." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)' }}>
        <div style={{ ...card, padding: '32px 28px', textAlign: 'center', maxWidth: 380 }}>
          <Globe size={40} color={T.danger} style={{ marginBottom: 14 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: T.textPrimary }}>Error Loading Device Details</h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: T.textMuted }}>{error}</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={fetchAndUpdateAll}
            style={{
              padding: '9px 20px',
              background: T.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            Try Again
          </motion.button>
        </div>
      </div>
    );
  }

  const StatItem = ({ Icon, iconColor, label, value }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: T.elevated,
      borderRadius: 10,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: T.accentMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={iconColor || T.accent} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 11, color: T.textMuted, fontWeight: 500 }}>{label}</p>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{value}</p>
      </div>
    </div>
  );

  const InfoRow = ({ label, value, mono }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0',
      borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: 13, color: T.textMuted, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: T.textPrimary, fontWeight: 600, fontFamily: mono ? 'monospace' : FONT }}>{value}</span>
    </div>
  );

  const SectionCard = ({ title, Icon, children, style: extra = {} }) => (
    <div style={{ ...card, padding: '18px 20px', ...extra }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={17} color={T.accent} />
        {title}
      </h3>
      {children}
    </div>
  );

  const ChartCard = ({ title, Icon, data, options, chartRef }) => (
    <div style={{ ...card, padding: '18px 20px' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={17} color={T.accent} />
        {title}
      </h3>
      <div style={{ height: 300 }}>
        <Line data={data} options={options} ref={chartRef} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1050, margin: '0 auto', fontFamily: FONT }}>
      {/* Device Status */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ ...card, padding: '18px 20px', marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Device Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <StatItem Icon={Clock} label="Uptime" value={summary.uptime || 'N/A'} />
          <StatItem Icon={Cpu} label="CPU Usage" value={summary.cpuUsage || 'N/A'} iconColor={T.info} />
          <StatItem Icon={MemoryStick} label="Memory Usage" value={summary.memoryUsage || 'N/A'} iconColor={T.success} />
        </div>
      </motion.div>

      {/* Device + Network Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <SectionCard title="Basic Information" Icon={Globe}>
            <InfoRow label="Device Name" value="PON Gateway" />
            <InfoRow label="Model" value="B521FG" />
            <InfoRow label="Manufacturer" value="Tinno" />
            <InfoRow label="Firmware Version" value={summary.firmwareVersion || 'N/A'} mono />
          </SectionCard>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <SectionCard title="Network Information" Icon={Network}>
            <InfoRow label="IP Address" value={summary.ipAddress || 'N/A'} mono />
            <InfoRow label="MAC Address" value={summary.macAddress || 'N/A'} mono />
            <InfoRow label="Gateway" value={summary.defaultGateway || 'N/A'} mono />
            <InfoRow label="DNS Servers" value={summary.dnsServers || 'N/A'} mono />
          </SectionCard>
        </motion.div>
      </div>

      {/* Events Information */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} style={{ ...card, padding: '18px 20px', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Power size={17} color={T.accent} />
          Events Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <StatItem Icon={Clock} label="Last Event Time" value={selfheal.lastRebootTime} />
          <StatItem Icon={AlertCircle} label="Last Event Reason" value={selfheal.lastRebootReason} iconColor={T.warning} />
          <StatItem Icon={RefreshCw} label="Number of Events" value={selfheal.rebootCount} iconColor={T.info} />
        </div>
      </motion.div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <ChartCard title="CPU Usage" Icon={Cpu} data={cpuData} options={chartOptions} chartRef={cpuChartRef} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <ChartCard title="Memory Usage" Icon={MemoryStick} data={memoryData} options={chartOptions} chartRef={memoryChartRef} />
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} style={{ maxWidth: '50%', margin: '0 auto' }}>
        <ChartCard title="Temperature" Icon={Thermometer} data={tempData} options={tempChartOptions} chartRef={tempChartRef} />
      </motion.div>
    </div>
  );
}

export default SummaryPage;
