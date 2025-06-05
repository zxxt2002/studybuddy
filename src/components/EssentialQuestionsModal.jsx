import React from 'react';
import { Modal, Button, ListGroup, Spinner } from 'react-bootstrap';

export default function EssentialQuestionsModal({ show, onClose, questions, loading }) {
  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Essential Questions to Master This Topic</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center p-4">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
            <p className="mt-2">Generating essential questions...</p>
          </div>
        ) : questions.length > 0 ? (
          <ListGroup variant="flush">
            {questions.map((question, index) => (
              <ListGroup.Item key={index} className="px-0">
                <strong>{index + 1}.</strong> {question}
              </ListGroup.Item>
            ))}
          </ListGroup>
        ) : (
          <p className="text-muted">No questions available yet. Start a conversation to generate essential questions.</p>
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