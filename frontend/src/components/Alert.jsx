const ICONS = { error: '!', warning: '!', success: '✓', info: 'i' };

// Page- or form-level message box. Errors and warnings are announced to
// screen readers as soon as they appear. Renders nothing without content.
export default function Alert({ type = 'error', title, children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' || type === 'warning' ? 'alert' : 'status'}>
      <span className="alert-icon" aria-hidden="true">
        {ICONS[type]}
      </span>
      <div className="alert-body">
        {title && <strong className="alert-title">{title}</strong>}
        {children}
      </div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="إغلاق التنبيه">
          ×
        </button>
      )}
    </div>
  );
}
