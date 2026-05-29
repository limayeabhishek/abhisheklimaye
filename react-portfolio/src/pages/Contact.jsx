import React, { useState } from 'react';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    message: '',
  });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validateForm = () => {
    const { name, email, message } = formData;
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus({ type: 'error', message: 'Name, Email, and Message fields are required.' });
      return false;
    }
    // Basic email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setStatus({ type: 'error', message: 'Please enter a valid email address.' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(''); // Clear previous status
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 seconds timeout

    try {
      const response = await fetch('http://localhost:3001/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
        signal: abortController.signal, // Attach the abort signal
      });

      clearTimeout(timeoutId); // Clear the timeout if the request completes in time

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: data.msg });
        setFormData({ name: '', email: '', phoneNumber: '', message: '' }); // Clear form
      } else {
        setStatus({ type: 'error', message: data.msg || 'Failed to send message.' });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Contact form submission timed out:', error);
        setStatus({ type: 'error', message: 'Request timed out. Please try again or check backend server.' });
      } else {
        console.error('Contact form submission error:', error);
        setStatus({ type: 'error', message: 'Failed to connect to the server. Ensure backend is running.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <h2 className="page-title">Contact Me</h2>

      {/* Static Contact Info */}
      <div className="contact-container" style={{ marginBottom: '30px' }}>
        <div className="contact-item">
          <strong>Email:</strong> <a href="mailto:abhishek.d.limaye@gmail.com">abhishek.d.limaye@gmail.com</a>
        </div>
        <div className="contact-item">
          <strong>GitHub:</strong> <a href="https://github.com/limayeabhishek" target="_blank" rel="noopener noreferrer">https://github.com/limayeabhishek</a>
        </div>
        <div className="contact-item">
          <strong>LinkedIn:</strong> <a href="https://linkedin.com/in/abhishekdlimaye" target="_blank" rel="noopener noreferrer">https://linkedin.com/in/abhishekdlimaye</a>
        </div>
      </div>

      {/* Contact Form */}
      <h2 className="page-title">Send a Message</h2>
      <form onSubmit={handleSubmit} className="contact-form">
        <div className="form-group">
          <label htmlFor="name">Name:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="tool-input"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="tool-input"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="phoneNumber">Phone Number (Optional):</label>
          <input
            type="tel"
            id="phoneNumber"
            name="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleChange}
            className="tool-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="message">Message:</label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            className="tool-textarea"
            rows="5"
            required
          />
        </div>
        <button type="submit" className="btn tool-btn" disabled={loading}>
          {loading ? 'Sending...' : 'Send Message'}
        </button>

        {status && (
          <div className={`form-status ${status.type === 'success' ? 'success' : 'error'}`} style={{ marginTop: '15px' }}>
            {status.message}
          </div>
        )}
      </form>
    </div>
  );
};

export default Contact;
