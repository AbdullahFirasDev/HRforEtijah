import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useGetLeaveMetaQuery,
  useGetLeaveTypesQuery,
  useGetMyLeavesQuery,
  usePreviewLeaveMutation,
  useRequestLeaveMutation,
} from '../features/api/leaveApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import LeaveStatusBadge from '../components/LeaveStatusBadge';
import AttachmentPicker from '../components/AttachmentPicker';
import LeaveDetailsModal from '../components/LeaveDetailsModal';
import { formatDate, formatDayLong, todayStr } from '../utils/format';
import { COUNT_MODES, currentYear, daysText, leaveStatusLabel, periodShort } from '../utils/leaves';

const EMPTY = { leaveType: '', startDate: '', endDate: '', reason: '', notes: '' };

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const policyText = (t) =>
  [
    t.paid ? 'مدفوعة' : 'غير مدفوعة',
    COUNT_MODES[t.countMode]?.label,
    t.deductsBalance && 'تُخصم من الرصيد',
    t.requiresAttachment && 'تتطلب مستنداً',
    t.maxDaysPerRequest && `حتى ${daysText(t.maxDaysPerRequest)}`,
    t.allowPastDays > 0 && `يمكن طلبها بأثر رجعي ${daysText(t.allowPastDays)}`,
  ]
    .filter(Boolean)
    .join(' · ');

const validate = (form, type, files) => ({
  leaveType: form.leaveType ? undefined : 'اختر نوع الإجازة',
  startDate: form.startDate ? undefined : 'اختر تاريخ بداية الإجازة',
  endDate: !form.endDate
    ? 'اختر تاريخ نهاية الإجازة'
    : form.startDate && form.endDate < form.startDate
      ? 'تاريخ النهاية يجب أن يكون في يوم البداية أو بعده'
      : undefined,
  reason: form.reason.trim().length >= 3 ? undefined : 'اكتب سبب الإجازة (3 أحرف على الأقل)',
  attachments: type?.requiresAttachment && !files.length ? `«${type.name}» تتطلب إرفاق مستند داعم` : undefined,
});

const excludedText = (dates) => {
  const shown = dates.slice(0, 4).map((d) => formatDayLong(d).replace(/،? \d{4}$/, ''));
  return shown.join('، ') + (dates.length > 4 ? ` و${dates.length - 4} غيرها` : '');
};

