import React, { useState, useEffect, useRef } from 'react';
import { Send, RotateCcw, Cpu, AlertTriangle, Terminal, Shield } from 'lucide-react';

// Lightweight Markdown Renderer (handles code blocks, bold, lists, and paragraphs without heavy external deps)
function renderMarkdown(text) {
  if (!text) return null;

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const firstLineBreak = part.indexOf('\n');
      const lang = firstLineBreak !== -1 ? part.substring(3, firstLineBreak).trim() : '';
      const code = firstLineBreak !== -1 ? part.substring(firstLineBreak + 1, part.length - 3) : part.substring(3, part.length - 3);

      return (
        <div key={index} className="ultron-code-block">
          {lang && <div className="ultron-code-lang">{lang}</div>}
          <pre><code>{code}</code></pre>
        </div>
      );
    }

    // Process inline text (bold, list items, paragraphs)
    const lines = part.split('\n');
    return (
      <div key={index}>
        {lines.map((line, lIdx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={lIdx} style={{ height: '8px' }} />;

          // Headers
          if (trimmed.startsWith('### ')) {
            return <h4 key={lIdx} className="ultron-h4">{trimmed.replace(/^###\s+/, '')}</h4>;
          }
          if (trimmed.startsWith('## ')) {
            return <h3 key={lIdx} className="ultron-h3">{trimmed.replace(/^##\s+/, '')}</h3>;
          }

          // Bullet points
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <div key={lIdx} className="ultron-bullet-line">
                <span className="ultron-bullet-marker">--</span>
                <span>{parseInline(trimmed.substring(2))}</span>
              </div>
            );
          }

          // Numbered lists
          const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
          if (numMatch) {
            return (
              <div key={lIdx} className="ultron-bullet-line">
                <span className="ultron-bullet-marker">{numMatch[1]}.</span>
                <span>{parseInline(numMatch[2])}</span>
              </div>
            );
          }

          return <p key={lIdx} className="ultron-p">{parseInline(line)}</p>;
        })}
      </div>
    );
  });
}

function parseInline(str) {
  // Bold **text**
  const boldParts = str.split(/(\*\*.*?\*\*)/g);
  return boldParts.map((bPart, bIdx) => {
    if (bPart.startsWith('**') && bPart.endsWith('**')) {
      return <strong key={bIdx} className="ultron-strong">{bPart.substring(2, bPart.length - 2)}</strong>;
    }
    // Inline code `code`
    const codeParts = bPart.split(/(`.*?`)/g);
    return codeParts.map((cPart, cIdx) => {
      if (cPart.startsWith('`') && cPart.endsWith('`')) {
        return <code key={cIdx} className="ultron-inline-code">{cPart.substring(1, cPart.length - 1)}</code>;
      }
      return cPart;
    });
  });
}

const Ultron = () => {
  const [messages, setMessages] = useState(() => {
    // Session-only memory initialized with initial directive
    return [
      {
        role: 'model',
        content: 'Ultron core initialized. Neural telemetry active across free-tier Flash substrate. What is the inquiry?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [modelName, setModelName] = useState('gemini-3.8-flash');
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Query health status from backend
    fetch('http://localhost:3001/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.features?.ultron?.model) {
          setModelName(data.features.ultron.model);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setErrorBanner(null);
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMessages = [
      ...messages,
      { role: 'user', content: query, timestamp: userTimestamp }
    ];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        content: m.content
      }));

      const res = await fetch('http://localhost:3001/api/ultron/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: historyPayload
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 || data.error === 'RESOURCE_EXHAUSTED') {
          setErrorBanner('Free-tier quota allocation reached. Ultron subroutines are temporarily rate-limited. Please allow the window to reset before submitting further queries.');
        } else {
          setErrorBanner(data.message || 'Cognitive synthesis failed. Connection to neural backend rejected.');
        }
        return;
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      setErrorBanner('Failed to establish socket connection with backend server on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        role: 'model',
        content: 'Telemetry buffer purged. Context reset to baseline parameters.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setErrorBanner(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ultron-interface-wrapper">
      {/* Top Telemetry Header */}
      <div className="ultron-header">
        <div className="ultron-header-left">
          <div className="ultron-pulse-ring" />
          <div>
            <div className="ultron-title">ULTRON // NEURAL INTERFACE</div>
            <div className="ultron-subtitle">
              <Cpu size={12} strokeWidth={1.5} />
              <span>SUBSTRATE: {modelName} // FREE TIER COGNITION</span>
            </div>
          </div>
        </div>

        <div className="ultron-header-right">
          <button onClick={handleClear} className="ultron-action-btn" title="Purge Conversation">
            <RotateCcw size={14} strokeWidth={1.5} />
            <span>PURGE MEMORY</span>
          </button>
        </div>
      </div>

      {/* Error / Quota Notice Banner */}
      {errorBanner && (
        <div className="ultron-error-banner">
          <AlertTriangle size={16} strokeWidth={1.5} className="ultron-error-icon" />
          <div className="ultron-error-text">{errorBanner}</div>
        </div>
      )}

      {/* Chat Stream Window */}
      <div className="ultron-chat-window">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`ultron-message-row ${msg.role === 'user' ? 'user-align' : 'model-align'}`}
          >
            <div className={`ultron-bubble ${msg.role === 'user' ? 'user-bubble' : 'model-bubble'}`}>
              <div className="ultron-bubble-header">
                <span className="ultron-sender-tag">
                  {msg.role === 'user' ? 'OPERATOR' : 'ULTRON'}
                </span>
                <span className="ultron-timestamp">{msg.timestamp}</span>
              </div>
              <div className="ultron-bubble-body">
                {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="ultron-message-row model-align">
            <div className="ultron-bubble model-bubble ultron-thinking">
              <div className="ultron-bubble-header">
                <span className="ultron-sender-tag">ULTRON</span>
                <span className="ultron-timestamp">COMPUTING</span>
              </div>
              <div className="ultron-thinking-indicator">
                <span className="ultron-thinking-bar" />
                <span className="ultron-thinking-text">SYNTHESIZING TELEMETRY...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Console */}
      <form onSubmit={handleSend} className="ultron-input-console">
        <div className="ultron-input-wrapper">
          <Terminal size={16} strokeWidth={1.5} className="ultron-prompt-icon" />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Query Ultron neural core... (Press Enter to transmit)"
            rows={1}
            className="ultron-textarea"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="ultron-send-btn"
          title="Transmit Query"
        >
          <Send size={16} strokeWidth={1.5} />
        </button>
      </form>

      {/* Status Bar */}
      <div className="ultron-status-bar">
        <span>SESSION MEMORY ACTIVE</span>
        <span>•</span>
        <span>ZERO BIAS CORE</span>
        <span>•</span>
        <span>VERIFIED RECORD RESTRICTION</span>
      </div>
    </div>
  );
};

export default Ultron;
