// src/App.jsx
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState } from 'react';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState(null);
  const [response, setResponse] = useState('');

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
    </div>
  );
}
