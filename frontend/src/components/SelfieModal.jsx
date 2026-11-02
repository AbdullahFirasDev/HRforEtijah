export default function SelfieModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label="صورة الحضور" onClick={(e) => e.stopPropagation()}>
        <img className="modal-image" src={src} alt="صورة الحضور" />
        <button className="btn secondary btn-block" style={{ marginTop: 'var(--space-4)' }} onClick={onClose}>
          إغلاق
        </button>
      </div>
    </div>
  );
}
