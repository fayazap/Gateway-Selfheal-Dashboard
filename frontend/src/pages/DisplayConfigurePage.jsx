import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Server, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import PropagateLoader from '../components/PropagateLoader';

const R = 14;
const FONT = "'Inter', system-ui, sans-serif";

function DisplayConfigurePage() {
  const { T } = useTheme();
  const [selfheal, setSelfheal] = useState({ params: {}, reboots: [], avgCpuThreshold: 0, avgMemoryThreshold: 0 });
  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState('display');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/selfheal')
      .then(res => {
        if (!res.data || !res.data.params) throw new Error('Invalid API response: params not found');
        setSelfheal(res.data);
        setFormData(Object.fromEntries(
          Object.entries(res.data.params)
            .filter(([key]) => key.includes('Threshold') || key.includes('Enable') || key.includes('Server') || key.includes('Interval') || key.includes('Needed'))
            .map(([key, value]) => [key, value])
        ));
      })
      .catch(err => setError(err.message || 'Failed to fetch selfheal data'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (key) => {
    setSuccess(''); setError('');
    axios.post('/api/configure', { param: key, value: formData[key] })
      .then(res => {
        setSuccess(`Updated ${key} to ${res.data.updatedValue}`);
        axios.get('/api/selfheal').then(r => setSelfheal(r.data));
      })
      .catch(err => setError(err.message || 'Failed to update parameter'));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)' }}>
        <PropagateLoader label="Loading configuration..." />
      </div>
    );
  }

  const TABS = [
    { key: 'display', label: 'Display', Icon: Server },
    { key: 'configure', label: 'Configure', Icon: Settings },
  ];

  const cardStyle = {
    background: T.cardBg,
    border: `1px solid ${T.border}`,
    borderRadius: R,
    boxShadow: T.shadow,
    overflow: 'hidden',
    marginBottom: 20,
  };

  const sectionHeaderStyle = {
    padding: '11px 16px',
    background: T.elevated,
    borderBottom: `1px solid ${T.border}`,
    fontSize: 13,
    fontWeight: 600,
    color: T.textSec,
  };

  const thStyle = {
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: `1px solid ${T.border}`,
    background: T.elevated,
    textAlign: 'left',
  };

  const tdStyle = {
    padding: '10px 14px',
    fontSize: 13,
    color: T.textSec,
    borderBottom: `1px solid ${T.border}`,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ padding: '24px 24px 40px', maxWidth: 1000, margin: '0 auto', fontFamily: FONT }}
    >
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 20,
        background: T.elevated,
        border: `1px solid ${T.border}`,
        borderRadius: R,
        padding: 4,
        width: 'fit-content',
      }}>
        {TABS.map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? '#fff' : T.textMuted,
                background: active ? T.accent : 'transparent',
                transition: 'all 0.15s',
                fontFamily: FONT,
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Alert banners */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: T.successBg, border: `1px solid ${T.success}30`,
            color: T.success, fontSize: 13,
          }}
        >
          <CheckCircle size={15} />
          {success}
        </motion.div>
      )}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: T.dangerBg, border: `1px solid ${T.danger}30`,
            color: T.danger, fontSize: 13,
          }}
        >
          <AlertCircle size={15} />
          Error: {error}
        </motion.div>
      )}

      {/* DISPLAY TAB */}
      {activeTab === 'display' && (
        <>
          {/* Selfheal Parameters */}
          <div style={cardStyle}>
            <div style={sectionHeaderStyle}>Selfheal Parameters</div>
            {Object.keys(selfheal.params).length === 0 ? (
              <div style={{ padding: '16px', color: T.textMuted, fontSize: 13 }}>No parameters available to display.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Parameter</th>
                    <th style={thStyle}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selfheal.params).map(([key, value]) =>
                    !key.includes('Reboot.') && (
                      <tr key={key} style={{ transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = T.hover}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={tdStyle}>{key.replace('X_TINNO-COM_SelfHeal.', '')}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{value}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Reboot Logs */}
          <div style={cardStyle}>
            <div style={sectionHeaderStyle}>SelfHeal Event Logs</div>
            {selfheal.reboots.length === 0 ? (
              <div style={{ padding: '16px', color: T.textMuted, fontSize: 13 }}>No reboot logs available.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Reason</th>
                    <th style={thStyle}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {selfheal.reboots.map((log, index) => (
                    <tr key={index}
                      onMouseEnter={e => e.currentTarget.style.background = T.hover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={tdStyle}>{log.reason}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{log.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* CONFIGURE TAB */}
      {activeTab === 'configure' && (
        <div style={cardStyle}>
          <div style={sectionHeaderStyle}>Configure Self-Healing Parameters</div>
          {Object.keys(formData).length === 0 ? (
            <div style={{ padding: '16px', color: T.textMuted, fontSize: 13 }}>No configurable parameters available.</div>
          ) : (
            <div style={{ padding: '16px 20px' }}>
              {Object.keys(formData).map(key => (
                <div key={key} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.5fr auto',
                  gap: 12,
                  alignItems: 'center',
                  paddingBottom: 14,
                  marginBottom: 14,
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  <label style={{ fontSize: 13, color: T.textSec, fontWeight: 500 }}>
                    {key.replace('X_TINNO-COM_SelfHeal.', '')}
                  </label>
                  <input
                    name={key}
                    value={formData[key] || ''}
                    onChange={handleChange}
                    style={{
                      padding: '8px 12px',
                      background: T.elevated,
                      border: `1px solid ${T.border}`,
                      borderRadius: 8,
                      color: T.textPrimary,
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: FONT,
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = T.accent; e.target.style.boxShadow = `0 0 0 3px ${T.accentMuted}`; }}
                    onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleSubmit(key)}
                    style={{
                      padding: '8px 18px',
                      background: T.accent,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: FONT,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Update
                  </motion.button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default DisplayConfigurePage;
