import { useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import { formatHours } from '../utils/format';
import { statusLabel } from '../utils/labels';
import {
  useGetAllOvertimeForReviewerQuery,
  useReviewOvertimeMutation,
} from '../features/api/overtimeApi';

export default function OvertimeApprovals() {
  const { data, isLoading } = useGetAllOvertimeForReviewerQuery();
  const [reviewOvertime, { isLoading: reviewing }] = useReviewOvertimeMutation();
  const [remarksMap, setRemarksMap] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const handleReview = async (r, status) => {
    setError('');
    setSuccess('');
    try {
      await reviewOvertime({ id: r._id, status, reviewRemarks: remarksMap[r._id] || '' }).unwrap();
      setSuccess(`تم ${status === 'Approved' ? 'قبول' : 'رفض'} طلب ${r.user?.name || 'الموظف'} بتاريخ ${r.date}.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذرت مراجعة الطلب. حاول مرة أخرى.');
    }
  };

  const rows = useMemo(() => {
    const all = data?.requests || [];
    return all.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to));
  }, [data, range]);

  const columns = [
    { key: 'employee', label: 'الموظف', value: (r) => r.user?.name },
    { key: 'date', label: 'التاريخ', value: (r) => r.date },
    { key: 'requestedHours', label: 'الساعات', value: (r) => formatHours(r.requestedHours) },
    { key: 'reason', label: 'السبب', value: (r) => r.reason, wrap: true },
    { key: 'status', label: 'الحالة', value: (r) => statusLabel(r.status), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'remarks',
      label: 'الملاحظات',
      value: (r) => (r.status === 'Pending' ? remarksMap[r._id] || '' : r.reviewRemarks || '-'),
      render: (r) =>
        r.status === 'Pending' ? (
          <input
            className="input-sm"
            placeholder="ملاحظة (اختياري)"
            aria-label={`ملاحظة على طلب ${r.user?.name || ''}`}
            value={remarksMap[r._id] || ''}
            onChange={(e) => setRemarksMap({ ...remarksMap, [r._id]: e.target.value })}
            style={{ minWidth: 140 }}
          />
        ) : (
          r.reviewRemarks || '-'
        ),
    },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (r) =>
        r.status === 'Pending' ? (
          <span className="row-actions">
            <button className="btn success btn-sm" disabled={reviewing} onClick={() => handleReview(r, 'Approved')}>
              قبول
            </button>
            <button className="btn danger btn-sm" disabled={reviewing} onClick={() => handleReview(r, 'Rejected')}>
              رفض
            </button>
          </span>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="اعتماد العمل الإضافي" subtitle="راجع طلبات العمل الإضافي واقبلها أو ارفضها مع ملاحظة اختيارية." />
      <Alert type="error" onClose={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>

      <DateRangeFilter
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onClear={() => setRange({ from: '', to: '' })}
      />

      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          exportTitle="طلبات العمل الإضافي"
          columns={columns}
          rows={rows}
          emptyLabel="لا توجد طلبات عمل إضافي للمراجعة."
          searchPlaceholder="ابحث في الطلبات..."
          fileName="overtime-approvals"
        />
      )}
    </div>
  );
}
