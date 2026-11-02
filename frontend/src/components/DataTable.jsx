import { useMemo, useState } from 'react';
import { formatDateTime } from '../utils/format';

// Cell text goes into a same-origin print window, so it must not be parsed as HTML.
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

// Generic table with a global search box, CSV export, and print/PDF export.
// On phones each row turns into a card, labelled from the column headers.
// columns: [{ key, label, render?(row) -> node, value?(row) -> string (search/export text),
//             wrap?: true for long free text that may break onto several lines }]
export default function DataTable({
  title,
  exportTitle,
  columns,
  rows,
  emptyLabel = 'لا توجد سجلات.',
  searchPlaceholder = 'بحث...',
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
    // The BOM makes Excel read the file as UTF-8, so Arabic text isn't garbled.
    const blob = new Blob(['﻿', `${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
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
    const docTitle = escapeHtml(exportTitle || title || 'تقرير الاتجاه');
    const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const body = filteredRows
      .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(cellText(c, row) || '-')}</td>`).join('')}</tr>`)
      .join('');
    win.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" />
          <style>
            * { box-sizing: border-box; }
            body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; color: #2b2118; padding: 32px; }
            .doc-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 4px solid #2b2118; padding-bottom: 12px; margin-bottom: 20px; }
            .doc-header h1 { font-size: 20px; margin: 0; }
            .doc-header span { font-size: 12px; color: #6f6253; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #2b2118; color: #fffaf0; text-align: right; padding: 8px 10px; font-size: 11.5px; }
            td { padding: 7px 10px; border-bottom: 1px solid #d9c9a7; }
            tr:nth-child(even) td { background: #faf3e3; }
            .doc-footer { margin-top: 18px; font-size: 11px; color: #6f6253; text-align: left; }
            @media print { body { padding: 0 24px; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="doc-header">
            <h1>${docTitle}</h1>
            <span>تاريخ الإنشاء: ${formatDateTime(new Date())}</span>
          </div>
          <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
          <div class="doc-footer">عدد السجلات: ${filteredRows.length} &middot; نظام الاتجاه للحضور</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    // Give the Cairo font a moment to load so the printout isn't in a fallback font.
    setTimeout(() => (win.document.fonts ? win.document.fonts.ready : Promise.resolve()).then(() => win.print()), 400);
  };

  return (
    <div className="card">
      <div className="table-toolbar">
        <div className="table-toolbar-info">
          {title && <h3 className="table-toolbar-title">{title}</h3>}
          <span className="table-count">عدد السجلات: {filteredRows.length}</span>
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
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={handleExportCsv}
            disabled={!rows.length}
            title="تصدير ملف CSV يفتح في Excel"
          >
            تصدير CSV
          </button>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={handleExportPdf}
            disabled={!rows.length}
            title="طباعة الجدول أو حفظه PDF"
          >
            طباعة PDF
          </button>
        </div>
      </div>

      {!rows.length ? (
        <p className="empty-state">{emptyLabel}</p>
      ) : !filteredRows.length ? (
        <p className="empty-state">لا توجد نتائج مطابقة لبحثك.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
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
                    <td key={c.key} data-label={c.label} className={c.wrap ? 'cell-wrap' : undefined}>
                      {c.render ? c.render(row) : c.value ? c.value(row) : row[c.key]}
                    </td>
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
