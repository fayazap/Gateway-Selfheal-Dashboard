import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Cloud, AlertCircle, ArrowRight, Zap } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

function LeftAntennaIcon({ T }) {
  return (
    <svg width="56" height="96" viewBox="0 0 56 96" fill="none">
      {/* Base horizontal connector — the _ in \_* */}
      <rect x="18" y="72" width="38" height="3.5" rx="1.75" fill={T.accent} opacity="0.65" />
      {/* Joint nub where rod meets base */}
      <circle cx="20" cy="73.5" r="3.5" fill={T.accent} opacity="0.5" />
      {/* Diagonal rod — the \ in \_* */}
      <line x1="20" y1="73" x2="7" y2="14" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      {/* Glow halos around tip */}
      <circle cx="7" cy="10" r="14" fill="none" stroke={T.accent} strokeWidth="0.5" opacity="0.10" />
      <circle cx="7" cy="10" r="10" fill="none" stroke={T.accent} strokeWidth="0.8" opacity="0.22" />
      <circle cx="7" cy="10" r="6.5" fill="none" stroke={T.accent} strokeWidth="1" opacity="0.4" />
      {/* Glowing tip — the * in \_* */}
      <circle cx="7" cy="10" r="4.5" fill={T.accent} style={{ filter: `drop-shadow(0 0 8px ${T.accent})` }} />
    </svg>
  );
}

function RightAntennaIcon({ T }) {
  return (
    <svg width="56" height="96" viewBox="0 0 56 96" fill="none">
      {/* Base horizontal connector — the _ in *_/ */}
      <rect x="0" y="72" width="38" height="3.5" rx="1.75" fill={T.accent} opacity="0.65" />
      {/* Joint nub where rod meets base */}
      <circle cx="36" cy="73.5" r="3.5" fill={T.accent} opacity="0.5" />
      {/* Diagonal rod — the / in *_/ */}
      <line x1="36" y1="73" x2="49" y2="14" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      {/* Glow halos around tip */}
      <circle cx="49" cy="10" r="14" fill="none" stroke={T.accent} strokeWidth="0.5" opacity="0.10" />
      <circle cx="49" cy="10" r="10" fill="none" stroke={T.accent} strokeWidth="0.8" opacity="0.22" />
      <circle cx="49" cy="10" r="6.5" fill="none" stroke={T.accent} strokeWidth="1" opacity="0.4" />
      {/* Glowing tip — the * in *_/ */}
      <circle cx="49" cy="10" r="4.5" fill={T.accent} style={{ filter: `drop-shadow(0 0 8px ${T.accent})` }} />
    </svg>
  );
}

function DashLine({ color }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
      <div style={{
        flex: 1, height: 2,
        backgroundImage: `repeating-linear-gradient(90deg, ${color} 0, ${color} 8px, transparent 8px, transparent 18px)`,
        backgroundSize: '26px 2px',
        animation: 'dashFlow 0.8s linear infinite',
        opacity: 0.7,
      }} />
      <div style={{
        width: 0, height: 0, flexShrink: 0,
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderLeft: `8px solid ${color}`,
        opacity: 0.7,
      }} />
    </div>
  );
}

function RouterFoot({ T, theme }) {
  const isDark = theme === 'dark';
  return (
    <svg width="44" height="32" viewBox="0 0 44 32" fill="none">
      {/* Stand pillar — tapered, wider at bottom */}
      <path
        d="M16 0 H28 L31 22 H13 Z"
        fill={isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.11)'}
        stroke={T.border} strokeWidth="1"
      />
      {/* Highlight ridge on pillar left edge */}
      <line x1="18" y1="2" x2="15" y2="20"
        stroke={isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.45)'}
        strokeWidth="2" strokeLinecap="round" />
      {/* Flat rubber base foot */}
      <rect
        x="2" y="22" width="40" height="8" rx="4"
        fill={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)'}
        stroke={T.border} strokeWidth="1"
      />
      {/* Rubber grip notch in center of base */}
      <rect x="18" y="25" width="8" height="2" rx="1"
        fill={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)'} />
      {/* Ground shadow */}
      <ellipse cx="22" cy="31.5" rx="16" ry="2"
        fill="rgba(0,0,0,0.12)" />
    </svg>
  );
}

