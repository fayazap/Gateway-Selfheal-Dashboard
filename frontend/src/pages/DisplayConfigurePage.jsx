import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Tabs, Tab, Table, Alert, Card, Form, Button, Row, Col } from 'react-bootstrap';
import { motion } from 'framer-motion';
import { Server, Clock, Settings } from 'lucide-react';

function DisplayConfigurePage() {
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
        console.log('API Response:', res.data); // Debug: Log the API response
        if (!res.data || !res.data.params) {
          throw new Error('Invalid API response: params not found');
        }
        setSelfheal(res.data);
        setFormData(Object.fromEntries(
          Object.entries(res.data.params).filter(([key]) =>
            key.includes('Threshold') || key.includes('Enable') || key.includes('Server') || key.includes('Interval') || key.includes('Needed')
          ).map(([key, value]) => [key, value])
        ));
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
    setSuccess(''); setError('');
    axios.post('/api/configure', { param: key, value: formData[key] })
      .then(res => {
        setSuccess(`Updated ${key} to ${res.data.updatedValue}`);
        // Refresh selfheal data after successful update
        axios.get('/api/selfheal').then(res => {
          console.log('Updated API Response:', res.data); // Debug: Log the updated response
          setSelfheal(res.data);
        });
      })
      .catch(err => {
        console.error('Update Error:', err); // Debug: Log the update error
        setError(err.message || 'Failed to update parameter');
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
          {success && <Alert variant="success" className="m-2 mb-4">{success}</Alert>}
          {error && <Alert variant="danger" className="m-2 mb-4">Error: {error}</Alert>}

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
                {Object.keys(formData).length === 0 ? (
                  <Alert variant="warning" className="m-2">
                    No configurable parameters available.
                  </Alert>
                ) : (
                  <Form>
                    {Object.keys(formData).map(key => (
                      <Row key={key} className="mb-4 align-items-center">
                        <Col md={4}><Form.Label className="text-gray-700">{key.replace('X_TINNO-COM_SelfHeal.', '')}</Form.Label></Col>
                        <Col md={6}>
                          <Form.Control
                            name={key}
                            value={formData[key] || ''}
                            onChange={handleChange}
                            className="border-tinno-gray-500"
                          />
                        </Col>
                        <Col md={2}>
                          <Button variant="success" onClick={() => handleSubmit(key)} className="w-100">
                            Update
                          </Button>
                        </Col>
                      </Row>
                    ))}
                  </Form>
                )}
              </Card.Body>
            </Card>
          )}
        </Card.Body>
      </Card>
    </motion.div>
  );
}

export default DisplayConfigurePage;