import Alert from './Alert';
import { formatHours, todayStr } from '../utils/format';

const MAX_LISTED = 5;

// Confirms the permanent deletion of one or more attendance records (admin)
export default function DeleteAttendanceModal({ records, deleting, error, onConfirm, onCancel }) {
  const one = records.length === 1;
  const withOvertime = records.filter((r) => r.overtimeRequested).length;
  const includesToday = records.some((r) => r.date === todayStr());

  return (
    <div className="modal-overlay">
      <div
        className="modal-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-attendance-title"
        aria-describedby="delete-attendance-desc"
      >
        <h2 id="delete-attendance-title" className="card-title">
          {one ? 'حذف سجل حضور' : `حذف ${records.length} من سجلات الحضور`}
        </h2>
        <ul className="delete-list">
          {records.slice(0, MAX_LISTED).map((r) => (
            <li key={r._id}>
              <strong>{r.user?.name || 'موظف محذوف'}</strong> — <span dir="ltr">{r.date}</span> · {formatHours(r.totalHours)}
            </li>
          ))}
          {records.length > MAX_LISTED && <li>و{records.length - MAX_LISTED} سجلات أخرى</li>}
        </ul>
        <Alert type="error" title="لا يمكن التراجع عن الحذف">
          <span id="delete-attendance-desc">
            {one ? 'سيُحذف السجل نهائياً مع صوره ومواقعه' : 'ستُحذف السجلات نهائياً مع صورها ومواقعها'}
            {withOvertime > 0 &&
              (withOvertime === 1 ? '، ومعه طلب العمل الإضافي المرتبط به' : `، ومعها ${withOvertime} من طلبات العمل الإضافي المرتبطة بها`)}
            .{includesToday && ' وبعد حذف سجل اليوم يستطيع الموظف تسجيل حضوره من جديد.'}
          </span>
        </Alert>
        <Alert type="error">{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn danger" disabled={deleting} onClick={onConfirm}>
            {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف نهائياً'}
          </button>
          <button type="button" className="btn secondary" disabled={deleting} onClick={onCancel}>
            تراجع
          </button>
        </div>
      </div>
    </div>
  );
}
