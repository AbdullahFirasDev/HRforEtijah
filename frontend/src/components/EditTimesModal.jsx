import { useEffect, useState } from 'react';
import Field from './Field';
import Alert from './Alert';
import Loading from './Loading';
import {
  useAddManualAttendanceMutation,
  useEditAttendancePeriodsMutation,
  useGetAttendanceRecordQuery,
} from '../features/api/attendanceApi';
import { formatDateLong, formatDateTime, formatHours, todayStr } from '../utils/format';
import { clockHours, MAX_SESSIONS_PER_DAY, shiftsText } from '../utils/workSchedule';
import { hasErrors, validatePeriods } from '../utils/validation';

const periodsText = (list) => list.map((p) => `${p.in}–${p.out || '…'}`).join('، ') || '-';

// Admin window to correct one day's check-in/check-out times (recordId), or
// to record a day the employee never checked in (userId + date). Times are
// office wall-clock times; every save is logged with the admin's reason.
export default function EditTimesModal({ recordId, userId, userName, date, shifts = [], onClose, onSaved }) {
  const isNew = !recordId;
  const { data, isLoading, isError } = useGetAttendanceRecordQuery(recordId, { skip: isNew });
  const [editPeriods, { isLoading: saving }] = useEditAttendancePeriodsMutation();
  const [addManual, { isLoading: adding }] = useAddManualAttendanceMutation();
  const record = data?.attendance;

  const [periods, setPeriods] = useState(() =>
    isNew ? (shifts.length ? shifts.map((s) => ({ in: s.start, out: s.end })) : [{ in: '', out: '' }]) : null
  );
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (record && !periods) {
      setPeriods(record.periods.map((p) => ({ index: p.index, in: p.in, out: p.out || '', auto: p.auto, manual: p.manual })));
    }
  }, [record, periods]);

  const isToday = date === todayStr();
  const name = record?.user?.name || userName;
  const planText = record
    ? record.dayOff
      ? 'يوم إجازة'
      : shiftsText(record.shifts) || 'دوام مرن'
    : shiftsText(shifts) || 'دوام مرن أو يوم إجازة';

  const setPeriod = (i, patch) => {
    setPeriods((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    setErrors((prev) => ({ ...prev, [`p${i}`]: undefined }));
  };
  const total = (periods || []).reduce((sum, p) => sum + (p.in && p.out && p.out > p.in ? clockHours(p.in, p.out) : 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validatePeriods({ periods, reason, isToday });
    setErrors(found);
    if (hasErrors(found)) return;
    const payload = periods.map((p) => ({ index: p.index ?? null, in: p.in, out: p.out || null }));
    try {
      if (isNew) await addManual({ userId, date, periods: payload, reason: reason.trim() }).unwrap();
      else await editPeriods({ id: recordId, periods: payload, reason: reason.trim() }).unwrap();
      onSaved(isNew ? `تم تسجيل حضور ${name} يوم ${date}.` : `تم تعديل أوقات ${name} يوم ${date}.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر حفظ التعديل. حاول مرة أخرى.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide" role="dialog" aria-modal="true" aria-labelledby="edit-times-title">
        <h2 id="edit-times-title" className="card-title">
          {isNew ? 'إضافة حضور يدوي' : 'تعديل أوقات الحضور والانصراف'}
        </h2>
        <div className="manage-meta">
          <strong>{name}</strong>
          <span>{formatDateLong(date)}</span>
          <span className="badge info">الدوام المحدد: {planText}</span>
        </div>

        {isError ? (
          <Alert type="error">تعذر تحميل السجل. أغلق النافذة وحاول مرة أخرى.</Alert>
        ) : isLoading || !periods ? (
          <Loading />
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="edit-periods">
              <div className="edit-period edit-period-head" aria-hidden="true">
                <span />
                <span>الحضور</span>
                <span>الانصراف</span>
                <span />
              </div>
              {periods.map((p, i) => (
                <div key={i} className="edit-period-block">
                  <div className="edit-period">
                    <span className="session-num">{i + 1}</span>
                    <input
                      id={`edit-in-${i}`}
                      type="time"
                      dir="ltr"
                      value={p.in}
                      onChange={(e) => setPeriod(i, { in: e.target.value })}
                      aria-label={`وقت حضور الفترة ${i + 1}`}
                      aria-invalid={!!errors[`p${i}`]}
                    />
                    <input
                      id={`edit-out-${i}`}
                      type="time"
                      dir="ltr"
                      value={p.out}
                      onChange={(e) => setPeriod(i, { out: e.target.value, auto: false })}
                      aria-label={`وقت انصراف الفترة ${i + 1}`}
                      aria-invalid={!!errors[`p${i}`]}
                    />
                    {periods.length > 1 ? (
                      <button
                        type="button"
                        className="period-remove"
                        onClick={() => {
                          setPeriods((list) => list.filter((_, j) => j !== i));
                          setErrors({});
                        }}
                        aria-label={`حذف الفترة ${i + 1}`}
                        title="حذف الفترة"
                      >
                        ×
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                  {(p.auto || p.manual || errors[`p${i}`]) && (
                    <div className="edit-period-notes">
                      {p.auto && <span className="badge danger">أُغلقت تلقائياً: لم يسجّل الانصراف</span>}
                      {p.manual && <span className="badge muted">معدّلة سابقاً</span>}
                      {errors[`p${i}`] && <p className="field-error">{errors[`p${i}`]}</p>}
                    </div>
                  )}
                </div>
              ))}
              {periods.length < MAX_SESSIONS_PER_DAY && (
                <button type="button" className="period-add" onClick={() => setPeriods((list) => [...list, { in: '', out: '' }])}>
                  + إضافة فترة
                </button>
              )}
            </div>
            <p className="week-total">مجموع الساعات بعد التعديل: {formatHours(Math.round(total * 100) / 100)}</p>
            {isToday && <p className="form-note">اترك انصراف آخر فترة فارغاً إن كان الموظف ما زال يعمل الآن.</p>}

            <Field id="edit-reason" label="سبب التعديل" required error={errors.reason} hint="مثال: نسي تسجيل الانصراف وغادر الساعة 6:30 م">
              <input
                id="edit-reason"
                maxLength={300}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErrors((prev) => ({ ...prev, reason: undefined }));
                }}
                aria-invalid={!!errors.reason}
              />
            </Field>
            <Alert type="info">
              يُعاد حساب الساعات والتأخير والانصراف المبكر والعمل الإضافي، ويُحفظ التعديل باسمك مع سببه. صور الحضور
              السابقة تبقى كما هي.
            </Alert>
            <Alert type="error">{error}</Alert>

            {record?.edits?.length > 0 && (
              <section className="manage-section">
                <h3>سجل التعديلات</h3>
                <ul className="edit-history">
                  {record.edits.map((e, i) => (
                    <li key={i}>
                      <strong>{e.by || 'مستخدم محذوف'}</strong> · {formatDateTime(e.at)}
                      <small>
                        {e.reason} — <span dir="ltr">{periodsText(e.before)}</span> ← <span dir="ltr">{periodsText(e.after)}</span>
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="form-actions">
              <button type="submit" className="btn" disabled={saving || adding}>
                {saving || adding ? 'جارٍ الحفظ...' : isNew ? 'إضافة الحضور' : 'حفظ التعديل'}
              </button>
              <button type="button" className="btn secondary" disabled={saving || adding} onClick={onClose}>
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
