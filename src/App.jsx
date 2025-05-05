import React, { useState } from 'react';

function App() {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState(null);
  const [response, setResponse] = useState('');

  const handleSend = async () => {
    const form = new FormData();
    form.append('prompt', prompt);
    if (file) {
      form.append('file', file);
    }

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
    <div>
      <h1>STUDY BUDDY</h1>

      <textarea
        id="prompt"
        rows={4}
        cols={60}
        placeholder="Enter your question here…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
      />
      <br />

      <input
        type="file"
        id="fileInput"
        onChange={e => setFile(e.target.files[0] || null)}
      />
      <br /><br />

      <button id="send" onClick={handleSend}>
        Send
      </button>

      <h2>Response:</h2>
      <pre id="response">{response}</pre>
    </div>
  );
}

export default App;
