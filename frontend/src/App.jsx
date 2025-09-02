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
import AboutPage from './pages/AboutPage.jsx'

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
                  backgroundColor: active ? '#9253c5ff' : 'transparent', // tinno-green-700
                  color: active ? 'white' : '#424242',
                  fontWeight: active ? '600' : '500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  transition: 'background-color 0.3s, color 0.3s',
                  '&:hover': {
                    backgroundColor: '#624494ff', // tinno-green-600
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
          <header className="p-4 bg-gradient-to-r from-tinno-green-700 to-tinno-green-600 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={toggleSidebar}
                  className="p-2 text-white hover:bg-tinno-green-100/20 rounded transition-colors duration-300"
                  aria-label="Toggle sidebar"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-3xl font-bold tracking-wide text-white">
                    Self-Healing Dashboard
                  </h1>
                  <p className="text-l font-bold text-white-300">
                    Experience uninterrupted connectivity with intelligent self-healing
                  </p>
                </div>
              </div>
              <div>
                <span
                  className="inline-flex items-center px-4 py-1 font-semibold rounded-full text-sm bg-white text-tinno-green-700 shadow-md"
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
                  <Route path="/about" element={<AboutPage />} />
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