// src/pages/Home.jsx
import React, { useState } from 'react';
import { Button, Container } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import ContextPopup from '../components/ContextPopup.jsx';
import { Book, QuestionCircle, GraphUp } from 'react-bootstrap-icons';
import './Home.css';

export default function Home() {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();

  const handleSaveContext = async (ctx) => {
    const formData = new FormData();
    formData.append('description', ctx.description);
    formData.append('priorKnowledge', ctx.priorKnowledge);
    formData.append('courseInfo', ctx.courseInfo);
    formData.append('notes', ctx.notes);
    if (ctx.file) formData.append('file', ctx.file);


    await fetch('/api/context', { 
      method: 'POST', 
      credentials: 'include',
      body: formData 
    })
    navigate('/chat')
  }

  return (
    <Container fluid className="home-wrapper p-0">
      {/* ===== HEADER: Logo pinned to top ===== */}
      <header className="home-header d-flex justify-content-center align-items-center">
        <img
          src="StudyBuddy.png"
          alt="Study Buddy Logo"
          className="logo"
        />
      </header>

      {/* ===== MAIN: Centered tagline + CTA + feature boxes ===== */}
      <main className="home-main d-flex flex-column justify-content-center align-items-center text-center px-3">
        {/* Tagline: larger and centered */}
        <h2 className="tagline mb-4">
          Your AI socratic learning companion.
        </h2>

        {/* Primary CTA Button */}
        <Button
          size="lg"
          className="primary-button mb-5"
          onClick={() => setShow(true)}
        >
          Upload Context &amp; Start Chat
        </Button>

        {/* ===== Three horizontal feature boxes ===== */}
        <div className="features-list d-flex flex-row justify-content-center align-items-stretch flex-wrap">
          {/* Feature #1 */}
          <div className="feature-box mx-2 mb-4">
            <div className="feature-icon"><Book size={36} color="#003049" /></div>
            <div className="feature-content">
              <h5 className="feature-title">Learn at Your Own Pace</h5>
              <p className="feature-text">
                Upload notes or lecture slides and let Study Buddy guide you through custom questions that match your current level.
              </p>
            </div>
          </div>

          {/* Feature #2 */}
          <div className="feature-box mx-2 mb-4">
            <div className="feature-icon"><QuestionCircle size={36} color="#003049" /></div>
            <div className="feature-content">
              <h5 className="feature-title">Socratic-Style Guidance</h5>
              <p className="feature-text">
                Engage in back-and-forth dialogue—ask for simpler or more challenging questions, request hints, and deepen your understanding step by step.
              </p>
            </div>
          </div>

          {/* Feature #3 */}
          <div className="feature-box mx-2 mb-4">
            <div className="feature-icon"><GraphUp size={36} color="#003049" /></div>
            <div className="feature-content">
              <h5 className="feature-title">Master Any Subject</h5>
              <p className="feature-text">
                Whether it’s calculus, history, or coding, our AI adapts to your background and tracks your progress so you can tackle the hardest problems with confidence.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ===== CONTEXT POPUP MODAL ===== */}
      <ContextPopup
        show={show}
        onClose={() => setShow(false)}
        onSave={handleSaveContext}
      />
    </Container>
  );
}
