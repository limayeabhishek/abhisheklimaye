import React, { useState } from 'react';
import SparkMD5 from 'spark-md5';

// Helper function to convert ArrayBuffer to hex string
function arrayBufferToHex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Hash Calculator Component
const HashCalculator = () => {
  const [textInput, setTextInput] = useState('');
  const [file, setFile] = useState(null);
  const [textHashes, setTextHashes] = useState({ md5: '', sha256: '' });
  const [fileHashes, setFileHashes] = useState({ md5: '', sha256: '' });
  const [textHashingLoading, setTextHashingLoading] = useState(false);
  const [fileHashingLoading, setFileHashingLoading] = useState(false);
  const [fileHashingError, setFileHashingError] = useState('');

  // Function to calculate hashes for text input
  const calculateTextHashes = async () => {
    setTextHashingLoading(true);
    setTextHashes({ md5: '', sha256: '' });
    if (!textInput) {
      setTextHashingLoading(false);
      return;
    }

    // Calculate MD5 for text
    const spark = new SparkMD5();
    spark.append(textInput);
    const md5 = spark.end();

    // Calculate SHA256 for text
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(textInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const sha256 = arrayBufferToHex(hashBuffer);

    setTextHashes({ md5, sha256 });
    setTextHashingLoading(false);
  };

  // Function to calculate hashes for file input
  const calculateFileHashes = async () => {
    setFileHashingLoading(true);
    setFileHashes({ md5: '', sha256: '' });
    setFileHashingError('');
    if (!file) {
      setFileHashingError('Please select a file.');
      setFileHashingLoading(false);
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;

        // Calculate MD5 for file
        const spark = new SparkMD5.ArrayBuffer();
        spark.append(arrayBuffer);
        const md5 = spark.end();

        // Calculate SHA256 for file
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const sha256 = arrayBufferToHex(hashBuffer);

        setFileHashes({ md5, sha256 });
        setFileHashingLoading(false);
      };
      reader.onerror = () => {
        setFileHashingError('Failed to read file.');
        setFileHashingLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      setFileHashingError('Error during file hashing.');
      setFileHashingLoading(false);
      console.error('File hashing error:', e);
    }
  };

  return (
    <div className="tool-section">
      <h3>Hash Calculator (Text & File)</h3>
      <p>Calculate MD5 and SHA256 hash values for given text or an uploaded file. This tool operates entirely client-side.</p>

      {/* Text Hashing Section */}
      <div className="tool-ui" style={{ marginBottom: '30px' }}>
        <h4>Hash Text Input:</h4>
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Enter text here to calculate its hash..."
          className="tool-textarea"
          rows="5"
        />
        <button onClick={calculateTextHashes} className="btn tool-btn" disabled={textHashingLoading}>
          {textHashingLoading ? 'Calculating...' : 'Calculate Text Hashes'}
        </button>
        {textHashes.md5 && (
          <div className="tool-result">
            <p><strong>MD5:</strong> {textHashes.md5}</p>
            <p><strong>SHA256:</strong> {textHashes.sha256}</p>
          </div>
        )}
      </div>

      {/* File Hashing Section */}
      <div className="tool-ui">
        <h4>Hash File Input:</h4>
        <input
          type="file"
          onChange={(e) => {
            setFile(e.target.files[0]);
            setFileHashes({ md5: '', sha256: '' });
            setFileHashingError('');
          }}
          className="tool-input"
          style={{ border: 'none', paddingLeft: '0' }}
        />
        <button onClick={calculateFileHashes} className="btn tool-btn" disabled={fileHashingLoading}>
          {fileHashingLoading ? 'Calculating...' : 'Calculate File Hashes'}
        </button>
        {fileHashingError && <div className="tool-result" style={{ color: '#FF6666' }}>Error: {fileHashingError}</div>}
        {fileHashes.md5 && (
          <div className="tool-result">
            <p><strong>MD5:</strong> {fileHashes.md5}</p>
            <p><strong>SHA256:</strong> {fileHashes.sha256}</p>
          </div>
        )}
      </div>
    </div>
  );
};


// Log Timeline Analyzer Component
const LogTimelineAnalyzer = () => {
  const [logInput, setLogInput] = useState('');
  const [sortedLogs, setSortedLogs] = useState('');

  const analyzeLogs = () => {
    const lines = logInput.split(/\r?\n/).filter(line => line.trim() !== '');
    const datedLines = lines.map(line => {
      const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\b\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}(?:\s+\d{4})?\b/);
      const date = match ? new Date(match[0]) : null;
      return { line, date };
    }).filter(item => item.date && !isNaN(item.date));

    if (datedLines.length === 0) {
        setSortedLogs("No valid timestamps found. Please use YYYY-MM-DDTHH:mm:ss or standard syslog date formats (e.g., 'Dec 13 15:30:00').");
        return;
    }

    datedLines.sort((a, b) => a.date - b.date);
    setSortedLogs(datedLines.map(item => item.line).join('\n'));
  };

  return (
    <div className="tool-section">
      <h3>Log Timeline Analyzer</h3>
      <p>Paste logs with timestamps to sort them chronologically. The tool will look for ISO 8601 or syslog style timestamps.</p>
      <div className="tool-ui">
        <textarea
          value={logInput}
          onChange={(e) => setLogInput(e.target.value)}
          placeholder="Paste log entries here, one per line."
          className="tool-textarea"
          rows="10"
        />
        <button onClick={analyzeLogs} className="btn tool-btn">Analyze</button>
        {sortedLogs && (
          <div className="tool-result">
            <h4>Sorted Timeline:</h4>
            <pre className="tool-output">{sortedLogs}</pre>
          </div>
        )}
      </div>
    </div>
  );
};


