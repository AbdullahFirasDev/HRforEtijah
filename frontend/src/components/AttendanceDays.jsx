import { useEffect, useMemo, useState } from 'react';
import TableToolbar from './TableToolbar';
import { downloadCsv, printTable } from '../utils/exportTable';
import {
  attendanceNotes,
  dayState,
  distanceText,
  faceVerifiedOf,
  farthestText,
  isExtended,
  locationText,
  notesText,
  openSessionOf,
  periodsText,
  runningExtraMinutes,
  runningHours,
  sessionsOf,
} from '../utils/attendance';
import { formatClockTime, formatDate, formatDayLong, formatHours, formatMinutes, todayStr } from '../utils/format';

const FACE_MATCH = 'وجه مطابق';
const MINUTE = 60000;
// Shown as the row's state already
const NOT_NOTES = ['missed', 'periods'];

const employeeName = (r) => r.user?.name || 'موظف محذوف';

const groupByDay = (records) => {
  const days = new Map();
  records.forEach((r) => days.set(r.date, [...(days.get(r.date) || []), r]));
  return [...days.entries()];
};

const dayCounts = (records) => {
  const count = (test) => records.filter(test).length;
  const inState = (...keys) => (r) => keys.includes(dayState(r).key);
  return [
    { key: 'all', label: 'الحضور', value: records.length },
    { key: 'working', label: 'في الدوام', value: count(inState('working', 'extended')) },
    { key: 'left', label: 'انصرفوا', value: count(inState('left', 'leave')) },
    { key: 'extra', label: 'وقت إضافي', value: count((r) => r.overtimeMinutes > 0 || dayState(r).key === 'extended') },
    { key: 'auto', label: 'انصراف تلقائي', value: count(inState('auto')) },
  ].filter((c) => c.value > 0);
};

function Period({ session, date, numbered, index }) {
  const out = session.punchOut;
  return (
    <li>
      {numbered && <span className="period-num">{index + 1}</span>}
      <span className="punch">
        <small>حضور</small>
        <b>{formatClockTime(session.punchIn?.time)}</b>
      </span>
      <span className="punch">
        <small>انصراف</small>
        <b>{out?.time ? formatClockTime(out.time) : 'الآن'}</b>
      </span>
      {out?.time && formatDate(out.time) !== date && <span className="badge muted">اليوم التالي</span>}
      {isExtended(session) && <span className="badge warning">ممدد</span>}
      {out?.auto && <span className="badge danger">تلقائي</span>}
    </li>
  );
}

function DayRow({ record, showEmployee, now, selectable, checked, onToggle }) {
  const state = dayState(record);
  const sessions = sessionsOf(record);
  const open = openSessionOf(record);
  const extra = runningExtraMinutes(open, now);
  const notes = attendanceNotes(record).filter((n) => !NOT_NOTES.includes(n.key));
  const distance = distanceText(record.punchIn?.location);
  const farthest = farthestText(record);

  return (
    <li className={`day-row is-${state.key}${selectable ? ' is-selectable' : ''}${checked ? ' is-selected' : ''}`}>
      {selectable && (
        <input
          type="checkbox"
          className="day-row-check"
          checked={checked}
          onChange={onToggle}
          aria-label={`تحديد سجل ${employeeName(record)}`}
        />
      )}
      <div className="day-row-who">
        {showEmployee && <strong>{employeeName(record)}</strong>}
        <span className={`badge ${state.variant}`}>{state.text}</span>
        {distance && <small>{distance}</small>}
        {farthest && <small className="cell-warning">{farthest}</small>}
      </div>
      <ul className="day-periods">
        {sessions.map((s, i) => (
          <Period key={s.punchIn?.time || i} session={s} date={record.date} index={i} numbered={sessions.length > 1} />
        ))}
      </ul>
      <div className="day-row-hours">
        <strong>{formatHours(runningHours(record, now))}</strong>
        <small>{open ? 'حتى الآن' : 'ساعات العمل'}</small>
      </div>
      <div className="notes-cell day-row-notes">
        {extra > 0 && <span className="badge warning">إضافي {formatMinutes(extra)} حتى الآن</span>}
        {notes.map((n) => (
          <span key={n.key} className={`badge ${n.variant}`}>
            {n.text}
          </span>
        ))}
        {faceVerifiedOf(record) && <span className="badge success">{FACE_MATCH}</span>}
      </div>
    </li>
  );
}

