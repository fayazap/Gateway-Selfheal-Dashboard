import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Card, Spinner } from 'react-bootstrap';
import { motion } from 'framer-motion';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function parseNdpiLog(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.warn('parseNdpiLog: empty or invalid input');
    return Array(24).fill().map(() => ({}));
  }

  const lines = text
    .split(/\r?\n/)           // handle both \n and \r\n
    .map(line => line.trim())
    .filter(line => line.length > 0);

  console.log('Total lines after cleaning:', lines.length);

  const dataByHour = Array(24).fill().map(() => ({}));
  let currentHour = -1;
  let parsedEntries = 0;

  for (const line of lines) {
    // Detect hour marker
    const hourMatch = line.match(/^#Hour:(\d+)/i);
    if (hourMatch) {
      currentHour = parseInt(hourMatch[1], 10);
      if (currentHour >= 0 && currentHour < 24) {
        console.log(`Switched to hour ${currentHour}`);
      } else {
        console.warn(`Invalid hour number: ${currentHour}`);
        currentHour = -1;
      }
      continue;
    }

    // Skip lines that don't look like data
    if (!line.includes(',') || currentHour < 0 || currentHour >= 24) {
      continue;
    }

    const parts = line.split(',');
    if (parts.length < 4) continue;

    const [appRaw] = parts;
    const app = appRaw.trim();

    if (app) {
      dataByHour[currentHour][app] = (dataByHour[currentHour][app] || 0) + 1;
      parsedEntries++;
    }
  }

  console.log('Total parsed entries:', parsedEntries);
  console.log('Hours with data:', 
    dataByHour
      .map((h, i) => Object.keys(h).length > 0 ? i : null)
      .filter(x => x !== null)
  );

  return dataByHour;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#d946ef',
  // add more if needed
];

function Traffic24hPage() {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

 useEffect(() => {
  fetch('/ndpi_data.txt')  // or your API endpoint
    .then(r => {
      if (!r.ok) throw new Error('Failed to load nDPI data');
      return r.text();
    })
    .then(text => {
      const byHour = parseNdpiLog(text); // your existing parse function

      // 1. Collect total count per protocol across all hours
      const protocolTotals = {};
      byHour.forEach(hourData => {
        Object.entries(hourData).forEach(([proto, count]) => {
          protocolTotals[proto] = (protocolTotals[proto] || 0) + count;
        });
      });

      // 2. Get sorted list of protocols by total count (descending)
      let sortedProtocols = Object.entries(protocolTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([proto]) => proto);

      // 3. Force include "Teams" if it exists
      const majorProtocols = new Set();
      if (sortedProtocols.includes('Teams')) {
        majorProtocols.add('Teams');
        sortedProtocols = sortedProtocols.filter(p => p !== 'Teams');
      }

      // 4. Take top 4 (or 5 if Teams is included)
      const topN = 5;
      sortedProtocols.slice(0, topN).forEach(p => majorProtocols.add(p));

      const displayProtocols = Array.from(majorProtocols);

      // 5. Prepare chart datasets
      const datasets = displayProtocols.map((proto, idx) => ({
        label: proto,
        data: byHour.map(hour => hour[proto] || 0),
        backgroundColor: COLORS[idx % COLORS.length] + 'cc',
        borderColor: COLORS[idx % COLORS.length],
        borderWidth: 1,
      }));

      // 6. Add "Other" category
      const otherData = byHour.map(hour => {
        let totalInHour = 0;
        Object.entries(hour).forEach(([proto, count]) => {
          if (!displayProtocols.includes(proto)) {
            totalInHour += count;
          }
        });
        return totalInHour;
      });

      if (otherData.some(v => v > 0)) {
        datasets.push({
          label: 'Other',
          data: otherData,
          backgroundColor: 'rgba(156, 163, 175, 0.7)', // gray
          borderColor: 'rgba(107, 114, 128, 0.9)',
          borderWidth: 1,
        });
      }

      setChartData({
        labels: Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`),
        datasets,
      });

      setLoading(false);
    })
    .catch(err => {
      setError(err.message);
      setLoading(false);
    });
}, []);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { size: 12 }, boxWidth: 12 },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
      title: {
        display: true,
        text: '24-Hour Application / Protocol Usage (nDPI)',
        font: { size: 16, weight: 'bold' },
        color: '#1e40af',
      },
    },
    scales: {
      x: {
        stacked: true,
        title: { display: true, text: 'Hour of Day' },
      },
      y: {
        stacked: true,
        title: { display: true, text: 'Number of Detections' },
        beginAtZero: true,
      },
    },
  };

  if (loading) return <div className="text-center py-10"><Spinner animation="border" /></div>;
  if (error) return <div className="alert alert-danger m-4">Error: {error}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff]"
    >
      <Card className="bg-white/85 backdrop-blur-sm shadow-xl rounded-2xl border border-blue-200/40">
        <Card.Header className="bg-gradient-to-r from-[#83adec] to-[#bcd7ff] text-white">
          <h4 className="mb-0">24-Hour Traffic Breakdown (nDPI Classification)</h4>
        </Card.Header>
        <Card.Body style={{ height: '500px' }}>
          <Bar data={chartData} options={options} />
        </Card.Body>
      </Card>
    </motion.div>
  );
}

export default Traffic24hPage;