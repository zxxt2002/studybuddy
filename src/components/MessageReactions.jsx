import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';

export default function MessageReactions({ onRegenerate }) {
  return (
    <ButtonGroup size="sm" className="mt-2">
      <Button 
        variant="outline-secondary" 
        onClick={() => onRegenerate('simpler')}
        title="Get a simpler explanation"
      >
        <i className="bi bi-arrow-down-circle"></i> Simpler
      </Button>
      <Button 
        variant="outline-secondary" 
        onClick={() => onRegenerate('more_complex')}
        title="Get a more detailed explanation"
      >
        <i className="bi bi-arrow-up-circle"></i> More Complex
      </Button>
      <Button 
        variant="outline-secondary" 
        onClick={() => onRegenerate('different')}
        title="Get a different explanation"
      >
        <i className="bi bi-arrow-repeat"></i> Different
      </Button>
    </ButtonGroup>
  );
} 