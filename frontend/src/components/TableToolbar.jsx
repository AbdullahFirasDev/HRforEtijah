// Record count, search box and export buttons above a list of records
export default function TableToolbar({ title, count, search, onSearch, placeholder, onCsv, onPdf, disabled }) {
  return (
    <div className="table-toolbar">
      <div className="table-toolbar-info">
        {title && <h3 className="table-toolbar-title">{title}</h3>}
        <span className="table-count">عدد السجلات: {count}</span>
      </div>
      <div className="table-toolbar-actions">
        <div className="table-search-wrap">
          <svg className="table-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="table-search"
            placeholder={placeholder}
            aria-label={placeholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={onCsv}
          disabled={disabled}
          title="تصدير ملف CSV يفتح في Excel"
        >
          تصدير CSV
        </button>
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={onPdf}
          disabled={disabled}
          title="طباعة الجدول أو حفظه PDF"
        >
          طباعة PDF
        </button>
      </div>
    </div>
  );
}
