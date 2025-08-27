import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Form, Button, Alert, Row, Col, Card } from 'react-bootstrap';

function ConfigurePage() {
  const [params, setParams] = useState({});
  const [formData, setFormData] = useState({});
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/selfheal')
      .then(res => {
        setParams(res.data.params);
        setFormData(Object.fromEntries(
          Object.entries(res.data.params).filter(([key]) =>
            key.includes('Threshold') || key.includes('Enable') || key.includes('Server') || key.includes('Interval') || key.includes('Needed')
          ).map(([key, value]) => [key, value])
        ));
      })
      .catch(err => setError(err.message));
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (key) => {
    setSuccess(''); setError('');
    axios.post('/api/configure', { param: key, value: formData[key] })
      .then(res => setSuccess(`Updated ${key} to ${res.data.updatedValue}`))
      .catch(err => setError(err.message));
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white shadow-md p-4">
        <Card.Header className="bg-tinno-green-700 text-white p-2">Configure Self-Healing Parameters</Card.Header>
        <Card.Body>
          {success && <Alert variant="success" className="m-2">{success}</Alert>}
          {error && <Alert variant="danger" className="m-2">Error: {error}</Alert>}
          <Form>
            {Object.keys(formData).map(key => (
              <Row key={key} className="mb-4">
                <Col md={4}><Form.Label className="text-gray-700">{key}</Form.Label></Col>
                <Col md={6}><Form.Control name={key} value={formData[key] || ''} onChange={handleChange} className="border-tinno-gray-500" /></Col>
                <Col md={2}><Button variant="success" onClick={() => handleSubmit(key)}>Update</Button></Col>
              </Row>
            ))}
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}

export default ConfigurePage;