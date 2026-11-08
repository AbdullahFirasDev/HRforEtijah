import { useState } from 'react';
import { useCreateLeaveTypeMutation, useGetLeaveTypesQuery, useUpdateLeaveTypeMutation } from '../features/api/leaveApi';
import DataTable from './DataTable';
import Field from './Field';
import Alert from './Alert';
import Loading from './Loading';
import { formatDateTime } from '../utils/format';
import { COUNT_MODES, daysText } from '../utils/leaves';

// Names only: every setting stays the admin's decision
const NAME_SUGGESTIONS = ['إجازة اعتيادية', 'إجازة مرضية', 'إجازة بدون راتب', 'إجازة طارئة'];

const FIELD_LABELS = {
  name: 'الاسم',
  description: 'الوصف',
  paid: 'مدفوعة',
  deductsBalance: 'تُخصم من الرصيد',
  countMode: 'احتساب الأيام',
  requiresAttachment: 'تتطلب مستنداً',
  maxDaysPerRequest: 'أقصى أيام للطلب',
  allowPastDays: 'أيام بأثر رجعي',
  isActive: 'مفعّل',
  order: 'الترتيب',
};
const valueText = (field, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (field === 'countMode') return COUNT_MODES[v]?.label || v;
  return String(v);
};

const EMPTY = {
  name: '',
  description: '',
  paid: true,
  deductsBalance: false,
  countMode: 'working',
  requiresAttachment: false,
  maxDaysPerRequest: '',
  allowPastDays: '0',
  order: '0',
  isActive: true,
};

const formFrom = (t) => ({
  name: t.name,
  description: t.description || '',
  paid: t.paid,
  deductsBalance: t.deductsBalance,
  countMode: t.countMode,
  requiresAttachment: t.requiresAttachment,
  maxDaysPerRequest: t.maxDaysPerRequest ? String(t.maxDaysPerRequest) : '',
  allowPastDays: String(t.allowPastDays || 0),
  order: String(t.order || 0),
  isActive: t.isActive,
});

const validate = (f) => ({
  name: f.name.trim().length >= 2 ? undefined : 'اكتب اسم نوع الإجازة',
  maxDaysPerRequest:
    f.maxDaysPerRequest === '' || (/^\d+$/.test(f.maxDaysPerRequest) && +f.maxDaysPerRequest >= 1 && +f.maxDaysPerRequest <= 366)
      ? undefined
      : 'رقم من 1 إلى 366، أو اتركه فارغاً بلا حد',
  allowPastDays: /^\d+$/.test(f.allowPastDays) && +f.allowPastDays <= 90 ? undefined : 'رقم من 0 إلى 90',
  order: /^\d+$/.test(f.order) && +f.order <= 999 ? undefined : 'رقم من 0 إلى 999',
});

function TypeModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState(() => (type ? formFrom(type) : EMPTY));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [create, { isLoading: creating }] = useCreateLeaveTypeMutation();
  const [update, { isLoading: updating }] = useUpdateLeaveTypeMutation();
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      paid: form.paid,
      deductsBalance: form.deductsBalance,
      countMode: form.countMode,
      requiresAttachment: form.requiresAttachment,
      maxDaysPerRequest: form.maxDaysPerRequest === '' ? null : Number(form.maxDaysPerRequest),
      allowPastDays: Number(form.allowPastDays),
      order: Number(form.order),
      ...(type && { isActive: form.isActive }),
    };
    try {
      if (type) await update({ id: type._id, ...body }).unwrap();
      else await create(body).unwrap();
      onSaved(type ? `حُفظ نوع «${body.name}».` : `أُضيف نوع «${body.name}». يظهر للموظفين في نموذج طلب الإجازة.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر الحفظ. حاول مرة أخرى.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide" role="dialog" aria-modal="true" aria-labelledby="type-modal-title">
        <h2 id="type-modal-title" className="card-title">
          {type ? `تعديل «${type.name}»` : 'إضافة نوع إجازة'}
        </h2>
        <p className="form-note">
          هذه الإعدادات سياسة الشركة لهذا النوع. يحتفظ كل طلب بالإعدادات التي قُدّم بها، فلا يغيّر التعديل الطلبات السابقة.
        </p>
        <form onSubmit={save} noValidate>
          <Field id="type-name" label="اسم النوع" required error={errors.name}>
            <input id="type-name" maxLength={60} value={form.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} />
          </Field>
          {!type && (
            <div className="day-chips duration-chips" role="group" aria-label="أسماء مقترحة">
              {NAME_SUGGESTIONS.map((n) => (
                <button key={n} type="button" className={`chip-button${form.name === n ? ' is-on' : ''}`} onClick={() => set({ name: n })}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <Field id="type-desc" label="وصف للموظفين" hint="اختياري، يظهر في نموذج الطلب">
            <input id="type-desc" maxLength={300} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>

          <fieldset className="field">
            <legend>الأجر</legend>
            <div className="choice-cards choice-cards-2">
              {[
                [true, 'مدفوعة', 'إجازة براتب'],
                [false, 'غير مدفوعة', 'إجازة بدون راتب'],
              ].map(([v, label, hint]) => (
                <label key={label} className="choice-card">
                  <input type="radio" name="type-paid" checked={form.paid === v} onChange={() => set({ paid: v })} />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>احتساب الأيام</legend>
            <div className="choice-cards choice-cards-2">
              {Object.entries(COUNT_MODES).map(([v, m]) => (
                <label key={v} className="choice-card">
                  <input type="radio" name="type-count" checked={form.countMode === v} onChange={() => set({ countMode: v })} />
                  <span>
                    <strong>{m.label}</strong>
                    <small>{m.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="check-row" htmlFor="type-balance">
            <input id="type-balance" type="checkbox" checked={form.deductsBalance} onChange={(e) => set({ deductsBalance: e.target.checked })} />
            <span>
              <strong>تُخصم من رصيد سنوي</strong>
              <small>يُمنح الرصيد لكل موظف من «الأرصدة». لا يُقبل طلب يتجاوز المتاح، وتُخصم الأيام عند الموافقة فقط وتعود عند الإلغاء.</small>
            </span>
          </label>
          <label className="check-row" htmlFor="type-attach">
            <input id="type-attach" type="checkbox" checked={form.requiresAttachment} onChange={(e) => set({ requiresAttachment: e.target.checked })} />
            <span>
              <strong>تتطلب مستنداً داعماً</strong>
              <small>مثل التقرير الطبي. لا يُرسل الطلب دون مرفق.</small>
            </span>
          </label>

          <div className="form-row form-row-3">
            <Field id="type-max" label="أقصى أيام للطلب" hint="فارغ: بلا حد" error={errors.maxDaysPerRequest}>
              <input id="type-max" inputMode="numeric" dir="ltr" value={form.maxDaysPerRequest} onChange={(e) => set({ maxDaysPerRequest: e.target.value.trim() })} aria-invalid={!!errors.maxDaysPerRequest} />
            </Field>
            <Field id="type-past" label="أيام بأثر رجعي" hint="0: من اليوم فصاعداً" error={errors.allowPastDays}>
              <input id="type-past" inputMode="numeric" dir="ltr" value={form.allowPastDays} onChange={(e) => set({ allowPastDays: e.target.value.trim() })} aria-invalid={!!errors.allowPastDays} />
            </Field>
            <Field id="type-order" label="الترتيب" hint="الأصغر يظهر أولاً" error={errors.order}>
              <input id="type-order" inputMode="numeric" dir="ltr" value={form.order} onChange={(e) => set({ order: e.target.value.trim() })} aria-invalid={!!errors.order} />
            </Field>
          </div>

          {type && (
            <label className="check-row" htmlFor="type-active">
              <input id="type-active" type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
              <span>
                <strong>متاح للطلب</strong>
                <small>عند إيقافه يختفي من نموذج الطلب، وتبقى طلباته السابقة كما هي.</small>
              </span>
            </label>
          )}

          <Alert type="error">{error}</Alert>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={creating || updating}>
              {creating || updating ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose}>
              إلغاء
            </button>
          </div>
        </form>

        {type?.changes?.length > 0 && (
          <section className="manage-section">
            <h3>سجل التعديلات</h3>
            <ol className="leave-history">
              {[...type.changes].reverse().map((c, i) => (
                <li key={i}>
                  <strong>{c.byName || '-'}</strong>
                  <time dateTime={c.at}>{formatDateTime(c.at)}</time>
                  <p>
                    {Object.keys(c.after || {})
                      .map((f) => `${FIELD_LABELS[f] || f}: ${valueText(f, c.before?.[f])} ← ${valueText(f, c.after[f])}`)
                      .join('، ')}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

// Admin: the kinds of leave employees can request
export default function LeaveTypesPanel() {
  const { data, isLoading } = useGetLeaveTypesQuery({ all: 1 });
  const [editing, setEditing] = useState(null); // a type, or 'new'
  const [success, setSuccess] = useState('');
  const types = data?.types || [];

  const columns = [
    {
      key: 'name',
      label: 'النوع',
      value: (t) => t.name,
      render: (t) => (
        <span className="cell-stack">
          <strong>{t.name}</strong>
          {t.description && <small>{t.description}</small>}
        </span>
      ),
    },
    { key: 'paid', label: 'الأجر', value: (t) => (t.paid ? 'مدفوعة' : 'غير مدفوعة') },
    { key: 'count', label: 'الاحتساب', value: (t) => COUNT_MODES[t.countMode]?.label },
    { key: 'balance', label: 'الرصيد', value: (t) => (t.deductsBalance ? 'تُخصم' : 'لا تُخصم') },
    { key: 'attach', label: 'مستند', value: (t) => (t.requiresAttachment ? 'مطلوب' : 'اختياري') },
    { key: 'max', label: 'أقصى مدة', value: (t) => (t.maxDaysPerRequest ? daysText(t.maxDaysPerRequest) : 'بلا حد') },
    { key: 'past', label: 'بأثر رجعي', value: (t) => (t.allowPastDays ? daysText(t.allowPastDays) : 'لا') },
    {
      key: 'state',
      label: 'الحالة',
      value: (t) => (t.isActive ? 'متاح' : 'موقوف'),
      render: (t) => <span className={`badge ${t.isActive ? 'success' : 'muted'}`}>{t.isActive ? 'متاح' : 'موقوف'}</span>,
    },
    { key: 'requests', label: 'الطلبات', value: (t) => String(t.requests || 0) },
    {
      key: 'edit',
      label: 'تعديل',
      value: () => '',
      render: (t) => (
        <button type="button" className="btn secondary btn-sm" onClick={() => setEditing(t)}>
          تعديل
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="panel-head">
        <p className="form-note">
          لا توجد أنواع أو أرصدة مفترضة: يحدد المسؤول كل نوع وإعداداته. الإيقاف بدلاً من الحذف يحفظ الطلبات السابقة.
        </p>
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          إضافة نوع إجازة
        </button>
      </div>
      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>
      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          title="أنواع الإجازات"
          exportTitle="أنواع الإجازات"
          columns={columns}
          rows={types}
          rowKey={(t) => t._id}
          emptyLabel="لم يُضف أي نوع بعد. أضف الأنواع التي تعتمدها الشركة ليتمكن الموظفون من طلب الإجازات."
          searchPlaceholder="ابحث في الأنواع..."
          fileName="leave-types"
        />
      )}
      {editing && (
        <TypeModal
          type={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setSuccess(text);
          }}
        />
      )}
    </div>
  );
}
