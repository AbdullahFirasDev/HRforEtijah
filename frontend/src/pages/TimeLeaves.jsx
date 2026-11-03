import { useMemo, useState } from 'react';
import { useCancelTimeLeaveMutation, useGetMyTimeLeavesQuery, useRequestTimeLeaveMutation } from '../features/api/timeLeaveApi';
import { useGetTodayStatusQuery } from '../features/api/attendanceApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import { formatDateLong, formatMinutes, todayStr } from '../utils/format';
import { statusLabel } from '../utils/labels';
import { shiftsText } from '../utils/workSchedule';
import {
  LEAVE_TYPES,
  MAX_LEAVE_MINUTES,
  MIN_LEAVE_MINUTES,
  fromMinutes,
  leaveTimeText,
  leaveTypeLabel,
  leaveUseText,
  nowMinutes,
  toMinutes,
} from '../utils/timeLeave';

const DURATIONS = [
  { minutes: 60, label: 'ساعة' },
  { minutes: 120, label: 'ساعتان' },
  { minutes: 180, label: '3 ساعات' },
];

// Suggested times for a type on a date: from the day's work periods if it
// has fixed hours, otherwise around the next quarter hour
const suggest = (type, date, week) => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const shifts = week?.find((d) => d.day === weekday)?.shifts || [];
  const first = shifts[0];
  const last = shifts[shifts.length - 1];
  if (type === 'end' && last) return { from: fromMinutes(toMinutes(last.end) - 60), to: last.end };
  if (type === 'start' && first) return { from: first.start, to: fromMinutes(toMinutes(first.start) + 60) };
  const next = date === todayStr() ? Math.ceil((nowMinutes() + 5) / 15) * 15 : first ? toMinutes(first.start) + 120 : 10 * 60;
  return { from: fromMinutes(next), to: fromMinutes(next + 60) };
};

const validate = ({ date, from, to, reason }) => {
  const length = from && to ? toMinutes(to) - toMinutes(from) : 0;
  let timeError;
  if (!from || !to) timeError = 'حدّد وقتي بداية الزمنية ونهايتها';
  else if (length <= 0) timeError = 'وقت النهاية يجب أن يكون بعد وقت البداية';
  else if (length < MIN_LEAVE_MINUTES) timeError = `أقل مدة للزمنية ${MIN_LEAVE_MINUTES} دقيقة`;
  else if (length > MAX_LEAVE_MINUTES) timeError = `أطول مدة للزمنية ${formatMinutes(MAX_LEAVE_MINUTES)}`;
  return {
    date: !date ? 'اختر التاريخ' : date < todayStr() ? 'لا يمكن طلب زمنية ليوم مضى' : undefined,
    time: timeError,
    reason: String(reason).trim().length >= 3 ? undefined : 'اكتب سبب الزمنية',
  };
};

