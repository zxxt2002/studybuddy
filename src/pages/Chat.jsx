// src/App.jsx
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import HintPopup from '../components/HintPopup';
import SummaryPopup from '../components/SummaryPopup';
import MessageReactions from '../components/MessageReactions';
import EssentialQuestionsModal from '../components/EssentialQuestionsModal';
import DOMPurify from 'isomorphic-dompurify';

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

    // New state for essential questions
    const [showQuestions, setShowQuestions] = useState(false);
    const [essentialQuestions, setEssentialQuestions] = useState([]);
    const [loadingQuestions, setLoadingQuestions] = useState(false);

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

    const handleRegenerate = async (messageIndex, complexity) => {
        try {
            const res = await fetch('/api/chat/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation: conversation.slice(0, messageIndex + 1),
                    problemStatement,
                    complexity
                })
            });
            const data = await res.json();

            // Update the message with the new response
            setConversation(prev => {
                const newConversation = [...prev];
                newConversation[messageIndex] = {
                    ...newConversation[messageIndex],
                    content: data.reply
                };
                return newConversation;
            });
        } catch (err) {
            console.error('Error regenerating response:', err);
        }
    };

    const handleEssentialQuestions = async () => {
        setShowQuestions(true);
        setLoadingQuestions(true);
        
        try {
            const response = await fetch('/api/essential-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation,
                    problemStatement
                })
            });

            if (!response.ok) throw new Error('Failed to generate essential questions');
            
            const data = await response.json();
            setEssentialQuestions(data.questions || []);
        } catch (err) {
            console.error('Error generating essential questions:', err);
            setEssentialQuestions([]);
        } finally {
            setLoadingQuestions(false);
        }
    };

    return (
        <div className="container py-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <img src="StudyBuddy.png" alt="Study Buddy Logo" className="logo" style={{ height: '100px' }}/>
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

            {/* Conversation history with markdown rendering */}
            <div className="conversation-container mb-4"
                 style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {conversation.map((message, index) => (
                    <div key={index}
                         className={`message mb-3 p-3 rounded ${
                             message.type === 'user'
                                 ? 'bg-primary text-white ms-auto'
                                 : 'bg-light'
                         }`}
                         style={{
                             maxWidth:'80%',
                             marginLeft: message.type === 'user' ? 'auto' : '0',
                             marginRight: message.type === 'user' ? '0' : 'auto',
                         }}>
                        <div className="message-content">
                            {message.type === 'user' ? (
                                <div style={{whiteSpace:'pre-line'}}>
                                    {message.content}
                                </div>
                            ) : (
                                <ReactMarkdown
                                    components={{
                                        // Custom styling for markdown elements
                                        h1: ({children}) => <h5 className="mb-2">{children}</h5>,
                                        h2: ({children}) => <h6 className="mb-2">{children}</h6>,
                                        h3: ({children}) => <strong className="d-block mb-1">{children}</strong>,
                                        p: ({children}) => <p className="mb-2">{children}</p>,
                                        ul: ({children}) => <ul className="mb-2 ps-3">{children}</ul>,
                                        ol: ({children}) => <ol className="mb-2 ps-3">{children}</ol>,
                                        li: ({children}) => <li className="mb-1">{children}</li>,
                                        code: ({children}) => <code className="bg-secondary text-light px-1 rounded">{children}</code>,
                                        pre: ({children}) => <pre className="bg-dark text-light p-2 rounded overflow-auto">{children}</pre>,
                                        blockquote: ({children}) => <blockquote className="border-start border-3 border-secondary ps-2 fst-italic">{children}</blockquote>,
                                        strong: ({children}) => <strong>{children}</strong>,
                                        em: ({children}) => <em>{children}</em>,
                                        a: ({href, children}) => <a href={href} className="text-decoration-none" target="_blank" rel="noopener noreferrer">{children}</a>
                                    }}
                                >
                                    {message.content}
                                </ReactMarkdown>
                            )}
                        </div>
                        {message.type === 'assistant' && (
                            <MessageReactions 
                                onRegenerate={(complexity) => handleRegenerate(index, complexity)} 
                            />
                        )}
                        <small className="text-muted d-block mt-1"
                               style={{ fontSize:'0.8rem' }}>
                            {message.timestamp}
                        </small>
                    </div>
                ))}
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
                <div className="col-auto">
                    <button className="btn btn-info" onClick={handleEssentialQuestions}>Essential Questions</button>
                </div>
            </div>

            <HintPopup show={showHint} onClose={()=>setShowHint(false)} hint={hintText} loading={loadingHint} />
            <SummaryPopup show={showSummary} onClose={()=>setShowSummary(false)} summary={summaryText} loading={loadingSummary} />
            <EssentialQuestionsModal 
                show={showQuestions} 
                onClose={() => setShowQuestions(false)} 
                questions={essentialQuestions} 
                loading={loadingQuestions} 
            />
        </div>
    );
}
