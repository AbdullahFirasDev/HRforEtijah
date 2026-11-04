import { formatDateTime } from './format';

// Cell text goes into a same-origin print window, so it must not be parsed as HTML.
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

const csvCell = (text) => `"${String(text).replace(/"/g, '""')}"`;

// headers: column titles; lines: one array of cell texts per row
export const downloadCsv = ({ fileName, headers, lines }) => {
  const text = [headers, ...lines].map((line) => line.map(csvCell).join(',')).join('\n');
  // The BOM makes Excel read the file as UTF-8, so Arabic text isn't garbled.
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const printTable = ({ title, headers, lines }) => {
  const win = window.open('', '_blank', 'width=1000,height=700');
  if (!win) return;
  const docTitle = escapeHtml(title || 'تقرير الاتجاه');
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = lines
    .map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell || '-')}</td>`).join('')}</tr>`)
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
          .doc-brand { display: flex; align-items: center; gap: 12px; }
          .doc-brand img { width: 52px; height: 52px; }
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
          <div class="doc-brand">
            <img src="${window.location.origin}/logo-mark.png" alt="" />
            <div>
              <h1>${docTitle}</h1>
              <span>الاتجاه للسفر والسياحة</span>
            </div>
          </div>
          <span>تاريخ الإنشاء: ${formatDateTime(new Date())}</span>
        </div>
        <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        <div class="doc-footer">عدد السجلات: ${lines.length} &middot; الاتجاه للسفر والسياحة</div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  // Give the Cairo font a moment to load so the printout isn't in a fallback font.
  setTimeout(() => (win.document.fonts ? win.document.fonts.ready : Promise.resolve()).then(() => win.print()), 400);
};
