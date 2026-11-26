import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import SparkMD5 from 'spark-md5';

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]} (${bytes.toLocaleString()} bytes)`;
}

const HashCalculator = () => {
  const [activeTab, setActiveTab] = useState('file');
  const [dragOver, setDragOver] = useState(false);
  const [fileMeta, setFileMeta] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [hashes, setHashes] = useState({ md5: '', sha1: '', sha256: '', sha512: '' });
  const [expectedHash, setExpectedHash] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [copiedAlgo, setCopiedAlgo] = useState('');
  const fileInputRef = useRef(null);

  const computeAllHashes = async (buffer) => {
    const spark = new SparkMD5.ArrayBuffer();
    spark.append(buffer);
    const md5 = spark.end();

    const [sha1Buf, sha256Buf, sha512Buf] = await Promise.all([
      crypto.subtle.digest('SHA-1', buffer),
      crypto.subtle.digest('SHA-256', buffer),
      crypto.subtle.digest('SHA-512', buffer),
    ]);

    setHashes({
      md5,
      sha1: bufferToHex(sha1Buf),
      sha256: bufferToHex(sha256Buf),
      sha512: bufferToHex(sha512Buf),
    });
    setStatusMsg('');
  };

  const processFile = async (file) => {
    if (!file) return;
    setFileMeta({
      name: file.name,
      size: formatBytes(file.size),
      type: file.type || 'application/octet-stream',
      lastModified: new Date(file.lastModified).toLocaleString(),
    });
    setStatusMsg(`Computing hashes across ${formatBytes(file.size)}...`);
    try {
      const buffer = await file.arrayBuffer();
      await computeAllHashes(buffer);
    } catch (err) {
      setStatusMsg(`Error processing file: ${err.message}`);
    }
  };

  const handleCalculateText = async () => {
    if (!textInput) {
      setStatusMsg('Please enter text to hash.');
      return;
    }
    const bytes = new TextEncoder().encode(textInput);
    await computeAllHashes(bytes.buffer);
  };

  const handleCopy = async (algo) => {
    const val = hashes[algo];
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedAlgo(algo);
      setTimeout(() => setCopiedAlgo(''), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const normalizedExpected = expectedHash.trim().toLowerCase();
  let matchedAlgo = null;
  if (normalizedExpected) {
    for (const [algo, val] of Object.entries(hashes)) {
      if (val && val.toLowerCase() === normalizedExpected) {
        matchedAlgo = algo.toUpperCase();
        break;
      }
    }
  }

  const textByteCount = new TextEncoder().encode(textInput).length;

  return (
    <div className="page-container">
      <Link to="/#toolkit" className="back-link">
        &larr; Back to Toolkit
      </Link>

      <div className="tool-container-card">
        <div className="tool-header">
          <h1>HashCalculator</h1>
          <p>
            Forensic-grade cryptographic hash generator &amp; integrity verifier for text and local files.
          </p>
        </div>

        <hr className="post-divider" />

        <div className="tab-bar">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            File Input
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTab('text')}
          >
            Text Input
          </button>
        </div>

        {activeTab === 'file' ? (
          <div className="tab-pane-react">
            <div
              className={`drop-zone ${dragOver ? 'dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) {
                  processFile(e.dataTransfer.files[0]);
                }
              }}
            >
              <div className="drop-zone-icon">INPUT</div>
              <div className="drop-zone-text">
                Drag and drop any file here, or click to browse
              </div>
              <div className="drop-zone-subtext">
                Runs 100% in-browser via Web Crypto API. File is never uploaded.
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) processFile(e.target.files[0]);
              }}
            />

            {fileMeta && (
              <div className="file-info-card">
                <div>
                  <strong>File Name:</strong> {fileMeta.name}
                </div>
                <div>
                  <strong>Size:</strong> {fileMeta.size}
                </div>
                <div>
                  <strong>MIME Type:</strong> {fileMeta.type}
                </div>
                <div>
                  <strong>Last Modified:</strong> {fileMeta.lastModified}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="tab-pane-react">
            <div className="form-group">
              <label htmlFor="hash-text-input">Input Text</label>
              <textarea
                id="hash-text-input"
                rows="5"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter or paste text to hash..."
                className="tool-textarea"
              />
              <div className="text-meta-line">
                {textInput.length} characters, {textByteCount.toLocaleString()} bytes
              </div>
            </div>
            <button type="button" className="btn-tool" onClick={handleCalculateText}>
              Generate Hashes
            </button>
          </div>
        )}

        <div className="verification-group">
          <label htmlFor="expected-hash">
            Integrity Verification (Optional Expected Hash)
          </label>
          <input
            id="expected-hash"
            type="text"
            value={expectedHash}
            onChange={(e) => setExpectedHash(e.target.value)}
            placeholder="Paste expected MD5, SHA-1, SHA-256, or SHA-512 to verify match..."
            className="tool-input"
          />
          {normalizedExpected && (
            <div style={{ marginTop: '0.5rem' }}>
              {matchedAlgo ? (
                <span className="status-badge status-match">
                  [MATCH] INTEGRITY VERIFIED &mdash; Matches {matchedAlgo}
                </span>
              ) : hashes.sha256 ? (
                <span className="status-badge status-mismatch">
                  [MISMATCH] NO MATCH &mdash; Expected hash does not match generated algorithms
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="results-section">
          <h3 className="results-heading">Calculated Hashes</h3>
          {statusMsg && <p style={{ color: '#aaa', fontSize: '0.9rem' }}>{statusMsg}</p>}

          {[
            { key: 'md5', label: 'MD5 (128-bit)' },
            { key: 'sha1', label: 'SHA-1 (160-bit, Legacy)' },
            { key: 'sha256', label: 'SHA-256 (256-bit, Standard)' },
            { key: 'sha512', label: 'SHA-512 (512-bit, High Security)' },
          ].map(({ key, label }) => {
            const isMatched =
              normalizedExpected && hashes[key] && hashes[key].toLowerCase() === normalizedExpected;
            return (
              <div key={key} className={`hash-card ${isMatched ? 'matched' : ''}`}>
                <div className="hash-header">
                  <span className="hash-name">{label}</span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => handleCopy(key)}
                    disabled={!hashes[key]}
                  >
                    {copiedAlgo === key ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="hash-value">
                  {hashes[key] || 'Select a file or enter text to generate...'}
                </div>
              </div>
            );
          })}
        </div>

        <p className="privacy-note">
          Security Notice: 100% Client-Side Privacy: All cryptographic hashing is computed locally in memory via the browser Web Crypto API. No files or text are ever transmitted to any server.
        </p>
      </div>
    </div>
  );
};

export default HashCalculator;
