import { useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import {
  useRequestOvertimeMutation,
  useUpdateOvertimeMutation,
  useGetMyOvertimeQuery,
} from '../features/api/overtimeApi';
import { todayStr } from '../utils/format';

export default function OvertimeRequests() {
  const { data, isLoading } = useGetMyOvertimeQuery();
  const [requestOvertime, { isLoading: submitting }] = useRequestOvertimeMutation();
  const [updateOvertime, { isLoading: updating }] = useUpdateOvertimeMutation();

  const [form, setForm] = useState({ date: todayStr(), requestedHours: '', reason: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', requestedHours: '', reason: '' });
  const [editError, setEditError] = useState('');

  const [range, setRange] = useState({ from: '', to: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await requestOvertime({ ...form, requestedHours: Number(form.requestedHours) }).unwrap();
      setSuccess('Overtime request submitted!');
      setForm({ date: todayStr(), requestedHours: '', reason: '' });
    } catch (err) {
      setError(err?.data?.message || 'Failed to submit request.');
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
    try {
      await updateOvertime({
        id,
        date: editForm.date,
        requestedHours: Number(editForm.requestedHours),
        reason: editForm.reason,
      }).unwrap();
      setEditingId(null);
    } catch (err) {
      setEditError(err?.data?.message || 'Failed to update request.');
    }
  };

  const rows = useMemo(() => {
    const all = data?.requests || [];
    return all.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to));
  }, [data, range]);

  const columns = [
    {
      key: 'date',
      label: 'Date',
      value: (r) => r.date,
      render: (r) =>
        editingId === r._id ? (
          <input
            type="date"
            max={todayStr()}
            value={editForm.date}
            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
            style={{ marginBottom: 0, minWidth: 140 }}
          />
        ) : (
          r.date
        ),
    },
    {
      key: 'requestedHours',
      label: 'Hours',
      value: (r) => `${r.requestedHours}h`,
      render: (r) =>
        editingId === r._id ? (
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={editForm.requestedHours}
            onChange={(e) => setEditForm({ ...editForm, requestedHours: e.target.value })}
            style={{ marginBottom: 0, width: 70 }}
          />
        ) : (
          `${r.requestedHours}h`
        ),
    },
    {
      key: 'reason',
      label: 'Reason',
      value: (r) => r.reason,
      render: (r) =>
        editingId === r._id ? (
          <input
            value={editForm.reason}
            onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
            style={{ marginBottom: 0, minWidth: 180 }}
          />
        ) : (
          r.reason
        ),
    },
    { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reviewRemarks', label: 'Remarks', value: (r) => r.reviewRemarks || '-', render: (r) => r.reviewRemarks || '-' },
    {
      key: 'action',
      label: 'Action',
      value: () => '',
      render: (r) =>
        editingId === r._id ? (
          <span style={{ whiteSpace: 'nowrap' }}>
            <button
              className="btn success"
              disabled={updating}
              onClick={() => saveEdit(r._id)}
              style={{ marginRight: 6, padding: '6px 12px' }}
            >
              Save
            </button>
            <button className="btn" disabled={updating} onClick={cancelEdit} style={{ padding: '6px 12px' }}>
              Cancel
            </button>
          </span>
        ) : r.status === 'Pending' ? (
          <button className="btn" onClick={() => startEdit(r)} style={{ padding: '6px 12px' }}>
            Edit
          </button>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Overtime Requests</h1>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="card-title">Request Overtime</h3>
        <form onSubmit={handleSubmit}>
          <label>Date</label>
          <input
            type="date"
            max={todayStr()}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <label>Requested Hours</label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={form.requestedHours}
            onChange={(e) => setForm({ ...form, requestedHours: e.target.value })}
            required
          />
          <label>Reason</label>
          <textarea
            rows={3}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            required
          />
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
          <button className="btn" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Request'}
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

      {editError && <p className="error-text">{editError}</p>}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <DataTable
          title="My Requests"
          columns={columns}
          rows={rows}
          emptyLabel="No overtime requests yet."
          searchPlaceholder="Search my requests..."
          fileName="my-overtime-requests"
        />
      )}
    </div>
  );
}
