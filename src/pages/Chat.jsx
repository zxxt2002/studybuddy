// src/App.jsx
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect } from 'react';
import HintPopup from '../components/HintPopup';

export default function Chat() {
    const [prompt, setPrompt] = useState('');
    const [file, setFile] = useState(null);
    const [problemStatement, setProblemStatement] = useState(() => {
        // Load problem statement from localStorage on initial render
        return localStorage.getItem('problemStatement') || '';
    });
    const [conversation, setConversation] = useState(() => {
        // Load conversation from localStorage on initial render
        const savedConversation = localStorage.getItem('conversation');
        return savedConversation ? JSON.parse(savedConversation) : [];
    });

    const [showHint, setShowHint] = useState(false);
    const [hintText, setHintText] = useState('');
    const [loadingHint, setLoadingHint] = useState(false);


    // Save conversation and problem statement to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('conversation', JSON.stringify(conversation));
        localStorage.setItem('problemStatement', problemStatement);
    }, [conversation, problemStatement]);

    const handleClearConversation = () => {
        setConversation([]);
        setProblemStatement('');
        localStorage.removeItem('conversation');
        localStorage.removeItem('problemStatement');
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
        // Add conversation history and problem statement to the request
        form.append('conversation', JSON.stringify(conversation));
        form.append('problemStatement', problemStatement);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
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
    const handleHint = async () => {
        setShowHint(true);
        setLoadingHint(true);

        try {
            const res = await fetch('/api/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation, problemStatement })
            });
            const data = await res.json();
            setHintText(data.hint || 'No hint available');
        } catch (err) {
            console.error(err);
            setHintText('Error loading hint');
        } finally {
            setLoadingHint(false);
        }
    };


    return (
        <div className="container py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h1 className="mb-0">STUDY BUDDY</h1>
                <button
                    className="btn btn-outline-danger"
                    onClick={handleClearConversation}
                    disabled={conversation.length === 0 && !problemStatement}
                >
                    Clear Conversation
                </button>
            </div>

            {/* Problem Statement Section */}
            <div className="mb-4">
                <label htmlFor="problemStatement" className="form-label">
                    Problem Statement
                </label>
                <textarea
                    id="problemStatement"
                    className="form-control"
                    rows={2}
                    placeholder="Enter the main problem or topic you want to discuss..."
                    value={problemStatement}
                    onChange={e => setProblemStatement(e.target.value)}
                    disabled={conversation.length > 0}
                />
                {conversation.length > 0 && !problemStatement && (
                    <small className="text-danger">
                        Please set a problem statement before starting the conversation
                    </small>
                )}
            </div>

            {/* Display current problem statement if set */}
            {problemStatement && (
                <div className="alert alert-info mb-4">
                    <strong>Current Problem:</strong> {problemStatement}
                </div>
            )}

            {/* Conversation history */}
            <div className="conversation-container mb-4" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {conversation.map((message, index) => (
                    <div
                        key={index}
                        className={`message mb-3 p-3 rounded ${message.type === 'user' ? 'bg-primary text-white ms-auto' : 'bg-light'
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
            <div className="row align-items-end mb-5 gx-2">
                {/* file input in a shrink-to-content column */}
                <div className="col-auto">
                    <label htmlFor="fileInput" className="form-label">
                        Attach (optional)
                    </label>
                    <input
                        type="file"
                        id="fileInput"
                        className="form-control form-control-md w-auto"
                        style={{ maxWidth: '240px' }}
                        onChange={e => setFile(e.target.files[0] || null)}
                    />
                </div>

                {/* send button */}
                <div className="col-auto">
                    <button
                        className="btn btn-primary"
                        onClick={handleSend}
                        disabled={!prompt.trim()}
                    >
                        Send
                    </button>
                </div>

                {/* hint button */}
                <div className="col-auto">
                    <button
                        className="btn btn-secondary"
                        onClick={handleHint}
                    >
                        {showHint ? "Hide hint" : "Need a hint?"}
                    </button>
                </div>
            </div>

            <HintPopup
                show={showHint}
                onClose={() => setShowHint(false)}
                hint={hintText}
                loading={loadingHint}
            />

        </div>
    );
}
