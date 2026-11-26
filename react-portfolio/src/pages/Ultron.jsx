import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, RotateCcw, Cpu, AlertTriangle, Terminal, Shield } from 'lucide-react';

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

const NERDY_PLACEHOLDERS = [
  "Can you convince A-Ultron to not take over the world?",
  "Ask A-Ultron about Abhishek's UAV security research...",
  "Query A-Ultron on ARM firmware reverse engineering...",
  "Ask A-Ultron to audit your threat model assumptions...",
  "Ask A-Ultron about digital forensics on macOS unified logs...",
  "Challenge A-Ultron to find a flaw in your cryptography...",
  "Ask A-Ultron why entropy always increases...",
  "Ask A-Ultron: 'How do you analyze a compromised flight controller?'"
];

const THINKING_STATES = [
  "Thinking...",
  "Analyzing telemetry...",
  "Parsing firmware memory maps...",
  "Consulting creator dossier...",
  "Evaluating threat models...",
  "Calculating probability matrices...",
  "Synthesizing response..."
];

const Ultron = () => {
  const [messages, setMessages] = useState(() => {
    return [
      {
        role: 'model',
        content: 'A-Ultron core initialized. Telemetry active across free-tier substrate. What is your inquiry?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [modelName, setModelName] = useState('gemini-3.5-flash-lite');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Cycling nerdy placeholders
  useEffect(() => {
    const interval = setInterval(() => {
      if (!input && document.activeElement !== textareaRef.current) {
        setPlaceholderIndex(prev => (prev + 1) % NERDY_PLACEHOLDERS.length);
      }
    }, 3600);
    return () => clearInterval(interval);
  }, [input]);

  // Cycling thinking indicator
  useEffect(() => {
    let interval = null;
    if (loading) {
      setThinkingIndex(0);
      interval = setInterval(() => {
        setThinkingIndex(prev => (prev + 1) % THINKING_STATES.length);
      }, 1300);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    // Query health status from backend if available
    const checkHealth = async () => {
      try {
        let res = await fetch('/api/health');
        if (!res.ok && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          res = await fetch('http://localhost:3001/api/health');
        }
        if (res.ok) {
          const data = await res.json();
          if (data.features?.ultron?.model) {
            setModelName(data.features.ultron.model);
          }
        }
      } catch { /* fallback */ }
    };
    checkHealth();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Smart API caller
  const callChatApi = async (payload) => {
    // If on localhost or local file, query local daemon directly
    if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      try {
        const localRes = await fetch('http://localhost:3001/api/ultron/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (localRes.ok || localRes.status !== 404) {
          return localRes;
        }
      } catch { /* fallback */ }
    }

    // On cloud hosting (Vercel), query relative /api/ultron/chat
    try {
      const res = await fetch('/api/ultron/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status !== 404) {
        return res;
      }
    } catch { /* fallback */ }

    return await fetch('http://localhost:3001/api/ultron/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

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
        role: m.role,
        content: m.content
      }));

      const res = await callChatApi({
        message: query,
        history: historyPayload.slice(-8)
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 || data.error === 'RESOURCE_EXHAUSTED') {
          setErrorBanner('Free-tier quota limit reached. A-Ultron is temporarily rate-limited. Please allow the window to reset before submitting further queries.');
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
    } catch {
      // Graceful offline standby response instead of raw socket error
      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          content: "A-Ultron neural gateway is currently in local offline mode. To activate live cognitive inference via Gemini free tier, ensure the backend environment variable GEMINI_API_KEY is configured or run 'node server/index.js' locally. Inquiries regarding Abhishek Limaye's UAV Security Lab, forensic research, and projects can be explored across the portfolio.",
          timestamp: replyTime
        }
      ]);
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
          <span className="ultron-status-tag">CORE</span>
          <div>
            <div className="ultron-title">A-Ultron</div>
            <div className="ultron-subtitle">
              <Cpu size={12} strokeWidth={1.5} />
              <span>SUBSTRATE: {modelName} // FREE-TIER COGNITION</span>
            </div>
          </div>
        </div>

        <div className="ultron-header-right">
          <button onClick={handleClear} className="ultron-action-btn" title="Purge Conversation Context">
            <RotateCcw size={14} strokeWidth={1.5} />
            <span>PURGE CONTEXT</span>
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
                  {msg.role === 'user' ? 'OPERATOR' : 'A-ULTRON'}
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
                <span className="ultron-sender-tag">A-ULTRON</span>
                <span className="ultron-timestamp">COMPUTING</span>
              </div>
              <div className="ultron-thinking-indicator">
                <span className="ultron-thinking-text">[COMPUTING] {THINKING_STATES[thinkingIndex]}</span>
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
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={NERDY_PLACEHOLDERS[placeholderIndex]}
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
          <ArrowRight size={18} strokeWidth={2} />
        </button>
      </form>

      {/* Status Bar */}
      <div className="ultron-status-bar">
        <span>SESSION MEMORY ACTIVE</span>
        <span>&bull;</span>
        <span>ZERO BIAS CORE</span>
        <span>&bull;</span>
        <span>VERIFIED RECORD RESTRICTION</span>
      </div>
    </div>
  );
};

export default Ultron;
