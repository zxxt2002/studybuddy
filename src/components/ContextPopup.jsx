import React, { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";


export default function ContextPopup({ show, onClose, onSave, initialContext = {} }) {
  const [description, setDescription] = useState(initialContext.description || "");
  const [priorKnowledge, setPriorKnowledge] = useState(initialContext.priorKnowledge || "");
  const [courseInfo, setCourseInfo] = useState(initialContext.courseInfo || "");
  const [notes, setNotes] = useState(initialContext.notes || "");
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
  };

  const handleSubmit = () => {
    const payload = { description, priorKnowledge, courseInfo, notes, file };
    onSave && onSave(payload);
    onClose();
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Additional Context for LLM</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form>
          <Form.Group className="mb-3" controlId="contextDescription">
            <Form.Label>Topic or Question</Form.Label>
            <Form.Control
              type="text"
              placeholder="Briefly describe what you're asking about"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="priorKnowledge">
            <Form.Label>Prior Knowledge Level</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g., 'I've seen this topic in class once'"
              value={priorKnowledge}
              onChange={(e) => setPriorKnowledge(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="courseInfo">
            <Form.Label>Relevant Course or Context</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g., CS 110, Section A"
              value={courseInfo}
              onChange={(e) => setCourseInfo(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="notes">
            <Form.Label>Additional Notes</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Any other context to help the tutor"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="fileUpload">
            <Form.Label>Optional File Upload</Form.Label>
            <Form.Control type="file" onChange={handleFileChange} />
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!description.trim()}
        >
          Submit & Go to Chat
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
