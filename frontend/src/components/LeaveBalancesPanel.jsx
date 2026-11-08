import { useState } from 'react';
import {
  useAddLeaveBalanceEntryMutation,
  useGetLeaveBalanceEntriesQuery,
  useGetLeaveBalancesQuery,
  useGrantLeaveBalanceMutation,
} from '../features/api/leaveApi';
import DataTable from './DataTable';
import Field from './Field';
import Alert from './Alert';
import Loading from './Loading';
import { formatDateTime } from '../utils/format';
import { currentYear, daysText } from '../utils/leaves';

const HALF_DAYS = /^-?\d+(\.5|\.0)?$/;
const KINDS = {
  grant: { label: 'منح الرصيد السنوي', hint: 'مرة واحدة لكل نوع وسنة' },
  adjustment: { label: 'تسوية (+ أو −)', hint: 'ترحيل، تصحيح، خصم إداري…' },
};

function EntryModal({ employee, types, year, onClose, onSaved }) {
  const [form, setForm] = useState({ leaveType: types[0]?._id || '', kind: 'adjustment', days: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [save, { isLoading }] = useAddLeaveBalanceEntryMutation();
  const { data: ledger } = useGetLeaveBalanceEntriesQuery({ user: employee._id, year });
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const days = Number(form.days);
    const found = {
      leaveType: form.leaveType ? undefined : 'اختر النوع',
      days:
        !HALF_DAYS.test(form.days.trim()) || !days || Math.abs(days) > 365
          ? 'عدد صحيح أو بنصف يوم (مثل 1.5)، لا يساوي صفراً'
          : form.kind === 'grant' && days < 0
            ? 'رصيد المنح يجب أن يكون موجباً'
            : undefined,
      reason: form.reason.trim().length >= 3 ? undefined : 'اكتب السبب (3 أحرف على الأقل)',
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    try {
      const res = await save({ user: employee._id, leaveType: form.leaveType, year, kind: form.kind, days, reason: form.reason.trim() }).unwrap();
      onSaved(`سُجّل القيد لـ ${employee.name}. رصيده الآن: المتبقي ${daysText(res.balance.remaining)} من ${daysText(res.balance.total)}.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر الحفظ. حاول مرة أخرى.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide" role="dialog" aria-modal="true" aria-labelledby="entry-title">
        <h2 id="entry-title" className="card-title">
          رصيد {employee.name} لسنة {year}
        </h2>
        <form onSubmit={submit} noValidate>
          <Field id="entry-type" label="نوع الإجازة" required error={errors.leaveType}>
            <select id="entry-type" value={form.leaveType} onChange={(e) => set({ leaveType: e.target.value })}>
              {types.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="field">
            <legend>نوع القيد</legend>
            <div className="choice-cards choice-cards-2">
              {Object.entries(KINDS).map(([k, v]) => (
                <label key={k} className="choice-card">
                  <input type="radio" name="entry-kind" checked={form.kind === k} onChange={() => set({ kind: k })} />
                  <span>
                    <strong>{v.label}</strong>
                    <small>{v.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <Field id="entry-days" label="عدد الأيام" required hint={form.kind === 'adjustment' ? 'استخدم − للخصم، مثل -2' : undefined} error={errors.days}>
              <input id="entry-days" dir="ltr" inputMode="decimal" value={form.days} onChange={(e) => set({ days: e.target.value })} aria-invalid={!!errors.days} />
            </Field>
            <Field id="entry-reason" label="السبب" required error={errors.reason}>
              <input id="entry-reason" maxLength={300} value={form.reason} onChange={(e) => set({ reason: e.target.value })} aria-invalid={!!errors.reason} />
            </Field>
          </div>
          <p className="form-note">القيود لا تُعدَّل ولا تُحذف؛ يُصحَّح الخطأ بتسوية جديدة، فيبقى السجل كاملاً.</p>
          <Alert type="error">{error}</Alert>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={isLoading}>
              {isLoading ? 'جارٍ الحفظ...' : 'تسجيل القيد'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose}>
              إغلاق
            </button>
          </div>
        </form>
        <section className="manage-section">
          <h3>سجل القيود لسنة {year}</h3>
          {!ledger?.entries?.length ? (
            <p className="manage-text">لا توجد قيود بعد.</p>
          ) : (
            <ol className="leave-history">
              {ledger.entries.map((e) => (
                <li key={e._id}>
                  <strong>
                    {e.kind === 'grant' ? 'منح' : 'تسوية'} {e.days > 0 ? '+' : ''}
                    {e.days} — {e.leaveType?.name || '-'}
                  </strong>
                  <span>{e.byName || '-'}</span>
                  <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                  <p>{e.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

// Admin: yearly balances of each employee for the types that use one
export default function LeaveBalancesPanel() {
  const [year, setYear] = useState(currentYear());
  const { data, isLoading } = useGetLeaveBalancesQuery({ year });
  const [grant, { isLoading: granting }] = useGrantLeaveBalanceMutation();
  const [bulk, setBulk] = useState({ leaveType: '', days: '', reason: '' });
  const [bulkErrors, setBulkErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [entryFor, setEntryFor] = useState(null);

  // Types that use a balance, plus any with entries this year
  const types = data?.types || [];
  const tracked = types.filter((t) => t.deductsBalance);
  const rows = data?.rows || [];

  const submitBulk = async (e) => {
    e.preventDefault();
    const days = Number(bulk.days);
    const found = {
      leaveType: bulk.leaveType ? undefined : 'اختر النوع',
      days: HALF_DAYS.test(bulk.days.trim()) && days > 0 && days <= 365 ? undefined : 'عدد أيام موجب (بخطوات نصف يوم)',
      reason: bulk.reason.trim().length >= 3 ? undefined : 'اكتب السبب',
    };
    setBulkErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setFeedback(null);
    try {
      const res = await grant({ leaveType: bulk.leaveType, year, days, reason: bulk.reason.trim() }).unwrap();
      setFeedback({ type: 'success', text: res.message });
      setBulk({ leaveType: '', days: '', reason: '' });
    } catch (err) {
      setFeedback({ type: 'error', text: err?.data?.message || 'تعذر منح الرصيد.' });
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'الموظف',
      value: (r) => r.user.name,
      render: (r) => (
        <span className="cell-stack">
          <strong>{r.user.name}</strong>
          <small>{[r.user.employeeNumber, r.user.department, !r.user.isActive && 'معطّل'].filter(Boolean).join(' · ')}</small>
        </span>
      ),
    },
    ...types.map((t) => ({
      key: t._id,
      label: t.name,
      value: (r) => {
        const b = r.balances[t._id];
        return `${b.remaining} / ${b.total}`;
      },
      render: (r) => {
        const b = r.balances[t._id];
        return (
          <span className="cell-stack">
            <strong className={b.remaining < 0 ? 'text-danger' : undefined}>
              {daysText(b.remaining)} من {daysText(b.total)}
            </strong>
            <small>
              مستخدم {b.used}
              {b.pending > 0 && ` · معلق ${b.pending}`}
              {b.adjustments !== 0 && ` · تسويات ${b.adjustments > 0 ? '+' : ''}${b.adjustments}`}
            </small>
          </span>
        );
      },
    })),
    {
      key: 'act',
      label: 'الإجراء',
      value: () => '',
      render: (r) => (
        <button type="button" className="btn secondary btn-sm" onClick={() => setEntryFor(r.user)}>
          قيد / السجل
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="panel-head">
        <Field id="bal-year" label="السنة">
          <select id="bal-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[currentYear() - 1, currentYear(), currentYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <p className="form-note">
          الرصيد = ما يمنحه المسؤول + التسويات. المستخدم يُحسب من الإجازات المقبولة نفسها، فلا يُخصم الطلب مرتين، ويعود عند إلغائه.
          لا يوجد استحقاق أو ترحيل تلقائي.
        </p>
      </div>

      {feedback && (
        <Alert type={feedback.type} onClose={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}

      {isLoading ? (
        <Loading />
      ) : !tracked.length && !types.length ? (
        <Alert type="info" title="لا يوجد نوع إجازة بأرصدة">
          فعّل «تُخصم من رصيد سنوي» لنوع من «أنواع الإجازات» لتظهر أرصدته هنا.
        </Alert>
      ) : (
        <>
          {tracked.length > 0 && (
            <div className="card">
              <h3 className="card-title">منح الرصيد السنوي لكل الموظفين النشطين</h3>
              <form onSubmit={submitBulk} noValidate className="toolbar bulk-grant">
                <Field id="bulk-type" label="النوع" error={bulkErrors.leaveType}>
                  <select id="bulk-type" value={bulk.leaveType} onChange={(e) => setBulk({ ...bulk, leaveType: e.target.value })}>
                    <option value="">اختر</option>
                    {tracked.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="bulk-days" label="عدد الأيام" error={bulkErrors.days}>
                  <input id="bulk-days" dir="ltr" inputMode="decimal" value={bulk.days} onChange={(e) => setBulk({ ...bulk, days: e.target.value })} />
                </Field>
                <Field id="bulk-reason" label="السبب" error={bulkErrors.reason}>
                  <input id="bulk-reason" maxLength={300} value={bulk.reason} placeholder={`الرصيد السنوي ${year}`} onChange={(e) => setBulk({ ...bulk, reason: e.target.value })} />
                </Field>
                <div className="toolbar-actions">
                  <button type="submit" className="btn" disabled={granting}>
                    {granting ? 'جارٍ المنح...' : 'منح'}
                  </button>
                </div>
              </form>
              <p className="form-note">من سبق منحه هذا النوع لهذه السنة لا يُمنح مرة ثانية؛ غيّر رصيده بتسوية.</p>
            </div>
          )}
          <DataTable
            title={`أرصدة سنة ${year}`}
            exportTitle={`أرصدة الإجازات ${year}`}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.user._id}
            emptyLabel="لا يوجد موظفون."
            searchPlaceholder="ابحث عن موظف..."
            fileName={`leave-balances-${year}`}
          />
        </>
      )}

      {entryFor && (
        <EntryModal
          employee={entryFor}
          types={types}
          year={year}
          onClose={() => setEntryFor(null)}
          onSaved={(text) => {
            setEntryFor(null);
            setFeedback({ type: 'success', text });
          }}
        />
      )}
    </div>
  );
}