function LoginPage({ setIsLoggedIn }) {
  const { T, theme } = useTheme();
  const [ipAddress, setIpAddress] = useState('');
  const [error, setError]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate                  = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await axios.post('/api/test-connection', { host: ipAddress });
      if (response.data.success) {
        await axios.post('/api/update-ssh-host', { host: ipAddress });
        localStorage.setItem('sshHost', ipAddress);
        setIsLoggedIn(true);
        navigate('/');
      } else {
        setError('Connection successful but unexpected response.');
      }
    } catch {
      setError('Failed to connect. Please check the IP address and ensure the device is reachable.');
    } finally {
      setIsLoading(false);
    }
  };

  const isDark = theme === 'dark';

  const bgStyle = isDark
    ? { background: 'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.12) 0%, transparent 55%), #09090b' }
    : { background: 'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.06) 0%, transparent 55%), #eef0f6' };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: "'Inter', system-ui, sans-serif", ...bgStyle,
    }}>
      <style>{`
        @keyframes dashFlow { to { background-position: 26px 0; } }
        @keyframes logo-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 24px rgba(99,102,241,0.4); }
          50% { box-shadow: 0 0 40px rgba(99,102,241,0.75), 0 0 64px rgba(6,182,212,0.3); }
        }
      `}</style>

      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: isDark
          ? 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)'
          : 'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px', pointerEvents: 'none',
      }} />

      {/* Layout: [ISP 264×264] ──dashes──▶ [Antennas + Card + Feet] ──dashes──▶ [Clients 264×264] */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'relative', zIndex: 1, width: '100%', maxWidth: 1100,
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {/* LEFT: ISP glass card — fixed 264×264 */}
        <div style={{
          width: 264, height: 264, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 10, padding: '20px 16px 14px', boxSizing: 'border-box',
          background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 20,
          boxShadow: isDark
            ? '0 0 0 1px rgba(255,255,255,0.04), 0 16px 48px rgba(0,0,0,0.45)'
            : '0 4px 24px rgba(0,0,0,0.09)',
          backdropFilter: 'blur(16px)',
        }}>
          <img src="/ISP.png" alt="ISP"
            style={{ flex: 1, width: '100%', objectFit: 'contain', minHeight: 0, filter: isDark ? 'brightness(0) invert(1)' : 'none' }} />
          <span style={{
            fontSize: 11, color: T.textMuted, letterSpacing: '0.06em',
            fontWeight: 600, textTransform: 'uppercase', flexShrink: 0,
          }}>
            ISP
          </span>
        </div>

        {/* LEFT animated connector */}
        <DashLine color={T.accent} />

        {/* CENTER: Router body — card flanked by antennas, feet below */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 400, flexShrink: 0 }}>

          {/* LEFT ANTENNA — \_* shape, attached to left side */}
          <div style={{ position: 'absolute', left: -50, top: 18, zIndex: 2 }}>
            <LeftAntennaIcon T={T} />
          </div>

          {/* RIGHT ANTENNA — *_/ shape, attached to right side */}
          <div style={{ position: 'absolute', right: -50, top: 18, zIndex: 2 }}>
            <RightAntennaIcon T={T} />
          </div>

          {/* Main login card */}
          <div style={{
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            padding: '40px 36px',
            boxShadow: isDark
              ? '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.5)'
              : '0 4px 24px rgba(0,0,0,0.1)',
          }}>
            {/* Cloud icon + title */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                marginBottom: 16,
                animation: 'glowPulse 3s ease-in-out infinite',
              }}>
                <Cloud size={26} color="#fff" />
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.01em' }}>
                AI-Driven Edge Intelligence
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: T.textMuted, lineHeight: 1.4 }}>
                Connect to your Gateway to access<br />AI-driven network management
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{
                  display: 'block', fontSize: 12, fontWeight: 600,
                  color: T.textSec, marginBottom: 7, letterSpacing: '0.02em',
                }}>
                  GATEWAY IP ADDRESS
                </label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={e => setIpAddress(e.target.value)}
                  placeholder="e.g. 192.168.1.1"
                  required
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: T.elevated, border: `1px solid ${T.border}`,
                    borderRadius: 9, fontSize: 14, color: T.textPrimary,
                    outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'monospace', transition: 'border-color 0.15s, box-shadow 0.15s',
                    letterSpacing: '0.04em',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = T.accent;
                    e.target.style.boxShadow = `0 0 0 3px ${T.accentMuted}`;
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = T.border;
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '10px 12px',
                    background: T.dangerBg, border: `1px solid ${T.danger}30`,
                    borderRadius: 8, color: T.danger, fontSize: 12, lineHeight: 1.5,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </motion.div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '12px',
                  background: isLoading ? T.elevated : 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                  border: 'none', borderRadius: 9,
                  color: isLoading ? T.textMuted : '#fff',
                  fontSize: 14, fontWeight: 600,
                  cursor: isLoading ? 'default' : 'pointer',
                  transition: 'opacity 0.15s', letterSpacing: '0.01em',
                  boxShadow: isLoading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)',
                }}
              >
                {isLoading ? (
                  <>
                    <div style={{
                      width: 14, height: 14,
                      border: `2px solid ${T.textMuted}`, borderTopColor: T.accent,
                      borderRadius: '50%', animation: 'logo-spin 0.8s linear infinite',
                    }} />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    Connect to Gateway
                    <ArrowRight size={14} />
                  </>
                )}
              </motion.button>
            </form>
          </div>

          {/* Router feet — symmetrical stands at bottom corners */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 28, paddingRight: 28 }}>
            <RouterFoot T={T} theme={theme} />
            <RouterFoot T={T} theme={theme} />
          </div>

          {/* Powered by badge */}
          <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Zap size={10} color={T.accent} />
              Gateway . AI-Driven Edge Intelligence
            </div>
          </div>
        </div>

        {/* RIGHT animated connector */}
        <DashLine color={T.accentSub} />

        {/* RIGHT: Clients glass card — fixed 264×264 */}
        <div style={{
          width: 264, height: 264, flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 10, padding: '20px 16px 14px', boxSizing: 'border-box',
          background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 20,
          boxShadow: isDark
            ? '0 0 0 1px rgba(255,255,255,0.04), 0 16px 48px rgba(0,0,0,0.45)'
            : '0 4px 24px rgba(0,0,0,0.09)',
          backdropFilter: 'blur(16px)',
        }}>
          <img src="/clients.png" alt="Clients"
            style={{ flex: 1, width: '100%', objectFit: 'contain', minHeight: 0, filter: isDark ? 'brightness(0) invert(1)' : 'none' }} />
          <span style={{
            fontSize: 11, color: T.textMuted, letterSpacing: '0.06em',
            fontWeight: 600, textTransform: 'uppercase', flexShrink: 0,
          }}>
            Clients
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export default LoginPage;