// Attendance records split by day: for each person, their check-ins and
// check-outs, and whether they are still at work, on extended time, left, or
// were closed automatically.
// selected/onSelectedChange: optional checkbox per record (ids as strings),
// and one per day for all of that day's records.
export default function AttendanceDays({
  records,
  showEmployee = true,
  exportTitle,
  fileName,
  emptyLabel,
  searchPlaceholder,
  selected = [],
  onSelectedChange,
  hasMore,
  loadingMore,
  onShowMore,
}) {
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const selectable = !!onSelectedChange;
  const anyOpen = records.some((r) => openSessionOf(r));

  useEffect(() => {
    if (!anyOpen) return undefined;
    const id = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(id);
  }, [anyOpen]);

  const columns = useMemo(
    () => [
      { label: 'التاريخ', text: (r) => r.date },
      ...(showEmployee ? [{ label: 'الموظف', text: employeeName }] : []),
      { label: 'الحضور والانصراف', text: periodsText },
      { label: 'الساعات', text: (r) => formatHours(r.totalHours) },
      { label: 'الوقت الإضافي', text: (r) => (r.overtimeMinutes ? formatMinutes(r.overtimeMinutes) : '') },
      { label: 'الوضع', text: (r) => dayState(r).text },
      { label: 'التحقق', text: (r) => (faceVerifiedOf(r) ? FACE_MATCH : '') },
      {
        label: 'الموقع',
        text: (r) => [locationText(r.punchIn?.location), farthestText(r)].filter(Boolean).join(' · '),
      },
      { label: 'ملاحظات', text: notesText },
    ],
    [showEmployee]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => columns.some((c) => String(c.text(r) ?? '').toLowerCase().includes(q)));
  }, [records, search, columns]);

  const exportData = () => ({
    headers: columns.map((c) => c.label),
    lines: shown.map((r) => columns.map((c) => String(c.text(r) ?? ''))),
  });

  const toggle = (ids, on) =>
    onSelectedChange(on ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)));

  return (
    <>
      <div className="card day-toolbar">
        <TableToolbar
          count={shown.length}
          search={search}
          onSearch={setSearch}
          placeholder={searchPlaceholder}
          onCsv={() => downloadCsv({ fileName, ...exportData() })}
          onPdf={() => printTable({ title: exportTitle, ...exportData() })}
          disabled={!records.length}
        />
        {!records.length && <p className="empty-state">{emptyLabel}</p>}
        {records.length > 0 && !shown.length && <p className="empty-state">لا توجد نتائج مطابقة لبحثك.</p>}
      </div>

      {groupByDay(shown).map(([date, dayRecords]) => {
        const ids = dayRecords.map((r) => String(r._id));
        const allChecked = ids.every((id) => selected.includes(id));
        return (
          <section key={date} className="day-group" aria-label={formatDayLong(date)}>
            <header className="day-head">
              {selectable && (
                <input
                  type="checkbox"
                  className="day-row-check"
                  checked={allChecked}
                  onChange={() => toggle(ids, !allChecked)}
                  aria-label={`تحديد كل سجلات ${formatDayLong(date)}`}
                />
              )}
              <h3 className="day-title">{formatDayLong(date)}</h3>
              {date === todayStr() && <span className="badge info">اليوم</span>}
              {showEmployee && (
                <ul className="day-counts">
                  {dayCounts(dayRecords).map((c) => (
                    <li key={c.key}>
                      {c.label} <b>{c.value}</b>
                    </li>
                  ))}
                </ul>
              )}
            </header>
            <ul className="day-rows">
              {dayRecords.map((r) => (
                <DayRow
                  key={r._id}
                  record={r}
                  showEmployee={showEmployee}
                  now={now}
                  selectable={selectable}
                  checked={selected.includes(String(r._id))}
                  onToggle={() => toggle([String(r._id)], !selected.includes(String(r._id)))}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {hasMore && !search.trim() && (
        <div className="day-more">
          <button type="button" className="btn secondary" disabled={loadingMore} onClick={onShowMore}>
            {loadingMore ? 'جارٍ التحميل...' : 'عرض أيام أقدم'}
          </button>
        </div>
      )}
    </>
  );
}