// Employees ask for days of leave, follow their requests and print them
export default function MyLeaves() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const openId = params.get('request');
  const [year, setYear] = useState(currentYear());

  const { data: meta, isLoading: metaLoading } = useGetLeaveMetaQuery();
  const ready = meta?.ready;
  const { data: typesData } = useGetLeaveTypesQuery(undefined, { skip: !ready });
  const { data, isLoading } = useGetMyLeavesQuery({ year }, { skip: !ready });
  const [preview] = usePreviewLeaveMutation();
  const [send, { isLoading: sending }] = useRequestLeaveMutation();

  const types = useMemo(() => typesData?.types || [], [typesData]);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [count, setCount] = useState(null); // the server's count for the current choice
  const type = types.find((t) => t._id === form.leaveType);
  const formRef = useRef(null);

  // Ask the server how many days count (weekly days off, balance) as dates change
  useEffect(() => {
    setCount(null);
    if (!form.leaveType || !form.startDate || !form.endDate || form.endDate < form.startDate) return undefined;
    const key = `${form.leaveType}|${form.startDate}|${form.endDate}`;
    const timer = setTimeout(async () => {
      try {
        const res = await preview({ leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate }).unwrap();
        setCount({ key, ...res });
      } catch (err) {
        setCount({ key, ok: false, message: err?.data?.message || 'تعذر حساب عدد الأيام' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [form.leaveType, form.startDate, form.endDate, preview]);

  const update = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      // Picking a start after the end moves the end along
      if (patch.startDate && next.endDate && next.endDate < patch.startDate) next.endDate = patch.startDate;
      if (patch.startDate && !next.endDate) next.endDate = patch.startDate;
      return next;
    });
    setErrors({});
    setSuccess('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validate(form, type, files);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    if (count && count.ok === false) {
      setError(count.message);
      return;
    }
    try {
      const res = await send({
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
        notes: form.notes.trim(),
        attachments: files.map((f) => f.id),
      }).unwrap();
      const r = res.request;
      setSuccess(`أُرسل طلبك رقم ${r.number} (${r.typeName}، ${daysText(r.days)}) إلى مديرك للمراجعة. ستصلك النتيجة في الإشعارات.`);
      setForm(EMPTY);
      setFiles([]);
      setCount(null);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setError(err?.data?.message || 'تعذر إرسال الطلب. حاول مرة أخرى.');
    }
  };

  const open = (id) => setParams(id ? { request: id } : {}, { replace: !id });

  const requests = data?.requests || [];
  const pending = requests.filter((r) => r.status === 'Pending').length;
  const minStart = type?.allowPastDays ? addDays(todayStr(), -type.allowPastDays) : todayStr();
  const countShown = count && count.key === `${form.leaveType}|${form.startDate}|${form.endDate}` ? count : null;

  const columns = [
    { key: 'number', label: 'رقم الطلب', value: (r) => r.number, render: (r) => <span dir="ltr">{r.number}</span> },
    { key: 'type', label: 'النوع', value: (r) => r.typeName },
    { key: 'period', label: 'الفترة', value: periodShort },
    { key: 'days', label: 'الأيام', value: (r) => daysText(r.days) },
    { key: 'status', label: 'الحالة', value: (r) => leaveStatusLabel(r.status), render: (r) => <LeaveStatusBadge status={r.status} /> },
    { key: 'created', label: 'تاريخ التقديم', value: (r) => formatDate(r.createdAt) },
    {
      key: 'open',
      label: 'التفاصيل',
      value: () => '',
      render: (r) => (
        <button type="button" className="btn secondary btn-sm" onClick={() => open(r._id)}>
          عرض
        </button>
      ),
    },
  ];

  if (metaLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="الإجازات"
        subtitle="اطلب إجازة ليوم أو أكثر، وتابع حالة طلباتك، واطبعها. للإذن بساعات خلال يوم الدوام استخدم «الزمنيات»."
        actions={
          ready && (
            <button type="button" className="btn secondary" onClick={() => navigate(`/print/leave-statement?year=${year}`)}>
              طباعة كشف إجازاتي
            </button>
          )
        }
      />

      {!ready ? (
        <Alert type="info" title="قسم الإجازات غير مفعّل بعد">
          سيُتاح طلب الإجازات بعد أن يكمل مسؤول النظام إعداد القسم.
        </Alert>
      ) : (
        <>
          {data?.balances?.length > 0 && (
            <>
              <div className="leave-year-bar">
                <h2 className="section-title">رصيدي لسنة {year}</h2>
                <select className="input-sm" aria-label="سنة الرصيد" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {[currentYear() - 1, currentYear(), currentYear() + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-3 leave-balances">
                {data.balances.map((b) => (
                  <div key={b.type.id} className="stat-box">
                    <div className="value">{daysText(b.remaining)}</div>
                    <div className="label">المتبقي من {b.type.name}</div>
                    <div className="sub">
                      الإجمالي {daysText(b.total)} · المستخدم {daysText(b.used)}
                      {b.pending > 0 && ` · قيد المراجعة ${daysText(b.pending)}`}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Alert type="success" onClose={() => setSuccess('')}>
            {success}
          </Alert>

          <div className="card card-narrow leave-form-card" ref={formRef}>
            <h3 className="card-title">طلب إجازة جديد</h3>
            {!types.length ? (
              <Alert type="info">لم تحدد الإدارة أنواع الإجازات بعد. تواصل مع مسؤول النظام.</Alert>
            ) : (
              <form onSubmit={submit} noValidate>
                <fieldset className="field">
                  <legend>
                    نوع الإجازة
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </legend>
                  <div className="choice-cards">
                    {types.map((t) => (
                      <label key={t._id} className="choice-card">
                        <input type="radio" name="leave-kind" checked={form.leaveType === t._id} onChange={() => update({ leaveType: t._id })} />
                        <span>
                          <strong>{t.name}</strong>
                          <small>{policyText(t)}</small>
                          {t.description && <small>{t.description}</small>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.leaveType && <p className="field-error">{errors.leaveType}</p>}
                </fieldset>

                <div className="form-row">
                  <Field id="leave-start" label="من تاريخ" required error={errors.startDate}>
                    <div className="date-input" data-empty={!form.startDate} data-placeholder="اختر التاريخ">
                      <input
                        id="leave-start"
                        type="date"
                        min={minStart}
                        value={form.startDate}
                        onChange={(e) => update({ startDate: e.target.value })}
                        aria-invalid={!!errors.startDate}
                      />
                    </div>
                  </Field>
                  <Field id="leave-end" label="إلى تاريخ" required error={errors.endDate}>
                    <div className="date-input" data-empty={!form.endDate} data-placeholder="اختر التاريخ">
                      <input
                        id="leave-end"
                        type="date"
                        min={form.startDate || minStart}
                        value={form.endDate}
                        onChange={(e) => update({ endDate: e.target.value })}
                        aria-invalid={!!errors.endDate}
                      />
                    </div>
                  </Field>
                </div>

                <div className={`leave-count${countShown?.ok === false ? ' is-blocked' : ''}`} aria-live="polite">
                  {!form.leaveType || !form.startDate || !form.endDate ? (
                    <span>اختر النوع والتاريخين ليُحسب عدد الأيام.</span>
                  ) : !countShown ? (
                    <span>جارٍ حساب عدد الأيام...</span>
                  ) : countShown.days === undefined ? (
                    <strong>{countShown.message}</strong>
                  ) : (
                    <>
                      <span className="leave-count-days">
                        عدد الأيام: <strong>{daysText(countShown.days)}</strong>
                        {countShown.calendarDays !== countShown.days && <small> من أصل {daysText(countShown.calendarDays)}</small>}
                      </span>
                      {countShown.excluded?.length > 0 && <small>لا تُحسب أيام إجازتك الأسبوعية: {excludedText(countShown.excluded)}</small>}
                      {countShown.balance && (
                        <small>
                          رصيدك المتاح من «{type?.name}» لسنة {countShown.balance.year}: {daysText(Math.max(0, countShown.balance.available))}
                        </small>
                      )}
                      {countShown.message && <strong className="leave-count-warning">{countShown.message}</strong>}
                    </>
                  )}
                </div>

                <Field id="leave-reason" label="سبب الإجازة" required error={errors.reason}>
                  <textarea
                    id="leave-reason"
                    rows={3}
                    maxLength={500}
                    value={form.reason}
                    onChange={(e) => update({ reason: e.target.value })}
                    aria-invalid={!!errors.reason}
                    placeholder="مثال: سفر عائلي"
                  />
                </Field>
                <Field id="leave-notes" label="ملاحظات" hint="اختيارية: رقم للتواصل أثناء الإجازة، أو من يتابع عملك">
                  <textarea id="leave-notes" rows={2} maxLength={1000} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
                </Field>
                <AttachmentPicker
                  id="leave-files"
                  value={files}
                  onChange={(next) => {
                    setFiles(next);
                    setErrors((er) => ({ ...er, attachments: undefined }));
                  }}
                  required={!!type?.requiresAttachment}
                  error={errors.attachments}
                  disabled={sending}
                />
                <Alert type="error">{error}</Alert>
                <button type="submit" className="btn" disabled={sending}>
                  {sending ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
                </button>
              </form>
            )}
          </div>

          {isLoading ? (
            <Loading />
          ) : (
            <DataTable
              title={`طلباتي${pending ? ` (${pending} قيد المراجعة)` : ''}`}
              exportTitle="طلبات إجازاتي"
              columns={columns}
              rows={requests}
              rowKey={(r) => r._id}
              emptyLabel="لم تقدّم أي طلب إجازة بعد."
              searchPlaceholder="ابحث في طلباتك..."
              fileName="my-leaves"
            />
          )}
        </>
      )}

      {openId && <LeaveDetailsModal id={openId} onClose={() => open(null)} />}
    </div>
  );
}
