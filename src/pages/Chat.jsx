// src/App.jsx
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect, useRef } from 'react';
import HintPopup from '../components/HintPopup';
import SummaryPopup from '../components/SummaryPopup';
import OutlineControls from '../components/OutlineControls';       
import { parseOutline } from '../utils/outlineUtils.js';

export default function Chat() {
    const [prompt, setPrompt] = useState('');
    const [file, setFile] = useState(null);
    const [problemStatement, setProblemStatement] = useState('');
    const [conversation, setConversation] = useState([]);

    const [showHint, setShowHint] = useState(false);
    const [hintText, setHintText] = useState('');
    const [loadingHint, setLoadingHint] = useState(false);

    const [showSummary, setShowSummary] = useState(false);
    const [summaryText, setSummaryText] = useState('');
    const [loadingSummary, setLoadingSummary] = useState(false);


    // Fetch initial seeded conversation (includes first tutor message)
    useEffect(() => {
        fetch('/api/conversation')
          .then(res => res.json())
          .then(data => {
            setConversation(data.conversation || []);
            setProblemStatement(data.problemStatement || '');
          })
          .catch(console.error);
      }, []);
      

    const handleClearConversation = () => {
        // Optionally reset server conversation/session here
        setConversation([]);
        setProblemStatement('');
    };

    const handleSend = async () => {
        if (!prompt.trim()) return;

        // Add user message locally
        const userMessage = {
            type: 'user',
            content: prompt,
            timestamp: new Date().toLocaleTimeString()
        };
        setConversation(prev => [...prev, userMessage]);

        const form = new FormData();
        form.append('prompt', prompt);
        if (file) form.append('file', file);

        // Only send new prompt; session holds past context
        try {
            const res = await fetch('/api/chat', { method: 'POST', body: form });
            const data = await res.json();
            const assistantMessage = {
                type: 'assistant',
                content: data.error ? `Error: ${data.error}` : data.reply,
                timestamp: new Date().toLocaleTimeString()
            };
            setConversation(prev => [...prev, assistantMessage]);
        } catch (err) {
            const errorMessage = {
                type: 'assistant',
                content: `Error: ${err.message}`,
                timestamp: new Date().toLocaleTimeString()
            };
            setConversation(prev => [...prev, errorMessage]);
        }
        setPrompt('');
    };

    const handleHint = async () => {
        setShowHint(true);
        setLoadingHint(true);
        try {
            const res = await fetch('/api/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problemStatement })
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

    const handleSummary = async () => {
        setShowSummary(true);
        setLoadingSummary(true);
        try {
            const res = await fetch('/api/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problemStatement })
            });
            const data = await res.json();
            setSummaryText(data.summary || 'No summary available');
        } catch (err) {
            console.error(err);
            setSummaryText('Error loading summary');
        } finally {
            setLoadingSummary(false);
        }
    }

    return (
        <div className="container py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h1 className="mb-0">STUDY BUDDY</h1>
                <button
                    className="btn btn-outline-danger"
                    onClick={handleClearConversation}
                    disabled={!conversation.length}
                >
                    Clear Conversation
                </button>
            </div>

            {/* Problem Statement Section */}
            <div className="mb-4">
                <label htmlFor="problemStatement" className="form-label">Problem Statement</label>
                <textarea
                    id="problemStatement"
                    className="form-control"
                    rows={2}
                    placeholder="Enter the main problem or topic you want to discuss..."
                    value={problemStatement}
                    onChange={e => setProblemStatement(e.target.value)}
                    disabled={conversation.length > 0}
                />
            </div>

            {problemStatement && (
                <div className="alert alert-info mb-4">
                    <strong>Current Problem:</strong> {problemStatement}
                </div>
            )}

            {/* Conversation history */}
            <div className="conversation-container mb-4" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {conversation.map((message, index) => {
                    if (message.type === 'assistant') {
                        const { part, total, content } = parseOutline(message.content);
                        if (part && total) {
                            const [outlineBody, tutorRaw=''] = content.split('**Tutor:**');
                            return (
                                <div key={index} className="mb-3">
                                    <OutlineControls part={part} total={total} content={outlineBody.trim()} />
                                    {tutorRaw.trim() && (
                                        <div className="message mb-3 p-3 rounded bg-light">
                                            <strong>Tutor:&nbsp;</strong>{tutorRaw.trim()}
                                        </div>
                                    )}
                                    <small className="text-muted d-block mt-1" style={{ fontSize:'0.8rem' }}>{message.timestamp}</small>
                                </div>
                            );
                        }
                    }
                    return (
                        <div key={index} className={`message mb-3 p-3 rounded ${message.type === 'user' ? 'bg-primary text-white ms-auto' : 'bg-light'}`} style={{maxWidth:'80%', marginLeft: message.type==='user' ? 'auto' : '0'}}>
                            <div className="message-content" style={{whiteSpace:'pre-line'}}>{message.content}</div>
                            <small className="text-muted d-block mt-1" style={{fontSize:'0.8rem'}}>{message.timestamp}</small>
                        </div>
                    );
                })}
            </div>

            {/* Question textarea */}
            <div className="mb-4">
                <label htmlFor="prompt" className="form-label">Your Question</label>
                <textarea
                    id="prompt"
                    className="form-control"
                    rows={4}
                    placeholder="Enter your question here…"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyPress={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
            </div>

            {/* File input & controls */}
            <div className="row align-items-end mb-5 gx-2">
                <div className="col-auto">
                    <label htmlFor="fileInput" className="form-label">Attach (optional)</label>
                    <input type="file" id="fileInput" className="form-control w-auto" style={{maxWidth:'240px'}} onChange={e=>setFile(e.target.files[0]||null)} />
                </div>
                <div className="col-auto">
                    <button className="btn btn-primary" onClick={handleSend} disabled={!prompt.trim()}>Send</button>
                </div>
                <div className="col-auto">
                    <button className="btn btn-secondary" onClick={handleHint}>{showHint?"Hide hint":"Need a hint?"}</button>
                </div>
                <div className="col-auto">
                    <button className="btn btn-secondary" onClick={handleSummary}>{showSummary?"Hide summary":"Get summary"}</button>
                </div>
            </div>

            <HintPopup show={showHint} onClose={()=>setShowHint(false)} hint={hintText} loading={loadingHint} />
            <SummaryPopup show={showSummary} onClose={()=>setShowSummary(false)} summary={summaryText} loading={loadingSummary} />
        </div>
    );
}
