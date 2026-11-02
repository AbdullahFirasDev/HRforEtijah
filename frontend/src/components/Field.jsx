// Label + control + one line underneath: the error when there is one,
// otherwise the hint (a rule such as a minimum length).
export default function Field({ id, label, required, hint, error, className, children }) {
  return (
    <div className={['field', error && 'field-invalid', className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && (
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
