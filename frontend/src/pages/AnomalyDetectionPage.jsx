import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Alert, Button } from 'react-bootstrap';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ShieldCheck, Activity, Cpu, MemoryStick, CheckCircle2,
  XCircle, AlertTriangle, Info, X, Skull, Circle,
} from 'lucide-react';

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
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              padding: '0.875rem 1rem', borderRadius: '0.75rem',
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

function ArmConfirmModal({ open, onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '1rem',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="bg-white rounded-xl shadow-2xl p-5"
            style={{ maxWidth: '440px', width: '100%', borderTop: '4px solid #dc2626' }}
          >
            <div className="flex items-start space-x-3 mb-3">
              <div className="bg-red-50 rounded-full p-2 flex-shrink-0">
                <Skull className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Enable corrective action?</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  This lets the gateway terminate flagged processes automatically, without asking first.
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="light" onClick={onCancel}>Cancel</Button>
              <Button variant="danger" onClick={onConfirm}>Enable corrective action</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatusDot({ color }) {
  const colors = {
    green: '#16a34a',
    amber: '#d97706',
    red: '#dc2626',
    gray: '#9ca3af',
  };
  return (
    <span
      style={{
        display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
        background: colors[color], marginRight: '6px', flexShrink: 0,
      }}
    />
  );
}

function AnomalyDetectionPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [armModalOpen, setArmModalOpen] = useState(false);

  // Local slider state, seeded from the device once loaded, only pushed
  // to the device on explicit Save (dragging a slider shouldn't fire an
  // SNMP SET per pixel).
  const [cpuSlider, setCpuSlider] = useState(35);
  const [memSlider, setMemSlider] = useState(10);
  const [sensitivityDirty, setSensitivityDirty] = useState(false);

  const fetchData = () => {
    axios.get('/api/anomaly-detection')
      .then(res => {
        setData(res.data);
        if (!sensitivityDirty) {
          setCpuSlider(res.data.cpuThreshold);
          setMemSlider(res.data.memThreshold);
        }
        setError('');
      })
      .catch(err => {
        console.error('API Error:', err);
        setError(err.message || 'Failed to fetch anomaly detection data');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeParam = (param, value, successMessage) => {
    axios.post('/api/configure', { param, value: String(value) })
      .then(res => {
        setToast({
          id: Date.now(),
          variant: param === 'tinnoADCorrectiveActionEnable' && value === '1' ? 'warning' : 'success',
          title: 'Configuration updated',
          message: successMessage || `Updated to ${res.data.updatedValue}`,
        });
        fetchData();
      })
      .catch(err => {
        console.error('Update Error:', err);
        setToast({
          id: Date.now(),
          variant: 'danger',
          title: 'Update failed',
          message: err.response?.data?.error || err.message || 'Failed to update parameter',
        });
      });
  };

  const saveSensitivity = () => {
    writeParam('tinnoADNewProcCPUThreshold', cpuSlider, `CPU threshold set to ${cpuSlider}%`);
    writeParam('tinnoADNewProcMemThreshold', memSlider, `Memory threshold set to ${memSlider}%`);
    setSensitivityDirty(false);
  };

  const handleModeSelect = (armed) => {
    const currentlyArmed = data?.correctiveActionEnabled;
    if (armed === currentlyArmed) return;
    if (armed) {
      setArmModalOpen(true);
    } else {
      writeParam('tinnoADCorrectiveActionEnable', '0', 'Corrective action disabled — now detect only');
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-600">Loading...</div>;
  if (error) return <Alert variant="danger" className="m-4">Error: {error}</Alert>;

  const target = data?.currentTarget;
  const hasTarget = target && target.cmd && target.cmd !== '-';
  const armed = data?.correctiveActionEnabled;
  const enabled = data?.enabled;

  // The live-target OIDs don't carry their own kill/log status — derive it
  // by matching the current target's PID against the most recent parsed
  // event, rather than inventing a status the device doesn't report.
  const targetEvent = hasTarget ? data.events?.find((e) => e.pid === String(target.pid)) : null;

  // The live-target OIDs report both CPU and MEM readings together
  // regardless of which one triggered the anomaly -- the schema doesn't
  // record that. Best-effort heuristic: whichever value is currently over
  // ITS OWN threshold; if both are (or neither still is, e.g. the process
  // was already killed and settled), CPU takes display priority.
  const cpuOverThreshold = hasTarget && parseFloat(target.cpuUsage) > data.cpuThreshold;
  const memOverThreshold = hasTarget && parseFloat(target.memUsage) > data.memThreshold;
  const activeResource = hasTarget ? (cpuOverThreshold ? 'CPU' : 'MEM') : null;
  const activeValue = activeResource === 'CPU' ? parseFloat(target?.cpuUsage) : parseFloat(target?.memUsage);
  const activeThreshold = activeResource === 'CPU' ? data?.cpuThreshold : data?.memThreshold;
  const barPercent = hasTarget ? Math.min(100, (activeValue / 100) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 p-2"
    >
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Anomaly Detection</h1>
      </div>

      {/* Status strip */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <div className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Agent</p>
            {(() => {
              const svc = data?.serviceStatus;
              if (!svc || svc.agentRunning === null) {
                return (
                  <>
                    <div className="flex items-center text-base font-semibold text-gray-800">
                      <StatusDot color="gray" />Unknown
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Could not reach device to check</p>
                  </>
                );
              }
              // The Python agent is the actual monitoring engine -- the
              // daemon just supplies process data on request, and can be
              // "running" while the agent it feeds is dead. Lead with the
              // agent's own state rather than collapsing all three into
              // one word, since that's exactly the mismatch that's
              // possible here (and was previously hidden by a hardcoded
              // "Running" that never reflected real device state).
              if (svc.agentRunning) {
                return (
                  <>
                    <div className="flex items-center text-base font-semibold text-gray-800">
                      <StatusDot color="green" />Running
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      PID {svc.agentPid} · daemon {svc.daemonRunning ? 'up' : 'down'} · socket {svc.socketPresent ? 'connected' : 'missing'}
                    </p>
                  </>
                );
              }
              return (
                <>
                  <div className="flex items-center text-base font-semibold text-red-600">
                    <StatusDot color="red" />Not running
                  </div>
                  <p className="text-xs text-red-600 mt-1">
                    Daemon {svc.daemonRunning ? `up (PID ${svc.daemonPid})` : 'also down'} · socket {svc.socketPresent ? 'present' : 'missing'} — no monitoring is happening
                  </p>
                </>
              );
            })()}
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Mode</p>
            <div className="flex items-center text-base font-semibold text-gray-800">
              <StatusDot color={armed ? 'red' : 'green'} />
              {armed ? 'Detect + Respond' : 'Detect only'}
            </div>
            <p className={`text-xs mt-1 ${armed ? 'text-red-600' : 'text-gray-500'}`}>
              {armed ? 'Corrective action on' : 'Corrective action off'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Anomalies</p>
            {/* tinnoADAnomalyCount, read live from /nvram/config/anomaly_detection.cfg
                via SNMP -- the device's own authoritative count. Deliberately
                NOT derived from the local archived events list: that list only
                tracks distinct kill/log INCIDENTS, while this counter increments
                once per detection CYCLE, so the two will never agree and
                shouldn't be shown as if they should. */}
            <p className="text-xl font-bold text-gray-900">{data?.anomalyCount ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">

          {/* Current anomaly */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-800">Current Anomaly</h3>
              <span className="text-xs text-gray-400">Updates every 60s</span>
            </div>

            {!hasTarget ? (
              <div className="flex items-center justify-center text-gray-400 text-sm py-10">
                <CheckCircle2 className="w-5 h-5 mr-2 text-tinno-green-600" />
                No active anomalies — all monitored processes are within threshold.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 pr-3">
                    <p className="font-mono text-sm text-gray-800 break-all">{target.cmd}</p>
                    <p className="font-mono text-xs text-gray-500 mt-1">
                      PID {target.pid} · first seen {target.timestamp}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                    {activeResource}
                  </span>
                </div>

                <div className="flex items-baseline space-x-2 mb-2">
                  <span className={`text-4xl font-bold font-mono ${activeValue > activeThreshold ? 'text-red-600' : 'text-gray-800'}`}>
                    {activeValue}%
                  </span>
                  <span className="text-sm text-gray-500">vs. {activeThreshold}% threshold</span>
                </div>

                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full ${activeValue > activeThreshold ? 'bg-red-500' : 'bg-tinno-green-600'}`}
                    style={{ width: `${barPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 font-mono mb-4">
                  <span>0%</span>
                  <span>threshold {activeThreshold}%</span>
                  <span>100%</span>
                </div>

                <div className="flex items-center justify-between">
                  {targetEvent ? (
                    targetEvent.result === 'killed' ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-red-50 text-red-600">Terminated</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-50 text-amber-600">Logged only</span>
                    )
                  ) : (
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-50 text-amber-600">Detected</span>
                  )}
                  <span className="text-xs text-gray-400">{target.timestamp}</span>
                </div>
              </>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-800">Past Anomalies</h3>
              <span className="text-xs text-gray-400">
                Showing {Math.min(5, data?.events?.length ?? 0)} of {data?.anomalyCount ?? 0} anomalies
              </span>
            </div>

            {!data?.events?.length ? (
              <div className="text-center text-gray-400 text-sm py-8">No anomalies recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">Process</th>
                      <th className="pb-2 pr-3 font-medium">Resource</th>
                      <th className="pb-2 pr-3 font-medium">Value</th>
                      <th className="pb-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.slice(0, 5).map((ev, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-tinno-green-50/40 transition-colors">
                        <td className="py-2 pr-3 font-mono text-xs text-gray-600 whitespace-nowrap">{ev.time}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-gray-700 max-w-[220px] truncate">{ev.cmd}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-gray-600">{ev.resource}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-gray-600">{ev.value != null ? `${ev.value}%` : 'N/A'}</td>
                        <td className="py-2">
                          {ev.result === 'killed' ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 text-red-600">Terminated</span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-600">Logged only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">

          {/* Sensitivity */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Sensitivity</h3>

            <div className="mb-5">
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-sm font-medium text-gray-700">CPU threshold</label>
                <span className="font-mono text-sm font-semibold text-tinno-green-700">{cpuSlider}%</span>
              </div>
              <input
                type="range" min="1" max="100" value={cpuSlider}
                onChange={(e) => { setCpuSlider(Number(e.target.value)); setSensitivityDirty(true); }}
                className="w-full accent-tinno-green-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Flag a new process using more than this share of one CPU core before it has an established baseline.
              </p>
            </div>

            <div className="mb-2">
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-sm font-medium text-gray-700">Memory threshold</label>
                <span className="font-mono text-sm font-semibold text-tinno-green-700">{memSlider}%</span>
              </div>
              <input
                type="range" min="1" max="100" value={memSlider}
                onChange={(e) => { setMemSlider(Number(e.target.value)); setSensitivityDirty(true); }}
                className="w-full accent-tinno-green-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Flag a new process using more than this share of total system memory before it has an established baseline.
              </p>
            </div>

            {sensitivityDirty && (
              <Button variant="success" size="sm" className="w-100 mt-3" onClick={saveSensitivity}>
                Save thresholds
              </Button>
            )}
          </div>

          {/* Corrective action */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Corrective Action</h3>

            <button
              type="button"
              onClick={() => handleModeSelect(false)}
              className={`w-full text-left border rounded-lg p-3 mb-2 transition-colors ${
                !armed ? 'border-tinno-green-600 bg-tinno-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start space-x-2">
                <Circle
                  className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!armed ? 'text-tinno-green-600 fill-tinno-green-600' : 'text-gray-300'}`}
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Detect only</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Flagged processes are logged and reported. Nothing is stopped automatically.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleModeSelect(true)}
              className={`w-full text-left border rounded-lg p-3 mb-3 transition-colors ${
                armed ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start space-x-2">
                <Circle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${armed ? 'text-red-600 fill-red-600' : 'text-gray-300'}`} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Detect and respond</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Flagged processes are stopped automatically after two consecutive over-threshold checks.
                  </p>
                </div>
              </div>
            </button>

            <div className="flex items-start space-x-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <ShieldCheck className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500">
                Core system processes, remote access, and this monitor itself are never terminated, regardless of mode.
              </p>
            </div>
          </div>

          {/* Detection enable (separate from corrective action) */}
          <div className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
            enabled ? 'bg-white border-gray-100' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start space-x-2">
              {enabled ? (
                <ShieldCheck className="w-4 h-4 text-tinno-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`text-sm font-semibold ${enabled ? 'text-gray-800' : 'text-amber-800'}`}>
                  Anomaly detection is {enabled ? 'enabled' : 'disabled'}
                </p>
                <p className={`text-xs mt-0.5 ${enabled ? 'text-gray-500' : 'text-amber-700'}`}>
                  {enabled
                    ? 'The agent is actively monitoring new processes.'
                    : 'No monitoring is happening while this is off.'}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={enabled ? 'outline-secondary' : 'success'}
              onClick={() => writeParam(
                'tinnoADEnable',
                enabled ? '0' : '1',
                enabled ? 'Anomaly detection disabled' : 'Anomaly detection enabled'
              )}
              className="flex-shrink-0"
            >
              {enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>
      </div>

      <ArmConfirmModal
        open={armModalOpen}
        onCancel={() => setArmModalOpen(false)}
        onConfirm={() => {
          setArmModalOpen(false);
          writeParam('tinnoADCorrectiveActionEnable', '1', 'Corrective action on — flagged processes will now be stopped automatically');
        }}
      />

      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </motion.div>
  );
}

export default AnomalyDetectionPage;
