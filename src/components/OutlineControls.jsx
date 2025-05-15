// src/components/OutlineControls.jsx
import React from 'react';

export default function OutlineControls({ onChoose }) {
  return (
    <div className="d-flex gap-2">
      <button className="btn btn-success" onClick={() => onChoose('yes')}>Yes</button>
      <button className="btn btn-danger"  onClick={() => onChoose('no')}>No</button>
    </div>
  );
}
