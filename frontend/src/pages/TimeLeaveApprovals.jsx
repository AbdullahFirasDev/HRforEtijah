import { useState } from 'react';
import { useGetTimeLeavesForReviewQuery, useReviewTimeLeaveMutation } from '../features/api/timeLeaveApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import { statusLabel } from '../utils/labels';
import { leaveTimeText, leaveTypeLabel, leaveUseText } from '../utils/timeLeave';

const FILTERS = [
  { value: 'Pending', label: 'قيد الانتظار' },
  { value: 'Approved', label: 'المقبولة' },
  { value: 'Rejected', label: 'المرفوضة' },
  { value: '', label: 'الكل' },
];

// Managers decide on their team's time leaves; admins on everyone's
export default function TimeLeaveApprovals() {
  const [status, setStatus] = useState('Pending');
  const { data, isLoading } = useGetTimeLeavesForReviewQuery({ status: status || undefined });
  const [review, { isLoading: reviewing }] = useReviewTimeLeaveMutation();
  const [remarks, setRemarks] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const decide = async (l, decision) => {
    setError('');
    setSuccess('');
    try {
      await review({ id: l._id, status: decision, reviewRemarks: remarks[l._id] || '' }).unwrap();
      setSuccess(
        `تم ${decision === 'Approved' ? 'قبول' : 'رفض'} زمنية ${l.user?.name || 'الموظف'} يوم ${l.date} (${leaveTypeLabel(l.type)}).`
      );
    } catch (err) {
      setError(err?.data?.message || 'تعذرت مراجعة الطلب. حاول مرة أخرى.');
    }
  };

  const columns = [
    { key: 'employee', label: 'الموظف', value: (l) => l.user?.name },
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
      value: (l) => statusLabel(l.status),
      render: (l) => (
        <span className="cell-stack">
          <StatusBadge status={l.status} />
          {l.reviewedBy?.name && <small>{l.reviewedBy.name}</small>}
        </span>
      ),
    },
    { key: 'use', label: 'الاستخدام', value: leaveUseText },
    {
      key: 'remarks',
      label: 'الملاحظات',
      value: (l) => (l.status === 'Pending' ? remarks[l._id] || '' : l.reviewRemarks || '-'),
      render: (l) =>
        l.status === 'Pending' ? (
          <input
            className="input-sm"
            placeholder="ملاحظة (اختياري)"
            aria-label={`ملاحظة على زمنية ${l.user?.name || ''}`}
            value={remarks[l._id] || ''}
            onChange={(e) => setRemarks({ ...remarks, [l._id]: e.target.value })}
            style={{ minWidth: 130 }}
          />
        ) : (
          l.reviewRemarks || '-'
        ),
    },
    {
      key: 'action',
      label: 'القرار',
      value: () => '',
      render: (l) =>
        l.status === 'Pending' ? (
          <span className="row-actions">
            <button className="btn success btn-sm" disabled={reviewing} onClick={() => decide(l, 'Approved')}>
              قبول
            </button>
            <button className="btn danger btn-sm" disabled={reviewing} onClick={() => decide(l, 'Rejected')}>
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
      <PageHeader
        title="الزمنيات"
        subtitle="طلبات الإذن بالساعة: الخروج أثناء الدوام والعودة، والانصراف المبكر، والتأخير عن بداية الدوام. الوقت المعتمد لا يُحسب تأخيراً ولا انصرافاً مبكراً."
      />
      <Alert type="error" onClose={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>
      <div className="toolbar">
        <Field id="leave-filter" label="عرض">
          <select id="leave-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          exportTitle="الزمنيات"
          columns={columns}
          rows={data?.leaves || []}
          rowKey={(l) => l._id}
          emptyLabel={status === 'Pending' ? 'لا توجد زمنيات بانتظار قرارك.' : 'لا توجد زمنيات.'}
          searchPlaceholder="ابحث في الزمنيات..."
          fileName="time-leaves"
        />
      )}
    </div>
  );
}
