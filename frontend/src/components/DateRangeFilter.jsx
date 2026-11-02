import Field from './Field';

// Empty date fields show an Arabic hint instead of the browser's own
// day/month/year mask (see .date-input in index.css).
function DateInput({ id, value, onChange, ...rest }) {
  return (
    <div className="date-input" data-empty={!value} data-placeholder="اختر التاريخ">
      <input id={id} type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

export default function DateRangeFilter({ from, to, onFromChange, onToChange, onClear, extra }) {
  return (
    <div className="toolbar">
      <Field id="filter-from" label="من تاريخ">
        <DateInput id="filter-from" value={from} max={to || undefined} onChange={onFromChange} />
      </Field>
      <Field id="filter-to" label="إلى تاريخ">
        <DateInput id="filter-to" value={to} min={from || undefined} onChange={onToChange} />
      </Field>
      {extra}
      {(from || to) && (
        <div className="toolbar-actions">
          <button type="button" className="btn secondary" onClick={onClear}>
            مسح التاريخ
          </button>
        </div>
      )}
    </div>
  );
}
