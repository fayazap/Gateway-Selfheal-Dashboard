import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Alert, Card, Button } from 'react-bootstrap';
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
import 'chartjs-adapter-date-fns'; // For time scale support

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale, Filler);

function SummaryPage() {
  const [summary, setSummary] = useState({});
  const [selfheal, setSelfheal] = useState({
    lastRebootReason: 'No History',
    lastRebootTime: 'No History',
    rebootCount: 0,
    avgCpuThreshold: 0,
    avgMemoryThreshold: 0,
  });
  const [cpuData, setCpuData] = useState({
    datasets: [
      { label: 'CPU Usage (%)', data: [], borderColor: '#28a745', backgroundColor: 'rgba(40, 167, 69, 0.2)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
      { label: 'Threshold (0%)', data: [], borderColor: '#dc3545', backgroundColor: 'rgba(220, 53, 69, 0.1)', fill: false, borderDash: [5, 5], pointRadius: 0 },
    ],
  });
  const [memoryData, setMemoryData] = useState({
    datasets: [
      { label: 'Memory Usage (%)', data: [], borderColor: '#28a745', backgroundColor: 'rgba(40, 167, 69, 0.2)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
      { label: 'Threshold (0%)', data: [], borderColor: '#dc3545', backgroundColor: 'rgba(220, 53, 69, 0.1)', fill: false, borderDash: [5, 5], pointRadius: 0 },
    ],
  });
  const [tempData, setTempData] = useState({
    datasets: [
      { label: 'Temperature (°C)', data: [], borderColor: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.2)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 },
    ],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const cpuChartRef = useRef(null);
  const memoryChartRef = useRef(null);
  const tempChartRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(() => {
      updateChartsFromStats().catch(err => {
        console.error('Chart update failed:', err);
        setError('Failed to update charts - Ensure backend is running');
      });
    }, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, selfhealResponse, statsResponse] = await Promise.all([
        axios.get('/api/summary'),
        axios.get('/api/selfheal'),
        axios.get('/api/stats'),
      ]);
      if (summaryResponse.status === 200) setSummary(summaryResponse.data);
      if (selfhealResponse.status === 200) {
        const newSelfheal = {
          lastRebootReason: selfhealResponse.data.lastRebootReason,
          lastRebootTime: selfhealResponse.data.lastRebootTime,
          rebootCount: selfhealResponse.data.rebootCount,
          avgCpuThreshold: parseInt(selfhealResponse.data.avgCpuThreshold || selfhealResponse.data.params['X_TINNO-COM_SelfHeal.AvgCPUThreshold'] || 0),
          avgMemoryThreshold: parseInt(selfhealResponse.data.avgMemoryThreshold || selfhealResponse.data.params['X_TINNO-COM_SelfHeal.AvgMemoryThreshold'] || 0),
        };
        setSelfheal(newSelfheal);
        if (statsResponse.status === 200) {
          updateChartsFromStats(statsResponse.data.cpuStats, statsResponse.data.memoryStats, statsResponse.data.tempStats);
        }
      } else {
        throw new Error('Failed to load selfheal data');
      }
    } catch (err) {
      setError(`Network error: ${err.message} - Ensure backend is running on http://localhost:5000`);
    } finally {
      setLoading(false);
    }
  };

  const updateChartsFromStats = async (cpuStats = [], memoryStats = [], tempStats = []) => {
    const formatTime = (isoTime) => new Date(isoTime);
    const limitLast20 = (data) => (data.length ? data.slice(-20) : []);

    // Fallback to last known data if new data is empty
    const lastCpuUsage = cpuData.datasets[0].data.length ? [...cpuData.datasets[0].data] : [];
    const lastCpuThreshold = cpuData.datasets[1].data.length ? [...cpuData.datasets[1].data] : [];
    const lastMemoryUsage = memoryData.datasets[0].data.length ? [...memoryData.datasets[0].data] : [];
    const lastMemoryThreshold = memoryData.datasets[1].data.length ? [...memoryData.datasets[1].data] : [];
    const lastTempData = tempData.datasets[0].data.length ? [...tempData.datasets[0].data] : [];

    // Update CPU Data
    const cpuUsageData = limitLast20(cpuStats).map(stat => ({ x: formatTime(stat.time), y: stat.value || 0 }));
    const cpuThresholdData = limitLast20(cpuStats).map(stat => ({ x: formatTime(stat.time), y: selfheal.avgCpuThreshold }));
    const shouldUpdateCpu = !cpuUsageData.length ? false : (
      !cpuData.datasets[0].data.length ||
      cpuUsageData.some((d, i) => Math.abs(d.y - (cpuData.datasets[0].data[i]?.y || 0)) > 0.5) ||
      cpuThresholdData.some((d, i) => d.y !== (cpuData.datasets[1].data[i]?.y || 0))
    );
    if (shouldUpdateCpu) {
      setCpuData(prev => ({
        datasets: [
          { ...prev.datasets[0], data: cpuUsageData.length ? cpuUsageData : lastCpuUsage },
          { ...prev.datasets[1], data: cpuThresholdData.length ? cpuThresholdData : lastCpuThreshold, label: `Threshold (${selfheal.avgCpuThreshold}%)` },
        ],
      }));
    }

    // Update Memory Data
    const memoryUsageData = limitLast20(memoryStats).map(stat => ({ x: formatTime(stat.time), y: stat.value || 0 }));
    const memoryThresholdData = limitLast20(memoryStats).map(stat => ({ x: formatTime(stat.time), y: selfheal.avgMemoryThreshold }));
    const shouldUpdateMemory = !memoryUsageData.length ? false : (
      !memoryData.datasets[0].data.length ||
      memoryUsageData.some((d, i) => Math.abs(d.y - (memoryData.datasets[0].data[i]?.y || 0)) > 0.5) ||
      memoryThresholdData.some((d, i) => d.y !== (memoryData.datasets[1].data[i]?.y || 0))
    );
    if (shouldUpdateMemory) {
      setMemoryData(prev => ({
        datasets: [
          { ...prev.datasets[0], data: memoryUsageData.length ? memoryUsageData : lastMemoryUsage },
          { ...prev.datasets[1], data: memoryThresholdData.length ? memoryThresholdData : lastMemoryThreshold, label: `Threshold (${selfheal.avgMemoryThreshold}%)` },
        ],
      }));
    }

    // Update Temperature Data
    const tempDataPoints = limitLast20(tempStats).map(stat => ({ x: formatTime(stat.time), y: stat.value || 0 }));
    const shouldUpdateTemp = !tempDataPoints.length ? false : (
      !tempData.datasets[0].data.length ||
      tempDataPoints.some((d, i) => Math.abs(d.y - (tempData.datasets[0].data[i]?.y || 0)) > 0.5)
    );
    if (shouldUpdateTemp) {
      setTempData(prev => ({
        datasets: [
          { ...prev.datasets[0], data: tempDataPoints.length ? tempDataPoints : lastTempData },
        ],
      }));
    }
  };

  const refreshGraph = async (type) => {
    try {
      const statsResponse = await axios.get('/api/stats');
      if (statsResponse.status === 200) {
        if (type === 'cpu' || !type) updateChartsFromStats(statsResponse.data.cpuStats);
        if (type === 'memory' || !type) updateChartsFromStats(null, statsResponse.data.memoryStats);
        if (type === 'temp' || !type) updateChartsFromStats(null, null, statsResponse.data.tempStats);
      }
    } catch (err) {
      setError('Error refreshing graph data - Ensure backend is running on http://localhost:5000');
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: {
            minute: 'HH:mm',
          },
        },
        title: {
          display: true,
          text: 'Time (Last 20 Records)',
          font: { size: 14, weight: 'bold' },
          color: '#333333',
        },
        grid: { color: '#e0e0e0' },
      },
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Percentage (%)',
          font: { size: 14, weight: 'bold' },
          color: '#333333',
        },
        grid: { color: '#e0e0e0' },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { size: 12, weight: 'bold' }, color: '#333333' },
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: ${context.parsed.y}${context.dataset.label.includes('Threshold') || context.dataset.label.includes('Temperature') ? '' : '%'}`;
          },
        },
      },
    },
    animation: {
      duration: 1000,
      easing: 'easeOutQuart',
    },
  };

  const tempChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        max: 80, // Adjust max for temperature (e.g., 0-80°C)
        title: {
          display: true,
          text: 'Temperature (°C)',
          font: { size: 14, weight: 'bold' },
          color: '#333333',
        },
      },
    },
    plugins: {
      ...chartOptions.plugins,
      title: {
      },
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-tinno-green-50 to-tinno-green-100 flex items-center justify-center p-2">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl p-4">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-tinno-green-200 border-t-tinno-green-600 rounded-full animate-spin mx-auto mb-2"></div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Retrieving Device Information</h2>
            <p className="text-gray-600 text-sm">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-tinno-green-50 to-tinno-green-100 flex items-center justify-center p-2">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl p-4">
          <div className="text-center">
            <Globe className="w-12 h-12 text-red-500 mx-auto mb-2" />
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Error Loading Device Details</h2>
            <p className="text-gray-600 text-sm mb-3">{error}</p>
            <div className="space-x-2">
              <button
                onClick={fetchInitialData}
                className="bg-tinno-green-600 hover:bg-tinno-green-700 text-white px-4 py-1 rounded transition-colors duration-200 text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-tinno-green-50 to-tinno-green-100 p-2">
      <div className="max-w-5xl mx-auto">
        {/* Device Status Card */}
        <div className="bg-white rounded-xl mt-2 shadow-md p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">Device Status</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-tinno-green-50 p-2 rounded">
              <div className="flex items-center space-x-2">
                <Clock className="w-6 h-6 text-tinno-green-600" />
                <div>
                  <p className="text-xs text-gray-600">Uptime</p>
                  <p className="text-base font-semibold text-gray-900">{summary.uptime || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="bg-tinno-green-50 p-2 rounded">
              <div className="flex items-center space-x-2">
                <Cpu className="w-6 h-6 text-tinno-green-600" />
                <div>
                  <p className="text-xs text-gray-600">CPU Usage</p>
                  <p className="text-base font-semibold text-gray-900">{summary.cpuUsage || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="bg-tinno-green-50 p-2 rounded">
              <div className="flex items-center space-x-2">
                <MemoryStick className="w-6 h-6 text-tinno-green-600" />
                <div>
                  <p className="text-xs text-gray-600">Memory Usage</p>
                  <p className="text-base font-semibold text-gray-900">{summary.memoryUsage || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Device Information Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          {/* Basic Information */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2 flex items-center">
              <Globe className="w-4 h-4 mr-1 text-tinno-green-600" />
              Basic Information
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600 text-sm font-medium">Device Name:</span>
                <span className="text-gray-900 font-semibold text-sm">PON Gateway</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600 text-sm font-medium">Model:</span>
                <span className="text-gray-900 text-sm">B521FG</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600 text-sm font-medium">Manufacturer:</span>
                <span className="text-gray-900 text-sm">Tinno</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-600 text-sm font-medium">Firmware Version:</span>
                <span className="text-gray-900 font-mono text-xs">{summary.firmwareVersion || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Network Information */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2 flex items-center">
              <Network className="w-4 h-4 mr-1 text-tinno-green-600" />
              Network Information
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600 text-sm font-medium">IP Address:</span>
                <span className="text-gray-900 font-mono text-sm">{summary.ipAddress || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600 text-sm font-medium">MAC Address:</span>
                <span className="text-gray-900 font-mono text-xs">{summary.macAddress || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span className="text-gray-600 text-sm font-medium">Gateway:</span>
                <span className="text-gray-900 font-mono text-sm">{summary.defaultGateway || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-600 text-sm font-medium">DNS Servers:</span>
                <span className="text-gray-900 font-mono text-xs">{summary.dnsServers || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reboot Information Card */}
        <div className="bg-white rounded-xl shadow-md p-4 mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
              <Power className="w-5 h-5 mr-1 text-tinno-green-600" />
              Reboot Information
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-tinno-green-50 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <Clock className="w-6 h-6 text-tinno-green-600" />
                <div>
                  <p className="text-xs text-gray-600">Last Reboot Time</p>
                  <p className="text-base font-semibold text-gray-900">{selfheal.lastRebootTime}</p>
                </div>
              </div>
            </div>
            <div className="bg-tinno-green-50 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-6 h-6 text-tinno-green-600" />
                <div>
                  <p className="text-xs text-gray-600">Last Reboot Reason</p>
                  <p className="text-base font-semibold text-gray-900">{selfheal.lastRebootReason}</p>
                </div>
              </div>
            </div>
            <div className="bg-tinno-green-50 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-6 h-6 text-tinno-green-600" />
                <div>
                  <p className="text-xs text-gray-600">Number of Reboots</p>
                  <p className="text-base font-semibold text-gray-900">{selfheal.rebootCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Graphs Section */}
        <div className="grid grid-cols-1 mt-4 lg:grid-cols-2 gap-6">
        {/* CPU Graph */}
        <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <Cpu className="w-6 h-6 mr-2 text-tinno-green-600" />
                CPU Usage Graph
            </h3>
            </div>
            <div className="h-80">
            <Line data={cpuData} options={chartOptions} ref={cpuChartRef} />
            </div>
        </div>

        {/* Memory Graph */}
        <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <MemoryStick className="w-6 h-6 mr-2 text-tinno-green-600" />
                Memory Usage Graph
            </h3>
            </div>
            <div className="h-80">
            <Line data={memoryData} options={chartOptions} ref={memoryChartRef} />
            </div>
        </div>

        {/* Temperature Graph - centered in the grid */}
        <div className="lg:col-span-2 flex justify-center">
            <div className="bg-white rounded-xl shadow-md p-6 w-full lg:w-1/2">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <Thermometer className="w-6 h-6 mr-2 text-tinno-green-600" />
                Temperature Graph
                </h3>
            </div>
            <div className="h-80">
                <Line data={tempData} options={tempChartOptions} ref={tempChartRef} />
            </div>
            </div>
        </div>
        </div>

      </div>
    </div>
  );
}

export default SummaryPage;