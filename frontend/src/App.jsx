import React, { useState, useEffect, useContext } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import 'primereact/resources/themes/lara-dark-indigo/theme.css';
import 'primereact/resources/primereact.css';
import {
  BarChart2, Server, Activity, Wifi, Home, Info, LogOut,
  ChevronDown, ChevronLeft, Menu, Sun, Moon, Zap, ShieldAlert,
} from 'lucide-react';
import { ThemeContext } from './contexts/ThemeContext';
import SummaryPage from './pages/SummaryPage.jsx';
import DisplayConfigurePage from './pages/DisplayConfigurePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import LCMPage from './pages/LCMPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import WifiChannelAnalyzerPage from './pages/WifiChannelAnalyzerPage.jsx';
import AnomalyDetectionDashboard from './pages/AnomalyDetectionDashboard.jsx';
import SmartBandwidthAllocator from './pages/SmartBandwidthAllocator.jsx';
import UrlIotFingerprintingPage from './pages/UrlIotFingerprintingPage.jsx';

/* ─── Custom SVG Icons ──────────────────────────────────── */
const WaveIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const ShieldIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

/* ─── AI Sub-items ──────────────────────────────────────── */
const AI_CHILDREN = [
  { to: '/wifi-channel-analyzer', label: 'Smart Wi-Fi Channel Allocator',       Icon: ({ c }) => <Wifi size={19} color={c} /> },
  { to: '/anomaly-detection',     label: 'Anomaly Detector',    Icon: ({ c }) => <ShieldIcon size={19} color={c} /> },
  { to: '/smart-bandwidth',       label: 'Smart Bandwidth Allocator',      Icon: ({ c }) => <WaveIcon  size={19} color={c} /> },
  { to: '/url-iot-fingerprinting', label: 'Smart Security Service',      Icon: ({ c }) => <ShieldAlert size={19} color={c} /> },
];
const AI_PATHS = AI_CHILDREN.map(c => c.to);

/* ─── Sidebar NavItem ───────────────────────────────────── */
function NavItem({ to, label, Icon, collapsed, T, active, small }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: small ? '8px 12px' : '10px 12px',
          margin: small ? '1px 8px 1px 20px' : '2px 8px',
          borderRadius: 7,
          cursor: 'pointer',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: active
            ? `linear-gradient(135deg, ${T.accentMuted}, rgba(34,211,238,0.06))`
            : 'transparent',
          borderLeft: active ? `2px solid ${T.accent}` : '2px solid transparent',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.accentMuted; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Icon c={active ? T.accent : T.textMuted} />
        </span>
        {!collapsed && (
          <span style={{
            fontSize: small ? 15 : 16,
            fontWeight: active ? 600 : 500,
            color: active ? T.accent : T.textSec,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}>
            {label}
          </span>
        )}
        {active && !collapsed && (
          <div style={{
            marginLeft: 'auto',
            width: 5, height: 5,
            borderRadius: '50%',
            background: T.accent,
            boxShadow: `0 0 8px ${T.accent}`,
          }} />
        )}
      </div>
    </NavLink>
  );
}

