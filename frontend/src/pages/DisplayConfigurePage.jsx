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
        console.log('API Response:', res.data);
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
        console.error('API Error:', err);
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
        axios.get('/api/selfheal').then(res => {
          console.log('Updated API Response:', res.data);
          setSelfheal(res.data);
        });
      })
      .catch(err => {
        console.error('Update Error:', err);
        setError(err.message || 'Failed to update parameter');
      });
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] flex items-center justify-center">
      <div className="text-center text-blue-800 text-lg font-medium">Loading configuration...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] p-6">
      <Alert variant="danger" className="max-w-4xl mx-auto shadow-lg border-red-300">
        {error}
      </Alert>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-br from-[#c3d7f7] to-[#cae7ff] p-6 space-y-8"
    >
      <Card className="bg-white/85 backdrop-blur-sm shadow-xl rounded-2xl border border-blue-200/40 overflow-hidden">
        <Card.Header className="bg-gradient-to-r from-[#83adec] via-[#9bc4ff] to-[#bcd7ff] p-3 border-b border-blue-300/30">
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="mb-0 border-0"
            variant="pills"
          >
            <Tab 
              eventKey="display" 
              title={
                <span className="flex items-center font-bold gap-2 px-4 py-2">
                  <Server size={18} />
                  Display
                </span>
              } 
            />
            <Tab 
              eventKey="configure" 
              title={
                <span className="flex items-center font-bold gap-2 px-4 py-2">
                  <Settings size={18} />
                  Configure
                </span>
              } 
            />
          </Tabs>
        </Card.Header>

        <Card.Body className="p-6">
          {success && (
            <Alert variant="success" className="mb-6 bg-green-50/80 border-green-200/60 text-green-800 shadow-sm">
              {success}
            </Alert>
          )}
          {error && (
            <Alert variant="danger" className="mb-6 bg-red-50/80 border-red-200/60 text-red-800 shadow-sm">
              {error}
            </Alert>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className="space-y-8">
              {/* Selfheal Parameters */}
              <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
                <Card.Header className="bg-blue-200 text-[#1e40af] font-semibold p-3 border-b border-blue-200">
                  Self-Healing Parameters
                </Card.Header>
                <Card.Body className="p-0">
                  {Object.keys(selfheal.params).length === 0 ? (
                    <Alert variant="info" className="m-4 bg-blue-50/70 border-blue-200/50 text-blue-800">
                      No parameters available to display.
                    </Alert>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table striped bordered hover className="mb-0 text-blue-900">
                        <thead>
                          <tr className="bg-blue-100/60">
                            <th className="p-3 font-medium text-left">Parameter</th>
                            <th className="p-3 font-medium text-left">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(selfheal.params).map(([key, value]) => (
                            !key.includes('Reboot.') && (
                              <tr key={key} className="hover:bg-blue-50/50 transition-colors">
                                <td className="p-3">{key.replace('X_TINNO-COM_SelfHeal.', '')}</td>
                                <td className="p-3 font-medium">{value}</td>
                              </tr>
                            )
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Reboot Logs */}
              <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
                <Card.Header className="bg-blue-200 text-[#1e40af] font-semibold p-4 border-b border-blue-200/40">
                  Self-Healing Event Logs
                </Card.Header>
                <Card.Body className="p-0">
                  {selfheal.reboots.length === 0 ? (
                    <Alert variant="info" className="m-4 bg-blue-100 border-blue-200/50 text-blue-800">
                      No reboot events recorded yet.
                    </Alert>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table striped bordered hover className="mb-0 text-blue-900">
                        <thead>
                          <tr className="bg-blue-100/60">
                            <th className="p-3 font-medium text-left">Reason</th>
                            <th className="p-3 font-medium text-left">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selfheal.reboots.map((log, index) => (
                            <tr key={index} className="hover:bg-blue-50/50 transition-colors">
                              <td className="p-3">{log.reason}</td>
                              <td className="p-3">{log.time}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </div>
          )}

          {/* Configure Tab */}
          {activeTab === 'configure' && (
            <Card className="border-0 shadow-md bg-white/80 backdrop-blur-sm rounded-xl">
              <Card.Header className="bg-blue-200 text-[#1e40af] font-semibold p-3 border-b border-blue-200/40">
                Configure Self-Healing Parameters
              </Card.Header>
              <Card.Body className="p-6">
                {Object.keys(formData).length === 0 ? (
                  <Alert variant="info" className="bg-blue-50/70 border-blue-200/50 text-blue-800">
                    No configurable parameters available.
                  </Alert>
                ) : (
                  <Form>
                    {Object.keys(formData).map(key => (
                      <Row key={key} className="mb-5 align-items-center g-4">
                        <Col md={4}>
                          <Form.Label className="text-blue-800 font-medium mb-0">
                            {key.replace('X_TINNO-COM_SelfHeal.', '')}
                          </Form.Label>
                        </Col>
                        <Col md={5}>
                          <Form.Control
                            name={key}
                            value={formData[key] || ''}
                            onChange={handleChange}
                            className="border-blue-300 focus:border-blue-500 focus:ring-blue-400 bg-white/70 shadow-sm"
                          />
                        </Col>
                        <Col md={3}>
                          <Button
                            onClick={() => handleSubmit(key)}
                            className="w-100 bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 shadow-md"
                          >
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