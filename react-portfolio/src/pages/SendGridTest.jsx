import React, { useState } from 'react';

const SendGridTest = () => {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTestSend = async () => {
    setLoading(true);
    setStatus('');

    try {
      const response = await fetch('http://localhost:3001/api/test-sendgrid', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: data.msg });
      } else {
        setStatus({ type: 'error', message: data.msg || 'Failed to send test email.' });
      }
    } catch (error) {
      console.error('SendGrid test error:', error);
      setStatus({ type: 'error', message: 'Failed to connect to the server.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <h2 className="page-title">SendGrid Test Page</h2>
      <p>Click the button below to send a test email using the SendGrid API.</p>
      <button onClick={handleTestSend} className="btn tool-btn" disabled={loading}>
        {loading ? 'Sending...' : 'Send Test Email'}
      </button>

      {status && (
        <div className={`form-status ${status.type === 'success' ? 'success' : 'error'}`} style={{ marginTop: '15px' }}>
          {status.message}
        </div>
      )}
    </div>
  );
};

export default SendGridTest;
