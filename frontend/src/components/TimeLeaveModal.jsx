import { useState } from 'react';
import Field from './Field';
import Alert from './Alert';
import StatusBadge from './StatusBadge';
import {
  useGrantTimeLeaveMutation,
  useRevokeTimeLeaveMutation,
  useUpdateTimeLeaveMutation,
} from '../features/api/timeLeaveApi';
import { formatClock, formatDateLong, formatDateTime, formatMinutes, todayStr } from '../utils/format';
import { LEAVE_TYPES, leaveTypeLabel, toMinutes } from '../utils/timeLeave';
import { shiftsText } from '../utils/workSchedule';

// Unexcused time on the day (from the monthly sheet) and the kind of time
// leave that would cover it
const UNCOVERED = {
  late: { label: 'تأخير', type: 'start' },
  early: { label: 'انصراف مبكر', type: 'end' },
  gap: { label: 'خروج أثناء الدوام', type: 'during' },
  missed: { label: 'فترة دوام لم يحضرها', type: 'during' },
};

const MIN_MINUTES = 5;
const EMPTY = { type: 'during', from: '', to: '', reason: '', leaveReason: '' };
const formOf = (leave) => ({ type: leave.type, from: leave.from, to: leave.to, reason: '', leaveReason: leave.reason || '' });

