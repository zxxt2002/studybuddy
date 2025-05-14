// src/App.jsx
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState } from 'react';
import HintPopup from './components/HintPopup';
import SummaryPopup from './components/SummaryPopup';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState(null);
  const [response, setResponse] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const [showSumm, setShowSumm] = useState(false);
  const [SummText, setSummText] = useState('');
  const [SummLoading, setSummLoading] = useState(false);

  const handleSend = async () => {
    const form = new FormData();
    form.append('prompt', prompt);
    if (file) form.append('file', file);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      setResponse(data.error ? `Error: ${data.error}` : data.reply);
    } catch (err) {
      setResponse(`Error: ${err.message}`);
    }
  };
  const handleGetHint = async () => {
    setHintLoading(true);
    try {
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setHintText(data.hint || 'No hint available');
      setShowHint(true);
    } catch (err) {
      setHintText(`Error: ${err.message}`);
      setShowHint(true);
    } finally {
      setHintLoading(false);
    }
  };
  const handleGetSumm = async () => {
    setSummLoading(true);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setSummText(data.summary || 'No summary available');
      setShowSumm(true);
    } catch (err) {
      setSummText(`Error: ${err.message}`);
      setShowSumm(true);
    } finally {
      setSummLoading(false);
    }
  };

  return (
    <div className="container py-4">
      <h1 className="mb-4 text-center">STUDY BUDDY</h1>

      {/* Response section above inputs */}
      <h2 className="mb-2">Response:</h2>
      <pre
        className="border rounded p-3 bg-light mb-4"
        style={{ whiteSpace: 'pre-wrap', minHeight: '100px' }}
      >
        {response}
      </pre>

      {/* Hint trigger */}
      <div className="text-end mb-2">
        <button
          className="btn btn-link"
          onClick={handleGetHint}
          disabled={hintLoading}
        >
          {hintLoading ? 'Loading hint...' : 'Need a hint?'}
        </button>
      </div>

      {/* Summary */}
      <div className="text-end mb-2">
        <button
          className="btn btn-link"
          onClick={handleGetSumm}
          disabled={SummLoading}
        >
          {SummLoading ? 'Loading summary...' : 'Show Summary'}
        </button>
      </div>

      {/* Question textarea */}
      <div className="mb-4">
        <label htmlFor="prompt" className="form-label">
          Your Question
        </label>
        <textarea
          id="prompt"
          className="form-control"
          rows={4}
          placeholder="Enter your question here…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
      </div>

      {/* File input and Send button on same line */}
      <div className="row align-items-end mb-5">
        <div className="col">
          <label htmlFor="fileInput" className="form-label">
            Attach a File (optional)
          </label>
          <input
            type="file"
            id="fileInput"
            className="form-control"
            onChange={e => setFile(e.target.files[0] || null)}
          />
        </div>
        <div className="col-auto">
          <button className="btn btn-primary w-100" onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
      {/* Hint Popup Component */}
      <HintPopup
        show={showHint}
        handleClose={() => setShowHint(false)}
        hintText={hintText}
        loading={hintLoading}
      />
      <SummaryPopup
        show={showSumm}
        handleClose={() => setShowSumm(false)}
        hintText={SummText}
        loading={SummLoading}
      />
    </div>
  );
}
