// src/pages/Home.jsx
import React, { useState } from 'react'
import { Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import ContextPopup from '../components/ContextPopup.jsx'

export default function Home() {
  const [show, setShow] = useState(false)
  const navigate = useNavigate()

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

  return (
    <div className="d-flex flex-column justify-content-center align-items-center vh-100 text-center">
      <img src="StudyBuddy.png" alt="Study Buddy Logo" className="logo" style={{ height: '400px' }}/>
      <Button size="lg" onClick={() => setShow(true)}>
        Provide Context &amp; Start Chat
      </Button>

      <ContextPopup
        show={show}
        onClose={() => setShow(false)}
        onSave={handleSaveContext}
      />
    </div>
  )
}