// Employees ask for a time leave and follow their requests. Leaving and
// coming back are confirmed from the check-in page.
export default function TimeLeaves() {
  const { data, isLoading } = useGetMyTimeLeavesQuery();
  const { data: todayData } = useGetTodayStatusQuery();
  const [requestLeave, { isLoading: sending }] = useRequestTimeLeaveMutation();
  const [cancelLeave, { isLoading: cancelling }] = useCancelTimeLeaveMutation();
  const week = todayData?.today?.week;

  const [form, setForm] = useState(() => ({ type: 'during', date: todayStr(), ...suggest('during', todayStr()), reason: '' }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const leaves = useMemo(() => data?.leaves || [], [data]);
  const month = todayStr().slice(0, 7);
  const usedThisMonth = leaves
    .filter((l) => l.status === 'Approved' && l.date.startsWith(month))
    .reduce((sum, l) => sum + l.minutes, 0);
  const pending = leaves.filter((l) => l.status === 'Pending').length;

  const weekday = new Date(`${form.date || todayStr()}T00:00:00Z`).getUTCDay();
  const dayPlan = week?.find((d) => d.day === weekday);
  const length = form.from && form.to ? toMinutes(form.to) - toMinutes(form.from) : 0;

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setSuccess('');
  };
  const setType = (type) => update({ type, ...suggest(type, form.date, week) });
  const setDuration = (minutes) =>
    form.type === 'end' ? update({ from: fromMinutes(toMinutes(form.to) - minutes) }) : update({ to: fromMinutes(toMinutes(form.from) + minutes) });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validate(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    try {
      await requestLeave({ ...form, reason: form.reason.trim() }).unwrap();
      setSuccess(`أُرسل طلب الزمنية (${leaveTypeLabel(form.type)}) يوم ${formatDateLong(form.date)} إلى مديرك. ستظهر موافقته هنا وفي صفحة تسجيل الحضور.`);
      setForm((f) => ({ ...f, reason: '' }));
    } catch (err) {
      setError(err?.data?.message || 'تعذر إرسال الطلب. حاول مرة أخرى.');
    }
  };

  const cancel = async (l) => {
    setError('');
    setSuccess('');
    try {
      await cancelLeave(l._id).unwrap();
      setSuccess(`أُلغيت زمنية يوم ${l.date}.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر إلغاء الزمنية.');
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', value: (l) => l.date },
    {
      key: 'leave',
      label: 'الزمنية',
      value: (l) => `${leaveTypeLabel(l.type)} ${leaveTimeText(l)}`,
      render: (l) => (
        <span className="cell-stack">
          <strong>{leaveTypeLabel(l.type)}</strong>
          <small>{leaveTimeText(l)}</small>
        </span>
      ),
    },
    { key: 'reason', label: 'السبب', value: (l) => l.reason, wrap: true },
    {
      key: 'status',
      label: 'الحالة',
      value: (l) => statusLabel(l.status) + (l.reviewRemarks ? ` — ${l.reviewRemarks}` : ''),
      render: (l) => (
        <span className="cell-stack">
          <StatusBadge status={l.status} />
          {l.reviewRemarks && <small>{l.reviewRemarks}</small>}
        </span>
      ),
    },
    { key: 'use', label: 'الاستخدام', value: leaveUseText },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (l) =>
        ['Pending', 'Approved'].includes(l.status) && !l.departedAt && l.date >= todayStr() ? (
          <button type="button" className="btn secondary btn-sm" disabled={cancelling} onClick={() => cancel(l)}>
            إلغاء
          </button>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الزمنيات"
        subtitle="اطلب إذناً بالخروج لساعة أو أكثر أثناء الدوام، أو بالانصراف المبكر، أو بالتأخر عن بداية الدوام. بعد موافقة مديرك أكّد خروجك وعودتك من صفحة تسجيل الحضور."
      />

      <div className="grid grid-3">
        <div className="stat-box">
          <div className="value">{formatMinutes(usedThisMonth)}</div>
          <div className="label">الزمنيات المعتمدة هذا الشهر</div>
        </div>
        <div className="stat-box">
          <div className="value">{pending}</div>
          <div className="label">طلبات قيد الانتظار</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatMinutes(MAX_LEAVE_MINUTES)}</div>
          <div className="label">أطول زمنية في الطلب الواحد</div>
        </div>
      </div>

      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>

      <div className="card card-narrow">
        <h3 className="card-title">طلب زمنية جديدة</h3>
        <form onSubmit={submit} noValidate>
          <fieldset className="field">
            <legend>نوع الزمنية</legend>
            <div className="choice-cards">
              {Object.entries(LEAVE_TYPES).map(([type, t]) => (
                <label key={type} className="choice-card">
                  <input type="radio" name="leave-type" checked={form.type === type} onChange={() => setType(type)} />
                  <span>
                    <strong>{t.label}</strong>
                    <small>{t.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field
            id="leave-date"
            label="التاريخ"
            required
            error={errors.date}
            hint={dayPlan ? (dayPlan.off ? 'هذا اليوم إجازتك الأسبوعية' : `دوامك: ${shiftsText(dayPlan.shifts) || 'دوام مرن'}`) : undefined}
          >
            <div className="date-input" data-empty={!form.date} data-placeholder="اختر التاريخ">
              <input
                id="leave-date"
                type="date"
                min={todayStr()}
                value={form.date}
                onChange={(e) => update({ date: e.target.value, ...suggest(form.type, e.target.value || todayStr(), week) })}
                aria-invalid={!!errors.date}
              />
            </div>
          </Field>

          <div className="form-row">
            <Field id="leave-from" label={form.type === 'start' ? 'بداية الدوام (من)' : 'أخرج الساعة'} required>
              <input id="leave-from" type="time" dir="ltr" value={form.from} onChange={(e) => update({ from: e.target.value })} aria-invalid={!!errors.time} />
            </Field>
            <Field id="leave-to" label={form.type === 'start' ? 'أصل الساعة' : form.type === 'end' ? 'حتى نهاية الدوام' : 'أعود الساعة'} required>
              <input id="leave-to" type="time" dir="ltr" value={form.to} onChange={(e) => update({ to: e.target.value })} aria-invalid={!!errors.time} />
            </Field>
          </div>
          {errors.time ? (
            <p className="field-error form-row-hint">{errors.time}</p>
          ) : (
            <p className="field-hint form-row-hint">المدة: {length > 0 ? formatMinutes(length) : '-'}</p>
          )}
          <div className="day-chips duration-chips" role="group" aria-label="مدة سريعة">
            {DURATIONS.map((d) => (
              <button key={d.minutes} type="button" className={`chip-button${length === d.minutes ? ' is-on' : ''}`} onClick={() => setDuration(d.minutes)}>
                {d.label}
              </button>
            ))}
          </div>

          <Field id="leave-reason" label="السبب" required error={errors.reason}>
            <input
              id="leave-reason"
              maxLength={300}
              value={form.reason}
              onChange={(e) => update({ reason: e.target.value })}
              aria-invalid={!!errors.reason}
              placeholder="مثال: مراجعة دائرة الجوازات"
            />
          </Field>
          <Alert type="error">{error}</Alert>
          <button type="submit" className="btn" disabled={sending}>
            {sending ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
          </button>
        </form>
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          title="طلباتي"
          exportTitle="زمنياتي"
          columns={columns}
          rows={leaves}
          rowKey={(l) => l._id}
          emptyLabel="لم تطلب أي زمنية بعد."
          searchPlaceholder="ابحث في الزمنيات..."
          fileName="my-time-leaves"
        />
      )}
    </div>
  );
}
