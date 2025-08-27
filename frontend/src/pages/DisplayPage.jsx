import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Table, Alert, Card } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { Server, Clock } from 'lucide-react';

function DisplayPage() {
  const [selfheal, setSelfheal] = useState({ params: {}, reboots: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/selfheal')
      .then(res => setSelfheal(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-600">Loading...</div>;
  if (error) return <Alert variant="danger" className="m-4">Error: {error}</Alert>;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 p-4 bg-gray-50 min-h-screen"
    >
      {/* Selfheal Parameters Card */}
      <Card className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-200">
        <Card.Header className="bg-gradient-to-r from-tinno-green-700 to-tinno-green-600 text-white p-4 text-lg font-bold flex items-center">
          <Server className="mr-2" size={20} />
          Selfheal Parameters
        </Card.Header>
        <Card.Body className="p-6">
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
                    <td className="p-2">{key}</td>
                    <td className="p-2">{value}</td>
                  </tr>
                )
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Reboot Logs Card */}
      <Card className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-200">
        <Card.Header className="bg-gradient-to-r from-tinno-green-700 to-tinno-green-600 text-white p-4 text-lg font-bold flex items-center">
          <Clock className="mr-2" size={20} />
          Reboot Logs
        </Card.Header>
        <Card.Body className="p-6">
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
        </Card.Body>
      </Card>
    </motion.div>
  );
}

export default DisplayPage;