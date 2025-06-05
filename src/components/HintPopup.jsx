// src/components/HintPopup.jsx
import React from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'isomorphic-dompurify';


export default function HintPopup({ show, onClose, hint, loading }) {
  return (
    <Modal show={show} onHide={onClose} centered>
        <Modal.Header closeButton>
            <Modal.Title>Hint</Modal.Title>
        </Modal.Header>
      <Modal.Body>
        {loading
          ? <div className="text-center"><Spinner animation="border" /></div>
          : <ReactMarkdown children={DOMPurify.sanitize(hint)} />
        }
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
