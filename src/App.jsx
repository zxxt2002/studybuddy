// src/App.jsx
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect } from 'react';
import './App.css';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState(null);
  const [conversation, setConversation] = useState(() => {
    // Load conversation from localStorage on initial render
    const savedConversation = localStorage.getItem('conversation');
    return savedConversation ? JSON.parse(savedConversation) : [];
  });

  // Save conversation to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conversation', JSON.stringify(conversation));
  }, [conversation]);

  const handleClearConversation = async () => {
    await fetch('/api/outline/reset', {
    method: 'POST',
    credentials: 'include'
    }); 
    setConversation([]);
    localStorage.removeItem('conversation');
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;

    // Add user message to conversation
    const userMessage = {
      type: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setConversation(prev => [...prev, userMessage]);
    setPrompt(''); // Clear input after sending

    const form = new FormData();
    form.append('prompt', prompt);
    if (file) form.append('file', file);
    // Add conversation history to the request
    form.append('conversation', JSON.stringify(conversation));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      
      // Add assistant response to conversation
      const assistantMessage = {
        type: 'assistant',
        content: data.error ? `Error: ${data.error}` : data.reply,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setConversation(prev => [...prev, assistantMessage]);
    } catch (err) {
      // Add error message to conversation
      const errorMessage = {
        type: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setConversation(prev => [...prev, errorMessage]);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="mb-0">STUDY BUDDY</h1>
        <button 
          className="btn btn-outline-danger"
          onClick={handleClearConversation}
          disabled={conversation.length === 0}
        >
          Clear Conversation
        </button>
      </div>

      {/* Conversation history */}
      <div className="conversation-container mb-4" style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {conversation.map((message, index) => (
          <div
            key={index}
            className={`message mb-3 p-3 rounded ${
              message.type === 'user' ? 'bg-primary text-white ms-auto' : 'bg-light'
            }`}
            style={{
              maxWidth: '80%',
              marginLeft: message.type === 'user' ? 'auto' : '0',
              marginRight: message.type === 'user' ? '0' : 'auto',
            }}
          >
            <div className="message-content">{message.content}</div>
            <small className="text-muted d-block mt-1" style={{ fontSize: '0.8rem' }}>
              {message.timestamp}
            </small>
          </div>
        ))}
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
          onKeyPress={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
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
          <button 
            className="btn btn-primary w-100" 
            onClick={handleSend}
            disabled={!prompt.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
