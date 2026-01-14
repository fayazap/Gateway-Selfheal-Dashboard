import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-tooltip/dist/react-tooltip.css';
import { Sidebar, Menu, MenuItem } from 'react-pro-sidebar';
import { Home, Settings, Clock, Info, BarChart, Server, LogOut } from 'lucide-react';
import SummaryPage from './pages/SummaryPage.jsx';
import DisplayConfigurePage from './pages/DisplayConfigurePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import LCMPage from './pages/LCMPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Traffic24hPage from './pages/Traffic24hPage.jsx';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const storedHost = localStorage.getItem('sshHost');
    if (storedHost) {
      setIsLoggedIn(true);
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('sshHost');
    navigate('/login');
  };

  if (!isLoggedIn) {
    return <LoginPage setIsLoggedIn={setIsLoggedIn} />;
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] text-gray-800">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        backgroundColor="#e0efff"
        className="shadow-xl border-r border-blue-200/40"
        width="250px"
        collapsedWidth="80px"
      >
        <div
          className={`flex items-center justify-center border-b border-blue-200/50 bg-gradient-to-r from-[#78a2de] to-[#9eb0e5]
          ${sidebarCollapsed ? 'p-2 h-[111px]' : 'p-4 h-[111px]'}`}
        >
          <img
            src={sidebarCollapsed ? "/omz_O.png" : "/omz.png"}
            alt="TINNO Logo"
            className={`transition-all duration-300
              ${sidebarCollapsed ? 'h-10 w-10' : 'h-12 w-auto'}`}
          />
        </div>

        <Menu
          menuItemStyles={{
            button: ({ active }) => ({
              backgroundColor: active ? '#60a5fa' : 'transparent',
              color: active ? 'white' : '#1e40af',
              fontWeight: active ? '600' : '500',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              transition: 'all 0.25s ease',
              '&:hover': {
                backgroundColor: '#93c5fd',
                color: 'white',
              },
            }),
          }}
        >
          <MenuItem
            component={<NavLink to="/" />}
            icon={<BarChart size={20} />}
            data-tooltip-id="tooltip-summary"
            data-tooltip-content="View device summary"
          >
            Summary
          </MenuItem>
          <MenuItem
            component={<NavLink to="/lcm" />}
            icon={<Server size={20} />}
            data-tooltip-id="tooltip-lcm"
            data-tooltip-content="Manage lifecycle of containers"
          >
            Services
          </MenuItem>
          <MenuItem
            component={<NavLink to="/display-configure" />}
            icon={<Home size={20} />}
            data-tooltip-id="tooltip-display"
            data-tooltip-content="View and configure device status"
          >
            Display & Configure
          </MenuItem>
          <MenuItem
            component={<NavLink to="/traffic-24h" />}
            icon={<Clock size={20} />}
            data-tooltip-id="tooltip-status"
            data-tooltip-content="View 24-hour traffic analysis"
          >
            Traffic 24h
          </MenuItem>
          <MenuItem
            component={<NavLink to="/about" />}
            icon={<Info size={20} />}
            data-tooltip-id="tooltip-about"
            data-tooltip-content="Learn about selfheal"
          >
            About
          </MenuItem>
        </Menu>
      </Sidebar>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="p-4 bg-gradient-to-r from-[#83adec] via-[#9bc4ff] to-[#bcd7ff] shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleSidebar}
                className="p-2.5 text-white hover:bg-white/20 rounded-lg transition-colors duration-200"
                aria-label="Toggle sidebar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[#1e40af]">
                  Self-Healing Dashboard
                </h1>
                <p className="text-lg font-medium text-[#1e3a8a]/90">
                  Experience uninterrupted connectivity with intelligent self-healing
                </p>
              </div>
            </div>
            <div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleLogout}
                className="px-5 py-2.5 bg-[#60a5fa] hover:bg-[#3b82f6] text-white rounded-lg transition-colors shadow-md text-sm font-semibold flex items-center gap-2"
              >
                <LogOut size={16} />
                Logout
              </motion.button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">
          <AnimatePresence>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <Routes>
                <Route path="/" element={<SummaryPage />} />
                <Route path="/display-configure" element={<DisplayConfigurePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/traffic-24h" element={<Traffic24hPage />} />
                <Route path="/lcm" element={<LCMPage />} />
                <Route path="/login" element={<LoginPage setIsLoggedIn={setIsLoggedIn} />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="p-4 text-center text-sm text-blue-800/70 bg-white/60 backdrop-blur-sm border-t border-blue-200/40">
          © {new Date().getFullYear()} OMZ GPON Gateway. All rights reserved.
        </footer>
      </div>

      {/* Tooltips */}
      <Tooltip id="tooltip-summary" place="right" />
      <Tooltip id="tooltip-display" place="right" />
      <Tooltip id="tooltip-about" place="right" />
      <Tooltip id="tooltip-status" place="left" />
      <Tooltip id="tooltip-lcm" place="right" />
    </div>
  );
}

export default App;