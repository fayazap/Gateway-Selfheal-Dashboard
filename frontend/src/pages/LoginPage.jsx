import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function LoginPage({ setIsLoggedIn }) {
  const [ipAddress, setIpAddress] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Test SSH connection
      const response = await axios.post('/api/test-connection', { host: ipAddress });
      if (response.data.success) {
        // Update SSH host if connection is successful
        await axios.post('/api/update-ssh-host', { host: ipAddress });
        localStorage.setItem('sshHost', ipAddress); // Store host in localStorage
        setIsLoggedIn(true); // Update login state
        navigate('/'); // Redirect to home page
      } else {
        setError('Connection successful but unexpected response.');
      }
    } catch (err) {
      setError('Failed to connect to the device. Please check the IP address and ensure the device is reachable.');
      console.error('Login error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-full max-w-md"
      >
        <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">Login</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="ipAddress" className="block text-sm font-medium text-gray-700">Device IP Address</label>
            <input
              type="text"
              id="ipAddress"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g., 192.168.246.157"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-tinno-green-600 focus:border-transparent transition text-sm"
              required
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            className="w-full px-4 py-2 bg-tinno-green-700 text-white rounded-full hover:bg-tinno-green-600 transition-colors shadow-md text-sm"
          >
            Connect
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

export default LoginPage;