// Human Identity Creator Component
const HumanIdentityCreator = () => {
    const [name, setName] = useState('');
    const [keywords, setKeywords] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const performSearch = async () => {
        setLoading(true);
        setResults(null);
        setError(null);
        try {
            const response = await fetch('http://localhost:3001/api/identity-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, keywords }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setResults(data);
        } catch (e) {
            setError('Failed to fetch results. Ensure the backend server is running on http://localhost:3001.');
            console.error('Identity Creator error:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tool-section">
            <h3>Human Identity Creator</h3>
            <p>
                Enter a name and keywords to simulate generating an identity profile.
                The results are fetched from a local backend server.
            </p>
            <div className="tool-ui">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter name (e.g., Abhishek Limaye)"
                    className="tool-input"
                />
                <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="Enter keywords (e.g., cybersecurity, digital forensics)"
                    className="tool-input tool-input-margin-top"
                />
                <button onClick={performSearch} className="btn tool-btn" disabled={loading}>
                    {loading ? 'Searching...' : 'Generate Identity Report'}
                </button>

                {error && <div className="tool-result" style={{ color: '#FF6666' }}>Error: {error}</div>}

                {results && (
                    <div className="tool-result">
                        <h4>Simulated Search Results for "{results.query.name}" with keywords "{results.query.keywords}":</h4>
                        {results.results.map((item, index) => (
                            <div key={index} style={{ marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                                <h5><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></h5>
                                <p>{item.snippet}</p>
                                <small>URL: <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></small>
                            </div>
                        ))}
                        <p style={{ marginTop: '15px', fontStyle: 'italic', fontSize: '0.9em' }}>{results.message}</p>
                    </div>
                )}
            </div>
        </div>
    );
};


// Digital Artifact Scanner Component (simulated)
const DigitalArtifactScanner = () => {
    const [hash, setHash] = useState('');
    const [scanResult, setScanResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const performScan = async () => {
        setLoading(true);
        setScanResult(null);
        setError(null);

        // Basic hash validation (e.g., MD5, SHA256 length)
        const trimmedHash = hash.trim();
        if (!/^[a-fA-F0-9]+$/.test(trimmedHash) || (trimmedHash.length !== 32 && trimmedHash.length !== 64)) {
            setError('Please enter a valid MD5 (32 chars) or SHA256 (64 chars) hash.');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('http://localhost:3001/api/artifact-scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ hash: trimmedHash }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setScanResult(data);
        } catch (e) {
            setError('Failed to fetch scan results. Ensure the backend server is running on http://localhost:3001.');
            console.error('Artifact Scanner error:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tool-section">
            <h3>Digital Artifact Scanner</h3>
            <p>
                Enter a file hash (MD5 or SHA256) to simulate a security scan for known threats.
                The results are fetched from a local backend server.
            </p>
            <div className="tool-ui">
                <input
                    type="text"
                    value={hash}
                    onChange={(e) => setHash(e.target.value)}
                    placeholder="Enter MD5 or SHA256 hash"
                    className="tool-input"
                />
                <button onClick={performScan} className="btn tool-btn" disabled={loading}>
                    {loading ? 'Scanning...' : 'Scan Artifact'}
                </button>

                {error && <div className="tool-result" style={{ color: '#FF6666' }}>Error: {error}</div>}

                {scanResult && (
                    <div className="tool-result">
                        <h4>Scan Report for {scanResult.hash}:</h4>
                        <p><strong>Detection Rate:</strong> {scanResult.detectionRate}</p>
                        <p><strong>Status:</strong> <span style={{ color: scanResult.status === 'Malicious' ? '#FF6666' : '#66FF66' }}>{scanResult.status}</span></p>
                        <p>{scanResult.details}</p>
                        <p style={{ marginTop: '15px', fontStyle: 'italic', fontSize: '0.9em' }}>{scanResult.message}</p>
                    </div>
                )}
            </div>
        </div>
    );
};


const Toolkit = () => {
  const [selectedTool, setSelectedTool] = useState(null); // null means no tool selected

  const toolOptions = [
    { id: 'hash', name: 'Hash Calculator', component: <HashCalculator /> },
    { id: 'log', name: 'Log Timeline Analyzer', component: <LogTimelineAnalyzer /> },
    { id: 'identity', name: 'Human Identity Creator', component: <HumanIdentityCreator /> }, 
    { id: 'scanner', name: 'Digital Artifact Scanner', component: <DigitalArtifactScanner /> }, // New tool
  ];

  return (
    <div className="page-container">
      <h2 className="page-title">Demonstration Toolkit</h2>

      {!selectedTool && (
        <div className="tool-selection-grid">
          {toolOptions.map(tool => (
            <div 
              key={tool.id} 
              className="tool-card btn" 
              onClick={() => setSelectedTool(tool.id)}
            >
              {tool.name}
            </div>
          ))}
        </div>
      )}

      {selectedTool && (
        <>
          <button onClick={() => setSelectedTool(null)} className="btn tool-back-btn">
            &larr; Back to Toolkit
          </button>
          {toolOptions.find(tool => tool.id === selectedTool)?.component}
        </>
      )}

      <div className="disclaimer">
        <strong>Disclaimer:</strong> The tools on this page are for educational and demonstrative purposes only. The Hash Calculator and Log Timeline Analyzer are client-side demonstrations. The Human Identity Creator and Digital Artifact Scanner interact with a local backend server, and their results are simulated. They are not live forensic tools and do not process, store, or transmit any sensitive user data to external services.
      </div>
    </div>
  );
};

export default Toolkit;
