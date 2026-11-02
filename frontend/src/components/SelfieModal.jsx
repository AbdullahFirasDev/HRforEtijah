export default function SelfieModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="Selfie" style={{ width: '100%', borderRadius: 8 }} />
        <button className="btn secondary" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
