export default function DateRangeFilter({ from, to, onFromChange, onToChange, onClear, extra }) {
  return (
    <div className="toolbar">
      <div>
        <label>From</label>
        <input type="date" value={from || ''} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} />
      </div>
      <div>
        <label>To</label>
        <input type="date" value={to || ''} min={from || undefined} onChange={(e) => onToChange(e.target.value)} />
      </div>
      {extra}
      {(from || to) && (
        <div style={{ flex: 'none' }}>
          <label>&nbsp;</label>
          <button type="button" className="btn secondary" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
