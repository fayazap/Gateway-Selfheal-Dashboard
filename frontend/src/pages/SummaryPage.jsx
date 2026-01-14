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
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

// Theme colors matching the page gradient (#c3d7f7 → #cae7ff)
const CHART_THEME = {
  primary: {
    line: '#eb7c15ff',              // blue-500
    area: 'rgba(243, 246, 59, 0.16)',
  },
  threshold: {
    line: '#ec4899',              // pink-500 (softer warning)
    area: 'rgba(236, 72, 153, 0.08)',
  },
  temperature: {
    line: '#eb7c15ff',              // violet-500
    area: 'rgba(243, 246, 59, 0.16)',
  },
  grid: '#dbd7adff',                // very light blue-gray
  text: '#1838a1ff',                // indigo-800 / blue-900
  tooltipBg: 'rgba(53, 112, 167, 0.92)',
  tooltipBorder: '#60a5fa',
};

function SummaryPage() {
  const [summary, setSummary] = useState({});
  const [selfheal, setSelfheal] = useState({
    lastRebootReason: 'No History',
    lastRebootTime: 'No History',
    rebootCount: 0,
    avgCpuThreshold: 0,
    avgMemoryThreshold: 0,
    avgTemperatureThreshold: 0,
  });

  const [cpuData, setCpuData] = useState({
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: [],
        borderColor: CHART_THEME.primary.line,
        backgroundColor: CHART_THEME.primary.area,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
      {
        label: 'Threshold (0%)',
        data: [],
        borderColor: CHART_THEME.threshold.line,
        backgroundColor: CHART_THEME.threshold.area,
        fill: false,
        borderDash: [5, 5],
        pointRadius: 0,
      },
    ],
  });

  const [memoryData, setMemoryData] = useState({
    datasets: [
      {
        label: 'Memory Usage (%)',
        data: [],
        borderColor: CHART_THEME.primary.line,
        backgroundColor: CHART_THEME.primary.area,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
      {
        label: 'Threshold (0%)',
        data: [],
        borderColor: CHART_THEME.threshold.line,
        backgroundColor: CHART_THEME.threshold.area,
        fill: false,
        borderDash: [5, 5],
        pointRadius: 0,
      },
    ],
  });

  const [tempData, setTempData] = useState({
    datasets: [
      {
        label: 'Temperature (°C)',
        data: [],
        borderColor: CHART_THEME.temperature.line,
        backgroundColor: CHART_THEME.temperature.area,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
      {
        label: 'Threshold (0°C)',
        data: [],
        borderColor: CHART_THEME.threshold.line,
        backgroundColor: CHART_THEME.threshold.area,
        fill: false,
        borderDash: [5, 5],
        pointRadius: 0,
      },
    ],
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const cpuChartRef = useRef(null);
  const memoryChartRef = useRef(null);
  const tempChartRef = useRef(null);

  const fetchAndUpdateAll = async () => {
    setError('');
    try {
      const [summaryResponse, selfhealResponse, statsResponse] = await Promise.all([
        axios.get('/api/summary'),
        axios.get('/api/selfheal'),
        axios.get('/api/stats'),
      ]);

      if (summaryResponse.status === 200) setSummary(summaryResponse.data);

      if (selfhealResponse.status === 200 && statsResponse.status === 200) {
        const newSelfheal = {
          lastRebootReason: selfhealResponse.data.lastRebootReason || 'No History',
          lastRebootTime: selfhealResponse.data.lastRebootTime || 'No History',
          rebootCount: selfhealResponse.data.rebootCount || 0,
          avgCpuThreshold: selfhealResponse.data.avgCpuThreshold || 0,
          avgMemoryThreshold: selfhealResponse.data.avgMemoryThreshold || 0,
          avgTemperatureThreshold: selfhealResponse.data.avgTemperatureThreshold || 0,
        };
        setSelfheal(newSelfheal);

        updateChartsFromStats(
          statsResponse.data.cpuStats || [],
          statsResponse.data.memoryStats || [],
          statsResponse.data.tempStats || [],
          newSelfheal
        );
      } else {
        throw new Error('Failed to load selfheal or stats data');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
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

  const updateChartsFromStats = (
    cpuStats = [],
    memoryStats = [],
    tempStats = [],
    thresholds = {}
  ) => {
    const formatTime = (isoTime) => new Date(isoTime);
    const limitLast20 = (data) => (data.length ? data.slice(-20) : []);

    const arraysEqual = (a = [], b = []) =>
      a.length === b.length &&
      a.every((v, i) => v.x.getTime() === b[i].x.getTime() && v.y === b[i].y);

    // CPU
    const cpuUsageData = limitLast20(cpuStats).map((stat) => ({
      x: formatTime(stat.time),
      y: stat.value || 0,
    }));
    const cpuThresholdData = cpuUsageData.map((point) => ({
      x: point.x,
      y: thresholds.avgCpuThreshold || 0,
    }));

    if (
      !arraysEqual(cpuUsageData, cpuData.datasets[0].data) ||
      !arraysEqual(cpuThresholdData, cpuData.datasets[1].data) ||
      cpuData.datasets[1].label !== `Threshold (${thresholds.avgCpuThreshold}%)`
    ) {
      setCpuData({
        datasets: [
          { ...cpuData.datasets[0], data: cpuUsageData },
          {
            ...cpuData.datasets[1],
            data: cpuThresholdData,
            label: `Threshold (${thresholds.avgCpuThreshold}%)`,
          },
        ],
      });
    }

    // Memory
    const memoryUsageData = limitLast20(memoryStats).map((stat) => ({
      x: formatTime(stat.time),
      y: stat.value || 0,
    }));
    const memoryThresholdData = memoryUsageData.map((point) => ({
      x: point.x,
      y: thresholds.avgMemoryThreshold || 0,
    }));

    if (
      !arraysEqual(memoryUsageData, memoryData.datasets[0].data) ||
      !arraysEqual(memoryThresholdData, memoryData.datasets[1].data) ||
      memoryData.datasets[1].label !== `Threshold (${thresholds.avgMemoryThreshold}%)`
    ) {
      setMemoryData({
        datasets: [
          { ...memoryData.datasets[0], data: memoryUsageData },
          {
            ...memoryData.datasets[1],
            data: memoryThresholdData,
            label: `Threshold (${thresholds.avgMemoryThreshold}%)`,
          },
        ],
      });
    }

    // Temperature
    const tempUsageData = limitLast20(tempStats).map((stat) => ({
      x: formatTime(stat.time),
      y: stat.value || 0,
    }));
    const tempThresholdData = tempUsageData.map((point) => ({
      x: point.x,
      y: thresholds.avgTemperatureThreshold || 0,
    }));

    if (
      !arraysEqual(tempUsageData, tempData.datasets[0].data) ||
      !arraysEqual(tempThresholdData, tempData.datasets[1].data) ||
      tempData.datasets[1].label !== `Threshold (${thresholds.avgTemperatureThreshold}°C)`
    ) {
      setTempData({
        datasets: [
          { ...tempData.datasets[0], data: tempUsageData },
          {
            ...tempData.datasets[1],
            data: tempThresholdData,
            label: `Threshold (${thresholds.avgTemperatureThreshold}°C)`,
          },
        ],
      });
    }
  };

  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm',
          },
        },
        title: {
          display: true,
          text: 'Time (Last 20 Records)',
          font: { size: 14, weight: 'bold' },
          color: CHART_THEME.text,
        },
        grid: { color: CHART_THEME.grid },
        ticks: { color: CHART_THEME.text },
      },
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Percentage (%)',
          font: { size: 14, weight: 'bold' },
          color: CHART_THEME.text,
        },
        grid: { color: CHART_THEME.grid },
        ticks: { color: CHART_THEME.text },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 12, weight: 'bold' },
          color: CHART_THEME.text,
          usePointStyle: true,
          boxWidth: 10,
        },
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: CHART_THEME.tooltipBg,
        titleColor: '#ffffff',
        bodyColor: '#e0f2fe',
        borderColor: CHART_THEME.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          label(context) {
            const value = context.parsed.y;
            const label = context.dataset.label;
            const unit = label.includes('Temperature') ? '°C' : '%';
            return `${label}: ${value}${unit}`;
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
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y: {
        ...baseChartOptions.scales.y,
        max: 150,
        title: {
          ...baseChartOptions.scales.y.title,
          text: 'Temperature (°C)',
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#83adec] to-[#bcd7ff] flex items-center justify-center p-2">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl p-4">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Retrieving Device Information</h2>
            <p className="text-gray-600 text-sm">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] flex items-center justify-center p-2">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl p-4">
          <div className="text-center">
            <Globe className="w-12 h-12 text-red-500 mx-auto mb-2" />
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Error Loading Device Details</h2>
            <p className="text-gray-600 text-sm mb-3">{error}</p>
            <Button
              variant="primary"
              size="sm"
              onClick={fetchAndUpdateAll}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] p-2">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Device Status */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Device Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#dbebff] p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <Clock className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-600">Uptime</p>
                  <p className="text-lg font-semibold text-gray-900">{summary.uptime || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="bg-[#dbebff] p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <Cpu className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-600">CPU Usage</p>
                  <p className="text-lg font-semibold text-gray-900">{summary.cpuUsage || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="bg-[#dbebff] p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <MemoryStick className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-600">Memory Usage</p>
                  <p className="text-lg font-semibold text-gray-900">{summary.memoryUsage || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Basic + Network Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
              <Globe className="w-5 h-5 mr-2 text-blue-600" />
              Basic Information
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-blue-100">
                <span className="text-gray-600">Device Name</span>
                <span className="font-medium">PON Gateway</span>
              </div>
              <div className="flex justify-between py-2 border-b border-blue-100">
                <span className="text-gray-600">Model</span>
                <span className="font-medium">B521FG</span>
              </div>
              <div className="flex justify-between py-2 border-b border-blue-100">
                <span className="text-gray-600">Manufacturer</span>
                <span className="font-medium">NA</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Firmware Version</span>
                <span className="font-mono">{summary.firmwareVersion || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center">
              <Network className="w-5 h-5 mr-2 text-blue-600" />
              Network Information
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-blue-100">
                <span className="text-gray-600">IP Address</span>
                <span className="font-mono">{summary.ipAddress || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-blue-100">
                <span className="text-gray-600">MAC Address</span>
                <span className="font-mono">{summary.macAddress || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-blue-100">
                <span className="text-gray-600">Gateway</span>
                <span className="font-mono">{summary.defaultGateway || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">DNS Servers</span>
                <span className="font-mono">{summary.dnsServers || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Events */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Power className="w-5 h-5 mr-2 text-blue-600" />
            Events Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#dbebff] p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <Clock className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-600">Last Event Time</p>
                  <p className="font-semibold">{selfheal.lastRebootTime}</p>
                </div>
              </div>
            </div>
            <div className="bg-[#dbebff] p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-600">Last Event Reason</p>
                  <p className="font-semibold">{selfheal.lastRebootReason}</p>
                </div>
              </div>
            </div>
            <div className="bg-[#dbebff] p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <RefreshCw className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-xs text-gray-600">Number of Events</p>
                  <p className="font-semibold">{selfheal.rebootCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <Cpu className="w-6 h-6 mr-2 text-blue-600" />
              CPU Usage
            </h3>
            <div className="h-80">
              <Line data={cpuData} options={baseChartOptions} ref={cpuChartRef} />
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <MemoryStick className="w-6 h-6 mr-2 text-blue-600" />
              Memory Usage
            </h3>
            <div className="h-80">
              <Line data={memoryData} options={baseChartOptions} ref={memoryChartRef} />
            </div>
          </div>

          <div className="lg:col-span-2 flex justify-center">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-6 w-full max-w-3xl">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Thermometer className="w-6 h-6 mr-2 text-violet-600" />
                Temperature
              </h3>
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