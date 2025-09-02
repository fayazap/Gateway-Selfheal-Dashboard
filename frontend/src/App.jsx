import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-tooltip/dist/react-tooltip.css';
import { Sidebar, Menu, MenuItem } from 'react-pro-sidebar';
import { Home, Settings, Info, BarChart } from 'lucide-react';
import SummaryPage from './pages/SummaryPage.jsx';
import DisplayConfigurePage from './pages/DisplayConfigurePage.jsx';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <Router>
      <div className="min-h-screen flex bg-gray-50 text-gray-800">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          backgroundColor="#FFFFFF"
          className="shadow-lg"
          width="250px"
          collapsedWidth="80px"
        >
          <div className="flex items-center justify-center p-2 border-b border-gray-200">
            <img
              src="/logo.jpg"
              alt="TINNO Logo"
              className={`h-${sidebarCollapsed ? '6' : '8'} w-${sidebarCollapsed ? '8' : '8'} transition-all duration-300`}
            />
          </div>
          <Menu
            menuItemStyles={{
              button: ({ active }) => ({
                backgroundColor: active ? '#E8F5E9' : 'transparent',
                color: '#424242',
                '&:hover': {
                  backgroundColor: '#E0E0E0',
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
              component={<NavLink to="/display-configure" />}
              icon={<Home size={20} />}
              data-tooltip-id="tooltip-display"
              data-tooltip-content="View and configure device status"
            >
              Display & Configure
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
        <div className="flex-1">
          {/* Header */}
          <header className="p-4 bg-white shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <button
                  onClick={toggleSidebar}
                  className="p-2 mr-2 text-gray-600 hover:bg-gray-200 rounded"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <h1 className="text-2xl font-semibold text-gray-800">
                  Self-Healing Dashboard
                </h1>
                <span className="ml-2 text-sm text-gray-500">
                  Experience uninterrupted connectivity with intelligent self-healing
                </span>
              </div>
              <div className="flex items-center">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-green-800"
                  data-tooltip-id="tooltip-status"
                  data-tooltip-content="Gateway is online"
                >
                  Online
                </span>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="p-6">
            <AnimatePresence>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Routes>
                  <Route path="/" element={<SummaryPage />} />
                  <Route path="/display-configure" element={<DisplayConfigurePage />} />
                  <Route path="/about" element={<div className="p-4 text-gray-700">About Self-Healing...</div>} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Footer */}
          <footer className="p-4 text-center text-sm text-gray-600 bg-white border-t border-gray-200">
            &copy; 2025 TINNO GPON Gateway. All rights reserved.
          </footer>
        </div>

        {/* Tooltips */}
        <Tooltip id="tooltip-summary" place="right" />
        <Tooltip id="tooltip-display" place="right" />
        <Tooltip id="tooltip-about" place="right" />
        <Tooltip id="tooltip-status" place="left" />
      </div>
    </Router>
  );
}

export default App;