/* ─── Sidebar ───────────────────────────────────────────── */
function AppSidebar({ collapsed, setCollapsed, T, theme }) {
  const location = useLocation();
  const isActive  = (to) => location.pathname === to;
  const isAIOpen  = AI_PATHS.includes(location.pathname);
  const [aiOpen, setAiOpen] = useState(isAIOpen);

  useEffect(() => { if (isAIOpen) setAiOpen(true); }, [location.pathname]);

  const sidebarBg = theme === 'dark'
    ? 'linear-gradient(180deg, #0d1117 0%, #0f172a 100%)'
    : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)';

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: sidebarBg,
        borderRight: `1px solid ${T.border}`,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* ── Brand ── */}
      <div style={{
        padding: '13.6px 8px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 64,
        overflow: 'hidden',
      }}>
        <AnimatePresence mode="wait">
          {collapsed ? (
            <motion.img
              key="logo-sm"
              src="/tinno.png"
              // src="/midco.png"
              alt="Logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ width: 50, height: 50, objectFit: 'contain' }}
            />
          ) : (
            <motion.img
              key="logo-full"
              src="/tinno.png"
              // src="/midco.png"
              alt="Logo"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              style={{ width: '100%', height: 44, objectFit: 'contain' }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* Label */}
        {!collapsed && (
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.textMuted,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '6px 20px 4px',
          }}>
            Main
          </div>
        )}

        <NavItem to="/"    label="Summary"  Icon={({ c }) => <BarChart2 size={22} color={c} />}
          collapsed={collapsed} T={T} active={isActive('/')} />
        <NavItem to="/lcm" label="Services" Icon={({ c }) => <Server size={22} color={c} />}
          collapsed={collapsed} T={T} active={isActive('/lcm')} />

        {/* AI Services Group */}
        {!collapsed && (
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.textMuted,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '10px 20px 4px',
          }}>
            AI Services
          </div>
        )}
        {collapsed && <div style={{ height: 6 }} />}

        {/* AI submenu trigger */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            margin: '2px 8px',
            borderRadius: 7,
            cursor: collapsed ? 'default' : 'pointer',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: isAIOpen ? T.accentMuted : 'transparent',
            borderLeft: isAIOpen ? `2px solid ${T.accentSub}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}
          onClick={() => !collapsed && setAiOpen(o => !o)}
          onMouseEnter={e => { if (!isAIOpen) e.currentTarget.style.background = T.accentMuted; }}
          onMouseLeave={e => { if (!isAIOpen) e.currentTarget.style.background = 'transparent'; }}
        >
          <Activity size={22} color={isAIOpen ? T.accentSub : T.textMuted} />
          {!collapsed && (
            <>
              <span style={{
                flex: 1, fontSize: 16, fontWeight: isAIOpen ? 600 : 500,
                color: isAIOpen ? T.accentSub : T.textSec,
              }}>
                AI Services
              </span>
              <motion.div animate={{ rotate: aiOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={14} color={T.textMuted} />
              </motion.div>
            </>
          )}
        </div>

        {/* AI sub-items */}
        <AnimatePresence initial={false}>
          {(aiOpen || collapsed) && (
            <motion.div
              key="ai-children"
              initial={collapsed ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              {AI_CHILDREN.map(item => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  Icon={item.Icon}
                  collapsed={collapsed}
                  T={T}
                  active={isActive(item.to)}
                  small={!collapsed}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!collapsed && (
          <div style={{
            fontSize: 9, fontWeight: 700, color: T.textMuted,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '10px 20px 4px',
          }}>
            System
          </div>
        )}
        {collapsed && <div style={{ height: 6 }} />}

        <NavItem to="/display-configure" label="Display & Config"
          Icon={({ c }) => <Home size={22} color={c} />}
          collapsed={collapsed} T={T} active={isActive('/display-configure')} />
        <NavItem to="/about" label="About"
          Icon={({ c }) => <Info size={22} color={c} />}
          collapsed={collapsed} T={T} active={isActive('/about')} />
      </nav>

      {/* ── Collapse Toggle ── */}
      <div style={{
        padding: '12px 0',
        borderTop: `1px solid ${T.border}`,
        display: 'flex',
        justifyContent: 'center',
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'transparent',
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: '7px 9px',
            cursor: 'pointer',
            color: T.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = T.accent;
            e.currentTarget.style.color = T.accent;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = T.border;
            e.currentTarget.style.color = T.textMuted;
          }}
        >
          {collapsed ? <Menu size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </motion.aside>
  );
}

/* ─── App ───────────────────────────────────────────────── */
function App() {
  const { theme, T, toggle } = useContext(ThemeContext);
  const [collapsed, setCollapsed]  = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => {
    if (localStorage.getItem('sshHost')) setIsLoggedIn(true);
  }, []);

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('sshHost');
    localStorage.removeItem('urlIotFingerprinting.flowsAnalysed');
    navigate('/login');
  };

  if (!isLoggedIn) {
    return <LoginPage setIsLoggedIn={setIsLoggedIn} />;
  }


  const headerBg = theme === 'dark'
    ? 'rgba(9,9,11,0.85)'
    : 'rgba(255,255,255,0.85)';

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: T.bg,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* ── Sidebar ── */}
      <AppSidebar collapsed={collapsed} setCollapsed={setCollapsed} T={T} theme={theme} />

      {/* ── Main Column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* ── Header ── */}
        <header style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${T.border}`,
          padding: '0 24px',
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          {/* Left: Header Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 6, height: 32, borderRadius: 3,
              background: `linear-gradient(180deg, ${T.accent}, ${T.accentSub})`,
              flexShrink: 0,
            }} />
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 700,
              color: T.textPrimary, lineHeight: 1.2,
            }}>
              AI-Driven Edge Intelligence
            </h1>
          </div>

          {/* Right: Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

            {/* AI Badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px',
              background: T.accentMuted,
              border: `1px solid ${T.accent}30`,
              borderRadius: 20,
              fontSize: 11, fontWeight: 600,
              color: T.accent,
            }}>
              <Zap size={11} />
              AI-Driven Edge Intelligence
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggle}
              data-tooltip-id="tip-theme"
              data-tooltip-content={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36,
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                cursor: 'pointer',
                color: T.textMuted,
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = T.accent;
                e.currentTarget.style.color = T.accent;
                e.currentTarget.style.background = T.accentMuted;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = T.border;
                e.currentTarget.style.color = T.textMuted;
                e.currentTarget.style.background = T.elevated;
              }}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Logout */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                background: 'transparent',
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                cursor: 'pointer',
                color: T.textMuted,
                fontSize: 12, fontWeight: 500,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(248,113,113,0.1)';
                e.currentTarget.style.borderColor = '#f8717130';
                e.currentTarget.style.color = '#f87171';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = T.border;
                e.currentTarget.style.color = T.textMuted;
              }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </motion.button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              <Routes location={location} key={location.pathname}>
                <Route path="/"                       element={<SummaryPage />} />
                <Route path="/display-configure"      element={<DisplayConfigurePage />} />
                <Route path="/about"                  element={<AboutPage />} />
                <Route path="/lcm"                    element={<LCMPage />} />
                <Route path="/wifi-channel-analyzer"  element={<WifiChannelAnalyzerPage />} />
                <Route path="/anomaly-detection"      element={<AnomalyDetectionDashboard />} />
                <Route path="/smart-bandwidth"        element={<SmartBandwidthAllocator />} />
                <Route path="/url-iot-fingerprinting" element={<UrlIotFingerprintingPage />} />
                <Route path="/login"                  element={<LoginPage setIsLoggedIn={setIsLoggedIn} />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Footer ── */}
        <footer style={{
          padding: '10px 24px',
          borderTop: `1px solid ${T.border}`,
          background: T.cardBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: T.textMuted,
        }}>
          <span>© {new Date().getFullYear()} TINNO GPON Gateway — AI-Driven Edge Intelligence</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.success,
              animation: 'glowPulse 2s infinite' }} />
            <span style={{ color: T.success, fontWeight: 500 }}>System Operational</span>
          </div>
        </footer>
      </div>

      {/* ── Tooltips ── */}
      <Tooltip id="tip-theme" place="bottom" />
    </div>
  );
}

export default App;
