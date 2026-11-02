import { useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import {
  useRequestOvertimeMutation,
  useUpdateOvertimeMutation,
  useGetMyOvertimeQuery,
} from '../features/api/overtimeApi';
import { formatHours, todayStr } from '../utils/format';
import { statusLabel } from '../utils/labels';
import { MIN_OVERTIME_HOURS, hasErrors, validateOvertimeForm } from '../utils/validation';

const EMPTY_FORM = () => ({ date: todayStr(), requestedHours: '', reason: '' });

export default function OvertimeRequests() {
  const { data, isLoading } = useGetMyOvertimeQuery();
  const [requestOvertime, { isLoading: submitting }] = useRequestOvertimeMutation();
  const [updateOvertime, { isLoading: updating }] = useUpdateOvertimeMutation();

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', requestedHours: '', reason: '' });
  const [editError, setEditError] = useState('');

  const [range, setRange] = useState({ from: '', to: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const found = validateOvertimeForm(form, todayStr());
    setErrors(found);
    if (hasErrors(found)) return;
    try {
      await requestOvertime({ ...form, requestedHours: Number(form.requestedHours) }).unwrap();
      setSuccess('تم إرسال طلب العمل الإضافي، وسيظهر في القائمة بحالة "قيد الانتظار".');
      setForm(EMPTY_FORM());
    } catch (err) {
      setError(err?.data?.message || 'تعذر إرسال الطلب. حاول مرة أخرى.');
    }
  };

  const startEdit = (r) => {
    setEditingId(r._id);
    setEditForm({ date: r.date, requestedHours: r.requestedHours, reason: r.reason });
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError('');
  };

  const saveEdit = async (id) => {
    setEditError('');
    const found = validateOvertimeForm(editForm, todayStr());
    if (hasErrors(found)) {
      setEditError(Object.values(found).filter(Boolean).join('، '));
      return;
    }
    try {
      await updateOvertime({
        id,
        date: editForm.date,
        requestedHours: Number(editForm.requestedHours),
        reason: editForm.reason,
      }).unwrap();
      setEditingId(null);
    } catch (err) {
      setEditError(err?.data?.message || 'تعذر حفظ التعديل. حاول مرة أخرى.');
    }
  };

  const rows = useMemo(() => {
    const all = data?.requests || [];
    return all.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to));
  }, [data, range]);

  const columns = [
    {
      key: 'date',
      label: 'التاريخ',
      value: (r) => r.date,
      render: (r) =>
        editingId === r._id ? (
          <input
            type="date"
            className="input-sm"
            aria-label="تاريخ الطلب"
            max={todayStr()}
            value={editForm.date}
            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
            style={{ minWidth: 150 }}
          />
        ) : (
          r.date
        ),
    },
    {
      key: 'requestedHours',
      label: 'الساعات',
      value: (r) => formatHours(r.requestedHours),
      render: (r) =>
        editingId === r._id ? (
          <input
            type="number"
            className="input-sm"
            aria-label="عدد الساعات"
            min={MIN_OVERTIME_HOURS}
            step="0.5"
            value={editForm.requestedHours}
            onChange={(e) => setEditForm({ ...editForm, requestedHours: e.target.value })}
            style={{ width: 90 }}
          />
        ) : (
          formatHours(r.requestedHours)
        ),
    },
    {
      key: 'reason',
      label: 'السبب',
      value: (r) => r.reason,
      wrap: true,
      render: (r) =>
        editingId === r._id ? (
          <input
            className="input-sm"
            aria-label="سبب الطلب"
            value={editForm.reason}
            onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
            style={{ minWidth: 180 }}
          />
        ) : (
          r.reason
        ),
    },
    { key: 'status', label: 'الحالة', value: (r) => statusLabel(r.status), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reviewRemarks', label: 'ملاحظات المراجع', value: (r) => r.reviewRemarks || '-', wrap: true },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (r) =>
        editingId === r._id ? (
          <span className="row-actions">
            <button className="btn success btn-sm" disabled={updating} onClick={() => saveEdit(r._id)}>
              حفظ
            </button>
            <button className="btn secondary btn-sm" disabled={updating} onClick={cancelEdit}>
              إلغاء
            </button>
          </span>
        ) : r.status === 'Pending' ? (
          <button className="btn secondary btn-sm" onClick={() => startEdit(r)}>
            تعديل
          </button>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="طلبات العمل الإضافي" />

      <div className="card card-narrow">
        <h3 className="card-title">طلب عمل إضافي</h3>
        <form onSubmit={handleSubmit} noValidate>
          <Field id="ot-date" label="التاريخ" required hint="يوم سجّلت فيه حضورك، ولا يمكن اختيار تاريخ مستقبلي" error={errors.date}>
            <input
              id="ot-date"
              type="date"
              name="date"
              max={todayStr()}
              value={form.date}
              onChange={handleChange}
              aria-invalid={!!errors.date}
            />
          </Field>
          <Field
            id="ot-hours"
            label="عدد الساعات"
            required
            hint={`بحد أدنى ${MIN_OVERTIME_HOURS} ساعة، وبزيادات نصف ساعة`}
            error={errors.requestedHours}
          >
            <input
              id="ot-hours"
              type="number"
              name="requestedHours"
              inputMode="decimal"
              min={MIN_OVERTIME_HOURS}
              step="0.5"
              value={form.requestedHours}
              onChange={handleChange}
              aria-invalid={!!errors.requestedHours}
            />
          </Field>
          <Field id="ot-reason" label="السبب" required error={errors.reason}>
            <textarea
              id="ot-reason"
              name="reason"
              rows={3}
              placeholder="اكتب سبب العمل الإضافي"
              value={form.reason}
              onChange={handleChange}
              aria-invalid={!!errors.reason}
            />
          </Field>
          <Alert type="error">{error}</Alert>
          <Alert type="success">{success}</Alert>
          <button type="submit" className="btn btn-block" disabled={submitting}>
            {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
          </button>
        </form>
      </div>

      <DateRangeFilter
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onClear={() => setRange({ from: '', to: '' })}
      />

      <Alert type="error" onClose={() => setEditError('')}>
        {editError}
      </Alert>
      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          title="طلباتي"
          exportTitle="طلبات العمل الإضافي"
          columns={columns}
          rows={rows}
          emptyLabel="لا توجد طلبات عمل إضافي بعد."
          searchPlaceholder="ابحث في طلباتي..."
          fileName="my-overtime-requests"
        />
      )}
    </div>
  );
}
