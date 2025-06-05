import React from 'react';
import { Modal, Button, ListGroup, ProgressBar } from 'react-bootstrap';

export default function EssentialQuestionsModal({ show, onClose, questions, progress = [], onToggleProgress }) {
  const completedCount = progress.filter(Boolean).length;
  const progressPercentage = questions.length > 0 ? (completedCount / questions.length) * 100 : 0;

  const nextIncompleteIndex = progress.findIndex(completed => !completed);

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Essential Questions to Master This Topic</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-3">
          <div className="d-flex justify-content-between mb-2">
            <span>Progress: {completedCount}/{questions.length} concepts mastered</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <ProgressBar now={progressPercentage} variant={progressPercentage === 100 ? 'success' : 'primary'} />
          
          {nextIncompleteIndex !== -1 && (
            <div className="mt-2">
              <small className="text-muted">
                <strong>Current focus:</strong> Question {nextIncompleteIndex + 1}
              </small>
            </div>
          )}
        </div>

        <div className="alert alert-info">
          <small>
            <strong>How to use:</strong> Mark questions as complete when you feel you understand the concept. 
            This will guide the tutor to move on to the next essential topic.
          </small>
        </div>

        <ListGroup variant="flush">
          {questions.map((question, index) => (
            <ListGroup.Item 
              key={index} 
              className={`px-0 ${progress[index] ? 'bg-success bg-opacity-10' : index === nextIncompleteIndex ? 'bg-warning bg-opacity-10' : ''}`}
            >
              <div className="d-flex align-items-start">
                <span className={`badge me-2 mt-1 ${
                  progress[index] ? 'bg-success' : 
                  index === nextIncompleteIndex ? 'bg-warning' : 'bg-secondary'
                }`}>
                  {index + 1}
                </span>
                <div className="flex-grow-1">
                  <span className={progress[index] ? 'text-success' : ''}>
                    {question}
                  </span>
                  {progress[index] && (
                    <small className="text-success d-block">✓ Mastered</small>
                  )}
                  {index === nextIncompleteIndex && !progress[index] && (
                    <small className="text-warning d-block">← Current focus</small>
                  )}
                </div>
                <Button 
                  size="sm" 
                  variant={progress[index] ? "success" : "outline-primary"}
                  onClick={() => onToggleProgress(index)}
                  className="ms-2"
                >
                  {progress[index] ? "✓ Mastered" : "Mark Complete"}
                </Button>
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>

        {progressPercentage === 100 && (
          <div className="alert alert-success mt-3">
            <strong>🎉 Congratulations!</strong> You've mastered all essential concepts for this topic!
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}