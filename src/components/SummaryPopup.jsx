import React from 'react';

export default function SummaryPopup({ show, handleClose, summaryText, loading }) {
    if (!show) return null;
    return (
        <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Summary</h5>
                        <button type="button" className="btn-close" onClick={handleClose} />
                    </div>
                    <div className="modal-body">
                        {loading
                            ? <div className="d-flex justify-content-center"><div className="spinner-border" role="status" /></div>
                            : <p>{summaryText}</p>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
