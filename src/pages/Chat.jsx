import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import HintPopup from '../components/HintPopup';
import SummaryPopup from '../components/SummaryPopup';
import MessageReactions from '../components/MessageReactions';
import EssentialQuestionsModal from '../components/EssentialQuestionsModal';

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

    const [showQuestions, setShowQuestions] = useState(false);
    const [essentialQuestions, setEssentialQuestions] = useState([]);
    const [questionProgress, setQuestionProgress] = useState([]);
    const [loadingQuestions, setLoadingQuestions] = useState(false);

    // Fetch initial conversation and essential questions
    useEffect(() => {
        fetch('/api/conversation')
          .then(res => res.json())
          .then(data => {
            setConversation(data.conversation || []);
            setProblemStatement(data.problemStatement || '');
            // Also fetch essential questions if they exist
            if (data.conversation?.length > 0) {
              fetchEssentialQuestions();
            }
          })
          .catch(console.error);
    }, []);

    const fetchEssentialQuestions = async () => {
        try {
            const response = await fetch('/api/essential-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (response.ok) {
                const data = await response.json();
                setEssentialQuestions(data.questions || []);
                setQuestionProgress(data.progress || []);
            }
        } catch (err) {
            console.error('Error fetching essential questions:', err);
        }
    };

    const handleClearConversation = () => {
        setConversation([]);
        setProblemStatement('');
        setEssentialQuestions([]);
        setQuestionProgress([]);
        // Navigate back to home instead of showing context popup
        window.location.href = '/';
    };

    // Simpler approach - use the conversation returned by the server
    const handleSend = async () => {
        if (!prompt.trim()) return;

        const form = new FormData();
        form.append('prompt', prompt);
        form.append('conversation', JSON.stringify(conversation));
        form.append('problemStatement', problemStatement);
        if (file) form.append('file', file);

        try {
            const res = await fetch('/api/chat', { method: 'POST', body: form });
            const data = await res.json();
            
            if (data.conversation) {
                // Use the conversation returned by the server
                setConversation(data.conversation);
            } else {
                // Fallback: add messages manually if server doesn't return conversation
                const userMessage = {
                    type: 'user',
                    content: prompt,
                    timestamp: new Date().toLocaleTimeString()
                };
                const assistantMessage = {
                    type: 'assistant',
                    content: data.error ? `Error: ${data.error}` : data.reply,
                    timestamp: new Date().toLocaleTimeString()
                };
                setConversation(prev => [...prev, userMessage, assistantMessage]);
            }
        } catch (err) {
            const errorMessage = {
                type: 'assistant',
                content: `Error: ${err.message}`,
                timestamp: new Date().toLocaleTimeString()
            };
            setConversation(prev => [...prev, errorMessage]);
        }
        
        setPrompt('');
        setFile(null);
    };

    const handleHint = async () => {
        if (showHint) {
            setShowHint(false);
            return;
        }

        setLoadingHint(true);
        try {
            const response = await fetch('/api/hint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    conversation,
                    problemStatement
                })
            });

            if (response.ok) {
                const data = await response.json();
                setHintText(data.hint || 'No hint available');
                setShowHint(true);
            }
        } catch (error) {
            console.error('Error getting hint:', error);
            setHintText('Error getting hint');
        } finally {
            setLoadingHint(false);
        }
    };

    const handleSummary = async () => {
        if (showSummary) {
            setShowSummary(false);
            return;
        }

        setLoadingSummary(true);
        try {
            const response = await fetch('/api/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation,
                    problemStatement
                })
            });

            if (response.ok) {
                const data = await response.json();
                setSummaryText(data.summary || 'No summary available');
                setShowSummary(true);
            }
        } catch (error) {
            console.error('Error getting summary:', error);
            setSummaryText('Error getting summary');
        } finally {
            setLoadingSummary(false);
        }
    };

    const handleRegenerate = async (messageIndex, complexity) => {
        try {
            const response = await fetch('/api/chat/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageIndex,
                    complexity,
                    conversation,
                    problemStatement
                })
            });

            if (response.ok) {
                const data = await response.json();
                const updatedConversation = [...conversation];
                updatedConversation[messageIndex] = {
                    ...updatedConversation[messageIndex],
                    content: data.response
                };
                setConversation(updatedConversation);
            }
        } catch (error) {
            console.error('Error regenerating message:', error);
        }
    };

    const handleEssentialQuestions = async () => {
        setShowQuestions(true);
        // No loading needed since questions are already cached
        setLoadingQuestions(false);
    };

    // Fix the toggle handler to preserve conversation

    const handleToggleProgress = async (questionIndex) => {
        try {
            const response = await fetch('/api/essential-questions/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionIndex })
            });

            if (response.ok) {
                const data = await response.json();
                setQuestionProgress(data.progress || []);
                
                // Update conversation if there's a new tutor message
                if (data.conversation && data.conversation.length > conversation.length) {
                    setConversation(data.conversation);
                }
                
                // Also refresh conversation from server to make sure we're in sync
                const conversationRes = await fetch('/api/conversation');
                if (conversationRes.ok) {
                    const conversationData = await conversationRes.json();
                    setConversation(conversationData.conversation || []);
                    setQuestionProgress(conversationData.questionProgress || []);
                }
            }
        } catch (err) {
            console.error('Error toggling progress:', err);
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

            {problemStatement && (
                <div className="alert alert-info mb-4 d-flex justify-content-between align-items-center">
                    <div>
                        <strong>Current Problem:</strong> {problemStatement}
                    </div>
                    {essentialQuestions.length > 0 && (
                        <small className="text-muted">
                            Progress: {questionProgress.filter(Boolean).length}/{essentialQuestions.length} key concepts covered
                        </small>
                    )}
                </div>
            )}

            {/* Conversation history with markdown rendering */}
            <div className="conversation-container mb-4"
                 style={{ 
                   maxHeight: '60vh', // Use viewport height instead of fixed pixels
                   minHeight: '300px', // Ensure minimum height
                   overflowY: 'auto',
                   border: '1px solid #dee2e6',
                   borderRadius: '0.375rem',
                   padding: '1rem',
                   backgroundColor: '#f8f9fa'
                 }}>
                {conversation.length === 0 ? (
                    <div className="text-center text-muted py-4">
                        <p>No conversation yet. Start by asking a question!</p>
                    </div>
                ) : (
                    conversation.map((message, index) => (
                        <div key={index}
                             className={`message mb-3 p-3 rounded ${
                                 message.type === 'user'
                                     ? 'bg-primary text-white ms-auto'
                                     : 'bg-white shadow-sm'
                             }`}
                             style={{
                                 maxWidth:'85%',
                                 marginLeft: message.type === 'user' ? 'auto' : '0',
                                 marginRight: message.type === 'user' ? '0' : 'auto',
                                 border: message.type === 'assistant' ? '1px solid #e9ecef' : 'none'
                             }}>
                            <div className="message-content">
                                {message.type === 'user' ? (
                                    <div style={{whiteSpace:'pre-line'}}>
                                        {message.content}
                                    </div>
                                ) : (
                                    <ReactMarkdown
                                        components={{
                                            h1: ({children}) => <h5 className="mb-2 text-primary">{children}</h5>,
                                            h2: ({children}) => <h6 className="mb-2 text-secondary">{children}</h6>,
                                            h3: ({children}) => <strong className="d-block mb-1">{children}</strong>,
                                            p: ({children}) => <p className="mb-2">{children}</p>,
                                            ul: ({children}) => <ul className="mb-2 ps-3">{children}</ul>,
                                            ol: ({children}) => <ol className="mb-2 ps-3">{children}</ol>,
                                            li: ({children}) => <li className="mb-1">{children}</li>,
                                            code: ({children}) => <code className="bg-secondary text-light px-1 rounded">{children}</code>,
                                            pre: ({children}) => <pre className="bg-dark text-light p-2 rounded overflow-auto">{children}</pre>,
                                            blockquote: ({children}) => <blockquote className="border-start border-3 border-secondary ps-2 fst-italic">{children}</blockquote>,
                                            strong: ({children}) => <strong className="text-primary">{children}</strong>,
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
                                {message.timestamp || 'Just now'}
                            </small>
                        </div>
                    ))
                )}
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
                progress={questionProgress}
                loading={loadingQuestions}
                onToggleProgress={handleToggleProgress} // Add this for manual testing
            />
        </div>
    );
}
