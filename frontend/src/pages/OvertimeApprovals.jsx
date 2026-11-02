import { useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import {
  useGetAllOvertimeForReviewerQuery,
  useReviewOvertimeMutation,
} from '../features/api/overtimeApi';

export default function OvertimeApprovals() {
  const { data, isLoading } = useGetAllOvertimeForReviewerQuery();
  const [reviewOvertime, { isLoading: reviewing }] = useReviewOvertimeMutation();
  const [remarksMap, setRemarksMap] = useState({});
  const [error, setError] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const handleReview = async (id, status) => {
    setError('');
    try {
      await reviewOvertime({ id, status, reviewRemarks: remarksMap[id] || '' }).unwrap();
    } catch (err) {
      setError(err?.data?.message || 'Failed to review request.');
    }
  };

  const rows = useMemo(() => {
    const all = data?.requests || [];
    return all.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to));
  }, [data, range]);

  const columns = [
    { key: 'employee', label: 'Employee', value: (r) => r.user?.name, render: (r) => r.user?.name },
    { key: 'date', label: 'Date', value: (r) => r.date },
    { key: 'requestedHours', label: 'Hours', value: (r) => `${r.requestedHours}h` },
    { key: 'reason', label: 'Reason', value: (r) => r.reason },
    { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'remarks',
      label: 'Remarks',
      value: (r) => (r.status === 'Pending' ? remarksMap[r._id] || '' : r.reviewRemarks || '-'),
      render: (r) =>
        r.status === 'Pending' ? (
          <input
            placeholder="Optional remarks"
            value={remarksMap[r._id] || ''}
            onChange={(e) => setRemarksMap({ ...remarksMap, [r._id]: e.target.value })}
            style={{ marginBottom: 0, minWidth: 140 }}
          />
        ) : (
          r.reviewRemarks || '-'
        ),
    },
    {
      key: 'action',
      label: 'Action',
      value: () => '',
      render: (r) =>
        r.status === 'Pending' ? (
          <span style={{ whiteSpace: 'nowrap' }}>
            <button
              className="btn success"
              disabled={reviewing}
              onClick={() => handleReview(r._id, 'Approved')}
              style={{ marginRight: 6, padding: '6px 12px' }}
            >
              Approve
            </button>
            <button
              className="btn danger"
              disabled={reviewing}
              onClick={() => handleReview(r._id, 'Rejected')}
              style={{ padding: '6px 12px' }}
            >
              Reject
            </button>
          </span>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Overtime Approvals</h1>
      {error && <p className="error-text">{error}</p>}

      <DateRangeFilter
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onClear={() => setRange({ from: '', to: '' })}
      />

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyLabel="No overtime requests to review."
          searchPlaceholder="Search requests..."
          fileName="overtime-approvals"
        />
      )}
    </div>
  );
}
