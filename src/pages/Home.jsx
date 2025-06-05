// src/pages/Home.jsx
import React, { useState } from 'react'
import { Button, Container } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import ContextPopup from '../components/ContextPopup.jsx'
import Login from '../components/Login.jsx'
import Register from '../components/Register.jsx'

export default function Home() {
  const [showContext, setShowContext] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleSaveContext = async (ctx) => {
    const formData = new FormData()
    formData.append('description', ctx.description)
    formData.append('priorKnowledge', ctx.priorKnowledge)
    formData.append('courseInfo', ctx.courseInfo)
    formData.append('notes', ctx.notes)
    if (ctx.file) formData.append('file', ctx.file)

    await fetch('/api/context', { method: 'POST', body: formData })
    navigate('/chat')
  }

  const handleSwitchToRegister = () => {
    setShowLogin(false)
    setShowRegister(true)
  }

  const handleSwitchToLogin = () => {
    setShowRegister(false)
    setShowLogin(true)
  }

  return (
    <Container>
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 text-center">
        <img src="StudyBuddy.png" alt="Study Buddy Logo" className="logo" style={{ height: '200px' }}/>
        
        {user ? (
          // Authenticated user - show context setup
          <Button size="lg" onClick={() => setShowContext(true)}>
            Provide Context &amp; Start Chat
          </Button>
        ) : (
          // Non-authenticated user - show login/register buttons
          <div className="d-flex gap-3">
            <Button size="lg" variant="primary" onClick={() => setShowLogin(true)}>
              Login
            </Button>
            <Button size="lg" variant="outline-primary" onClick={() => setShowRegister(true)}>
              Register
            </Button>
          </div>
        )}

        {/* Context Popup - only for authenticated users */}
        {user && (
          <ContextPopup
            show={showContext}
            onClose={() => setShowContext(false)}
            onSave={handleSaveContext}
          />
        )}

        {/* Authentication Modals */}
        <Login 
          show={showLogin} 
          onClose={() => setShowLogin(false)}
          onSwitchToRegister={handleSwitchToRegister}
        />
        <Register 
          show={showRegister} 
          onClose={() => setShowRegister(false)}
          onSwitchToLogin={handleSwitchToLogin}
        />
      </div>
    </Container>
  )
}
