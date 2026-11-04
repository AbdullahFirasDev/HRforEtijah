import { useMemo, useState } from 'react';
import TableToolbar from './TableToolbar';
import { downloadCsv, printTable } from '../utils/exportTable';

// Generic table with a global search box, CSV export, and print/PDF export.
// On phones each row turns into a card, labelled from the column headers.
// columns: [{ key, label, render?(row) -> node, value?(row) -> string (search/export text),
//             wrap?: true for long free text that may break onto several lines }]
// selected/onSelectedChange: optional checkbox per row (row keys as strings),
// with a header box for every row the search currently shows.
export default function DataTable({
  title,
  exportTitle,
  columns,
  rows,
  emptyLabel = 'لا توجد سجلات.',
  searchPlaceholder = 'بحث...',
  fileName = 'export',
  rowKey = (row, i) => row._id || row.id || i,
  selected = [],
  onSelectedChange,
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

  const selectable = !!onSelectedChange;
  const keyOf = (row, i) => String(rowKey(row, i));
  const shownKeys = filteredRows.map(keyOf);
  const allShownSelected = shownKeys.length > 0 && shownKeys.every((k) => selected.includes(k));
  const toggleAllShown = () =>
    onSelectedChange(
      allShownSelected ? selected.filter((k) => !shownKeys.includes(k)) : [...new Set([...selected, ...shownKeys])]
    );
  const toggleRow = (key) =>
    onSelectedChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  const exportData = () => ({
    headers: columns.map((c) => c.label),
    lines: filteredRows.map((row) => columns.map((c) => cellText(c, row))),
  });

  return (
    <div className="card">
      <TableToolbar
        title={title}
        count={filteredRows.length}
        search={search}
        onSearch={setSearch}
        placeholder={searchPlaceholder}
        onCsv={() => downloadCsv({ fileName, ...exportData() })}
        onPdf={() => printTable({ title: exportTitle || title, ...exportData() })}
        disabled={!rows.length}
      />

      {!rows.length ? (
        <p className="empty-state">{emptyLabel}</p>
      ) : !filteredRows.length ? (
        <p className="empty-state">لا توجد نتائج مطابقة لبحثك.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {selectable && (
                  <th className="cell-select">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={toggleAllShown}
                      aria-label="تحديد كل السجلات الظاهرة"
                      title="تحديد كل السجلات الظاهرة"
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={rowKey(row, i)} className={selectable && selected.includes(keyOf(row, i)) ? 'row-selected' : undefined}>
                  {selectable && (
                    <td className="cell-select" data-label="تحديد">
                      <input
                        type="checkbox"
                        checked={selected.includes(keyOf(row, i))}
                        onChange={() => toggleRow(keyOf(row, i))}
                        aria-label="تحديد السجل"
                      />
                    </td>
                  )}
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