// Manager/admin window to add an approved time leave (زمنية) for an employee
// on any day, past days included, or to correct or withdraw one. Opened from
// a day of the monthly sheet (employee and date fixed, with the day's
// unexcused time offered as one-click suggestions) or from the time leaves
// page (`employees` to pick from, or `editing` an existing leave).
export default function TimeLeaveModal({
  employee,
  employees,
  date: fixedDate,
  shifts = [],
  leaves = [],
  uncovered = [],
  editing: initialEditing = null,
  onClose,
  onSaved,
}) {
  const [grant, { isLoading: granting }] = useGrantTimeLeaveMutation();
  const [update, { isLoading: updating }] = useUpdateTimeLeaveMutation();
  const [revoke, { isLoading: revoking }] = useRevokeTimeLeaveMutation();
  const busy = granting || updating || revoking;

  const [userId, setUserId] = useState(employee?.id || '');
  const [date, setDate] = useState(fixedDate || initialEditing?.date || todayStr());
  const [editing, setEditing] = useState(initialEditing);
  const [form, setForm] = useState(() => (initialEditing ? formOf(initialEditing) : EMPTY));
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const name = employee?.name || employees?.find((e) => e.id === userId)?.name || 'الموظف';
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };
  const length = form.from && form.to ? toMinutes(form.to) - toMinutes(form.from) : 0;

  const startEdit = (leave) => {
    setEditing(leave);
    setForm(formOf(leave));
    setDate(leave.date || fixedDate || date);
    setErrors({});
    setError('');
  };
  const applySuggestion = (u) => {
    setEditing(null);
    setForm((f) => ({ ...f, type: UNCOVERED[u.kind]?.type || 'during', from: u.from, to: u.to }));
    setErrors({});
  };

  const validate = () => {
    const found = {};
    if (!editing && !userId) found.userId = 'اختر الموظف';
    if (!date) found.date = 'اختر اليوم';
    if (editing && form.leaveReason.trim().length < 3) found.leaveReason = 'اكتب سبب الزمنية';
    if (!form.from) found.from = 'حدّد وقت البداية';
    if (!form.to) found.to = 'حدّد وقت النهاية';
    else if (form.from && length <= 0) found.to = 'وقت النهاية يجب أن يكون بعد وقت البداية';
    else if (form.from && length < MIN_MINUTES) found.to = `أقل مدة ${MIN_MINUTES} دقائق`;
    if (form.reason.trim().length < 3) found.reason = editing ? 'اكتب سبب التعديل' : 'اكتب سبب الزمنية';
    setErrors(found);
    return !Object.keys(found).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    const body = { type: form.type, from: form.from, to: form.to, reason: form.reason.trim() };
    try {
      if (editing) {
        await update({ id: editing.id || editing._id, ...body, date, leaveReason: form.leaveReason.trim() }).unwrap();
        onSaved(`تم تعديل زمنية ${editing.user?.name || name}: يوم ${date} من ${form.from} إلى ${form.to}، وأُعيد حساب اليوم.`);
      } else {
        await grant({ userId, date, ...body }).unwrap();
        onSaved(`أُضيفت زمنية ${formatMinutes(length)} لـ ${name} يوم ${date} وأُعيد حساب اليوم.`);
      }
    } catch (err) {
      setError(err?.data?.message || 'تعذر حفظ الزمنية. حاول مرة أخرى.');
    }
  };

  const withdraw = async (leave) => {
    setError('');
    try {
      await revoke({ id: leave.id || leave._id }).unwrap();
      onSaved(`أُلغيت زمنية ${name} (${leave.from}–${leave.to}) وأُعيد حساب اليوم.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر إلغاء الزمنية. حاول مرة أخرى.');
    }
  };

  const active = leaves.filter((l) => ['Approved', 'Pending'].includes(l.status));
  const shownDate = date;

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide" role="dialog" aria-modal="true" aria-labelledby="time-leave-title">
        <h2 id="time-leave-title" className="card-title">
          {editing ? 'تعديل زمنية' : 'إضافة زمنية لموظف'}
        </h2>
        {(employee || editing || fixedDate) && (
          <div className="manage-meta">
            <strong>{editing?.user?.name || name}</strong>
            {shownDate && <span>{formatDateLong(shownDate)}</span>}
            {shifts.length > 0 && <span className="badge info">الدوام: {shiftsText(shifts)}</span>}
          </div>
        )}

        {!editing && uncovered.length > 0 && (
          <section className="manage-section">
            <h3>وقت غير مبرر في هذا اليوم</h3>
            <p className="form-note">اختر وقتاً لاحتسابه زمنية بدلاً من تأخير أو انصراف مبكر:</p>
            <div className="leave-suggestions">
              {uncovered.map((u) => (
                <button key={`${u.kind}${u.from}`} type="button" className="btn secondary btn-sm" onClick={() => applySuggestion(u)}>
                  {UNCOVERED[u.kind]?.label || u.kind}: <span dir="ltr">{u.from}–{u.to}</span> ({formatMinutes(u.minutes)})
                </button>
              ))}
            </div>
          </section>
        )}

        {!editing && active.length > 0 && (
          <section className="manage-section">
            <h3>زمنيات هذا اليوم</h3>
            <ul className="day-leaves">
              {active.map((l) => (
                <li key={l.id}>
                  <span className="cell-stack">
                    <strong>
                      {leaveTypeLabel(l.type)} · {formatClock(l.from)} – {formatClock(l.to)} ({formatMinutes(l.minutes)})
                    </strong>
                    <small>
                      {l.reason}
                      {l.added ? ' · أضافتها الإدارة' : ''}
                      {l.edited ? ' · معدّلة' : ''}
                    </small>
                  </span>
                  <StatusBadge status={l.status} />
                  <span className="row-actions">
                    <button type="button" className="btn secondary btn-sm" disabled={busy} onClick={() => startEdit(l)}>
                      تعديل
                    </button>
                    {confirmRevoke === l.id ? (
                      <button type="button" className="btn danger btn-sm" disabled={busy} onClick={() => withdraw(l)}>
                        تأكيد الإلغاء
                      </button>
                    ) : (
                      <button type="button" className="btn secondary btn-sm" disabled={busy} onClick={() => setConfirmRevoke(l.id)}>
                        إلغاء
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <form onSubmit={submit} noValidate>
          {!editing && employees && !employee && (
            <Field id="tl-user" label="الموظف" required error={errors.userId}>
              <select id="tl-user" value={userId} onChange={(e) => setUserId(e.target.value)} aria-invalid={!!errors.userId}>
                <option value="">اختر الموظف...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {(editing || !fixedDate) && (
            <Field
              id="tl-date"
              label="اليوم"
              required
              error={errors.date}
              hint={editing ? 'غيّره لنقل الزمنية إلى يوم آخر' : 'يمكن اختيار يوم مضى'}
            >
              <input
                id="tl-date"
                type="date"
                dir="ltr"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setErrors({});
                }}
              />
            </Field>
          )}
          <Field id="tl-type" label="نوع الزمنية" hint={LEAVE_TYPES[form.type]?.hint}>
            <select id="tl-type" value={form.type} onChange={(e) => set({ type: e.target.value })}>
              {Object.entries(LEAVE_TYPES).map(([value, t]) => (
                <option key={value} value={value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-2">
            <Field id="tl-from" label="من الساعة" required error={errors.from}>
              <input id="tl-from" type="time" dir="ltr" value={form.from} onChange={(e) => set({ from: e.target.value })} />
            </Field>
            <Field id="tl-to" label="إلى الساعة" required error={errors.to}>
              <input id="tl-to" type="time" dir="ltr" value={form.to} onChange={(e) => set({ to: e.target.value })} />
            </Field>
          </div>
          {length > 0 && <p className="week-total">مدة الزمنية: {formatMinutes(length)}</p>}
          {editing && (
            <Field id="tl-leave-reason" label="سبب الزمنية" required error={errors.leaveReason}>
              <input
                id="tl-leave-reason"
                maxLength={300}
                value={form.leaveReason}
                onChange={(e) => set({ leaveReason: e.target.value })}
                aria-invalid={!!errors.leaveReason}
              />
            </Field>
          )}
          <Field
            id="tl-reason"
            label={editing ? 'سبب التعديل' : 'السبب'}
            required
            error={errors.reason}
            hint={editing ? 'مثال: الموظف استأذن ساعتين لا ساعة واحدة' : 'مثال: استأذن شفهياً ولم يقدّم الطلب في التطبيق'}
          >
            <input
              id="tl-reason"
              maxLength={300}
              value={form.reason}
              onChange={(e) => set({ reason: e.target.value })}
              aria-invalid={!!errors.reason}
            />
          </Field>
          <Alert type="info">
            {editing
              ? 'يُحفظ التعديل باسمك مع سببه، ويُعاد حساب اليوم إن كانت الزمنية مقبولة.'
              : 'الزمنية المضافة تُعتمد مباشرة: أي تأخير أو انصراف مبكر أو خروج داخل وقتها لا يُحسب على الموظف، ويُعاد حساب اليوم فوراً ويصل الموظف إشعار.'}
          </Alert>
          <Alert type="error">{error}</Alert>
          {editing?.edits?.length > 0 && (
            <section className="manage-section">
              <h3>سجل التعديلات</h3>
              <ul className="edit-history">
                {editing.edits.map((e, i) => (
                  <li key={i}>
                    <strong>{e.by?.name || 'مستخدم محذوف'}</strong> · {formatDateTime(e.at)}
                    <small>
                      {e.reason} — كانت:{' '}
                      <span dir="ltr">
                        {e.before?.date ? `${e.before.date} ` : ''}
                        {e.before?.from}–{e.before?.to}
                      </span>{' '}
                      ({leaveTypeLabel(e.before?.type)})
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>
              {granting || updating ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديل' : 'إضافة الزمنية'}
            </button>
            {editing && !initialEditing && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY);
                  setDate(fixedDate || todayStr());
                }}
              >
                رجوع
              </button>
            )}
            {editing &&
              (confirmRevoke === 'editing' ? (
                <button type="button" className="btn danger" disabled={busy} onClick={() => withdraw(editing)}>
                  {revoking ? 'جارٍ الإلغاء...' : 'تأكيد إلغاء الزمنية'}
                </button>
              ) : (
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirmRevoke('editing')}>
                  إلغاء الزمنية
                </button>
              ))}
            <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>
              إغلاق
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
