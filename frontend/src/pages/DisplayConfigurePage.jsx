import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Tabs, Tab, Table, Alert, Card, Form, Button, Row, Col } from 'react-bootstrap';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import { Server, Settings, CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// Fixed order + human labels for the Configure form, matching Selfheal-Dashboard's
// original "Configure Device Status" layout. Values are seeded from `raw` (the
// device-native SNMP value), never from the human-formatted display string, so a
// resubmit without edits always sends a value the device understands (e.g. 1, not
// "Enabled").
const CONFIG_FIELDS = [
  { key: 'tinnoSelfhealEnable', label: 'Self-Heal Enable', kind: 'enable' },
  { key: 'tinnoRMInterval', label: 'RM Interval (mins)', kind: 'number', min: 1, max: 60 },
  { key: 'tinnoAvgCPUThreshold', label: 'Avg CPU Threshold (%)', kind: 'number', min: 10, max: 100 },
  { key: 'tinnoAvgMemoryThreshold', label: 'Avg Memory Threshold (%)', kind: 'number', min: 10, max: 100 },
  { key: 'tinnoConnTestPingInterval', label: 'Connectivity Test Ping Interval (mins)', kind: 'number', min: 1, max: 60 },
  { key: 'tinnoIPv4PingServer', label: 'Connectivity Server', kind: 'ipv4' },
  { key: 'tinnoSHSpeedTestEnable', label: 'SpeedTest Enable', kind: 'enable' },
  { key: 'tinnoSHSpeedTestInterval', label: 'SpeedTest Interval (mins)', kind: 'number', min: 1, max: 360 },
  { key: 'tinnoSHSpeedTestThreshold', label: 'SpeedTest Threshold (Mbps)', kind: 'number', min: 10, max: 1000 },
  { key: 'tinnoCmDoc31AccessSshEnable', label: 'SSH Access Enable', kind: 'enable' },
];

const RANGE_ERROR = 'Please enter a valid value within the allowed range.';

function hintFor({ kind, min, max }) {
  if (kind === 'number') return `Min: ${min}, Max: ${max}`;
  return null;
}

// Returns an error message when the value must not be sent to the device, or null when valid.
function validateField(field, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (field.kind !== 'number') return null;

  const num = Number(value);
  if (value === '' || !Number.isInteger(num)) return RANGE_ERROR;
  return num >= field.min && num <= field.max ? null : RANGE_ERROR;
}

const TOAST_VARIANTS = {
  success: { Icon: CheckCircle2, accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  danger: { Icon: XCircle, accent: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  warning: { Icon: AlertTriangle, accent: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  info: { Icon: Info, accent: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
};

const TOAST_AUTO_DISMISS_MS = 4000;

function ToastNotification({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  return (
    <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 2000, maxWidth: 'min(380px, calc(100vw - 2rem))' }}>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              borderRadius: '0.75rem',
              background: TOAST_VARIANTS[toast.variant].bg,
              border: `1px solid ${TOAST_VARIANTS[toast.variant].border}`,
              borderLeft: `4px solid ${TOAST_VARIANTS[toast.variant].accent}`,
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 10px -6px rgba(0,0,0,0.1)',
            }}
          >
            {(() => {
              const { Icon, accent } = TOAST_VARIANTS[toast.variant];
              return <Icon size={20} style={{ color: accent, flexShrink: 0, marginTop: '2px' }} />;
            })()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>{toast.title}</div>
              <div style={{ fontSize: '0.825rem', color: '#4b5563', marginTop: '2px', overflowWrap: 'break-word' }}>
                {toast.message}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close notification"
              style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function buildFormData(raw = {}) {
  const formData = {};
  CONFIG_FIELDS.forEach(({ key }) => {
    const value = raw[key];
    formData[key] = value === undefined || value === null ? '' : String(value);
  });
  return formData;
}

function DisplayConfigurePage() {
  const [selfheal, setSelfheal] = useState({ params: {}, reboots: [], avgCpuThreshold: 0, avgMemoryThreshold: 0 });
  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState('display');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/selfheal')
      .then(res => {
        if (!res.data || !res.data.params) {
          throw new Error('Invalid API response: params not found');
        }
        setSelfheal(res.data);
        setFormData(buildFormData(res.data.raw));
      })
      .catch(err => {
        console.error('API Error:', err); // Debug: Log the error
        setError(err.message || 'Failed to fetch selfheal data');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (key) => {
    const field = CONFIG_FIELDS.find((f) => f.key === key);
    const validationError = validateField(field, formData[key]);
    if (validationError) {
      setToast({ id: Date.now(), variant: 'danger', title: 'Invalid value', message: validationError });
      return;
    }

    axios.post('/api/configure', { param: key, value: formData[key] })
      .then(res => {
        setToast({
          id: Date.now(),
          variant: 'success',
          title: 'Configuration updated',
          message: `Updated ${field.label} to ${res.data.updatedValue}`,
        });
        // Refresh selfheal data after successful update
        axios.get('/api/selfheal').then(res => {
          setSelfheal(res.data);
          setFormData(buildFormData(res.data.raw));
        });
      })
      .catch(err => {
        console.error('Update Error:', err); // Debug: Log the update error
        setToast({
          id: Date.now(),
          variant: 'danger',
          title: 'Update failed',
          message: err.response?.data?.error || err.message || 'Failed to update parameter',
        });
      });
  };

  if (loading) return <div className="text-center py-10 text-gray-600">Loading...</div>;
  if (error) return <Alert variant="danger" className="m-4">Error: {error}</Alert>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 p-4 bg-gray-50 min-h-screen"
    >
      {/* Tabs for Display and Configure */}
      <Card className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-200">
        <Card.Header className="bg-green-100 from-tinno-green-700 to-tinno-green-600 text-white p-4">
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="mb-0"
            variant="pills"
          >
            <Tab eventKey="display" className="bg-green-700" title={<span><Server className="mr-2" size={18} /> Display</span>} />
            <Tab eventKey="configure" title={<span><Settings className="mr-2" size={18} /> Configure</span>} />
          </Tabs>
        </Card.Header>
        <Card.Body className="p-6">
          {/* Display Tab */}
          {activeTab === 'display' && (
            <>
              {/* Selfheal Parameters */}
              <Card className="mb-6 border-0 shadow-sm">
                <Card.Header className="bg-tinno-green-50 text-tinno-green-700 p-3 font-semibold">
                  Selfheal Parameters
                </Card.Header>
                <Card.Body>
                  {Object.keys(selfheal.params).length === 0 ? (
                    <Alert variant="warning" className="m-2">
                      No parameters available to display.
                    </Alert>
                  ) : (
                    <Table striped bordered hover className="text-gray-700">
                      <thead>
                        <tr>
                          <th className="bg-tinno-green-100 text-tinno-green-700 font-medium p-2">Parameter</th>
                          <th className="bg-tinno-green-100 text-tinno-green-700 font-medium p-2">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(selfheal.params).map(([key, value]) => (
                          !key.includes('Reboot.') && (
                            <tr key={key} className="hover:bg-tinno-green-50 transition-colors">
                              <td className="p-2">{key.replace('X_TINNO-COM_SelfHeal.', '')}</td>
                              <td className="p-2">{value}</td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card.Body>
              </Card>

              {/* Reboot Logs */}
              <Card className="border-0 shadow-sm">
                <Card.Header className="bg-tinno-green-50 text-tinno-green-700 p-3 font-semibold">
                  SelfHeal Event Logs
                </Card.Header>
                <Card.Body>
                  {selfheal.reboots.length === 0 ? (
                    <Alert variant="info" className="m-2 bg-blue-50">
                      No reboot logs available.
                    </Alert>
                  ) : (
                    <Table striped bordered hover className="text-gray-700">
                      <thead>
                        <tr>
                          <th className="bg-tinno-green-100 text-tinno-green-700 font-medium p-2">Reason</th>
                          <th className="bg-tinno-green-100 text-tinno-green-700 font-medium p-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selfheal.reboots.map((log, index) => (
                          <tr key={index} className="hover:bg-tinno-green-50 transition-colors">
                            <td className="p-2">{log.reason}</td>
                            <td className="p-2">{log.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card.Body>
              </Card>
            </>
          )}

          {/* Configure Tab */}
          {activeTab === 'configure' && (
            <Card className="border-0 shadow-sm">
              <Card.Header className="bg-tinno-green-50 text-tinno-green-700 p-3 font-semibold">
                Configure Self-Healing Parameters
              </Card.Header>
              <Card.Body>
                <Form>
                  {CONFIG_FIELDS.map((field) => {
                    const { key, label, kind, min, max } = field;
                    const hint = hintFor(field);
                    const shouldShowTooltip = Boolean(hint) && key !== 'tinnoIPv4PingServer';
                    const tooltipProps = shouldShowTooltip
                      ? { 'data-tooltip-id': 'tooltip-config', 'data-tooltip-content': hint }
                      : {};
                    return (
                      <Row key={key} className="mb-4 align-items-center">
                        <Col md={4}>
                          <Form.Label className="text-gray-700">{label}</Form.Label>
                        </Col>
                        <Col md={6}>
                          {kind === 'enable' ? (
                            <Form.Select
                              name={key}
                              value={formData[key] ?? ''}
                              onChange={handleChange}
                              className="border-tinno-gray-500"
                            >
                              <option value="1">Enabled</option>
                              <option value="0">Disabled</option>
                            </Form.Select>
                          ) : (
                            <Form.Control
                              type={kind === 'number' ? 'number' : 'text'}
                              name={key}
                              value={formData[key] ?? ''}
                              onChange={handleChange}
                              min={min}
                              max={max}
                              className="border-tinno-gray-500"
                              {...tooltipProps}
                            />
                          )}
                        </Col>
                        <Col md={2}>
                          <Button variant="success" onClick={() => handleSubmit(key)} className="w-100">
                            Update
                          </Button>
                        </Col>
                      </Row>
                    );
                  })}
                </Form>
              </Card.Body>
            </Card>
          )}
        </Card.Body>
      </Card>

      <Tooltip
        id="tooltip-config"
        place="top"
        offset={10}
        opacity={1}
        border="1px solid #e5e7eb"
        style={{
          background: '#ffffff',
          color: '#374151',
          borderRadius: '0.5rem',
          padding: '0.15rem 0.15rem',
          fontSize: '0.8rem',
          fontWeight: 500,
          letterSpacing: '0.01em',
          boxShadow: '0 6px 16px -6px rgba(0,0,0,0.2)',
          maxWidth: 'min(280px, 90vw)',
          zIndex: 1900,
        }}
      />

      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </motion.div>
  );
}

export default DisplayConfigurePage;
