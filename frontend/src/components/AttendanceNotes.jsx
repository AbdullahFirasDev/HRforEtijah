import { attendanceNotes } from '../utils/attendance';

// Badges for lateness, early leave, work on a day off and several periods
export default function AttendanceNotes({ record, empty = '-' }) {
  const notes = attendanceNotes(record);
  if (!notes.length) return empty;
  return (
    <span className="notes-cell">
      {notes.map((n) => (
        <span key={n.key} className={`badge ${n.variant}`}>
          {n.text}
        </span>
      ))}
    </span>
  );
}
