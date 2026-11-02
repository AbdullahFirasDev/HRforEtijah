import { useMemo, useState } from 'react';

// Generic table with a global search box, CSV export, and print/PDF export.
// columns: [{ key, label, render?(row) -> node, value?(row) -> string (search/export text) }]
export default function DataTable({
  title,
  columns,
  rows,
  emptyLabel = 'No records found.',
  searchPlaceholder = 'Search...',
  fileName = 'export',
  rowKey = (row, i) => row._id || row.id || i,
}) {
  const [search, setSearch] = useState('');

  const cellText = (col, row) => {
    if (col.value) return col.value(row) ?? '';
    const raw = row[col.key];
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((col) => cellText(col, row).toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, columns]);

  const handleExportCsv = () => {
    const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const body = filteredRows
      .map((row) => columns.map((c) => `"${cellText(c, row).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) return;
    const generatedAt = new Date().toLocaleString('en-IN');
    const head = columns.map((c) => `<th>${c.label}</th>`).join('');
    const body = filteredRows
      .map((row) => `<tr>${columns.map((c) => `<td>${cellText(c, row) || '-'}</td>`).join('')}</tr>`)
      .join('');
    win.document.write(`
      <html>
        <head>
          <title>${title || fileName}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 32px; }
            .doc-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
            .doc-header h1 { font-size: 20px; margin: 0; color: #111827; }
            .doc-header span { font-size: 12px; color: #6b7280; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #111827; color: #fff; text-align: left; padding: 8px 10px; text-transform: uppercase; font-size: 10.5px; letter-spacing: .03em; }
            td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
            tr:nth-child(even) td { background: #f9fafb; }
            .doc-footer { margin-top: 18px; font-size: 11px; color: #9ca3af; text-align: right; }
            @media print { body { padding: 0 24px; } }
          </style>
        </head>
        <body>
          <div class="doc-header">
            <h1>${title || 'Attendance MS Report'}</h1>
            <span>Generated: ${generatedAt}</span>
          </div>
          <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
          <div class="doc-footer">${filteredRows.length} record(s) &middot; Attendance Management System</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="card">
      <div className="table-toolbar">
        {title && <h3 className="card-title table-toolbar-title">{title}</h3>}
        <div className="table-toolbar-actions">
          <div className="table-search-wrap">
            <svg className="table-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              className="table-search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="btn secondary btn-sm" onClick={handleExportCsv} disabled={!rows.length}>
            CSV
          </button>
          <button type="button" className="btn secondary btn-sm" onClick={handleExportPdf} disabled={!rows.length}>
            PDF
          </button>
        </div>
      </div>

      {!rows.length ? (
        <p className="empty-state">{emptyLabel}</p>
      ) : !filteredRows.length ? (
        <p className="empty-state">No records match your search.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={rowKey(row, i)}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(row) : c.value ? c.value(row) : row[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
