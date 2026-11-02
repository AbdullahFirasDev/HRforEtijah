import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import {
  useGetTeamAttendanceQuery,
  useGetAllAttendanceQuery,
  useValidateAttendanceMutation,
} from '../features/api/attendanceApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';

export default function AttendanceValidation() {
  const user = useSelector(selectCurrentUser);
  const isAdmin = user?.role === 'admin';

  const [range, setRange] = useState({ from: '', to: '' });
  const teamQuery = useGetTeamAttendanceQuery(range, { skip: isAdmin });
  const allQuery = useGetAllAttendanceQuery(range, { skip: !isAdmin });
  const { data, isLoading } = isAdmin ? allQuery : teamQuery;

  const [validateAttendance, { isLoading: validating }] = useValidateAttendanceMutation();
  const [remarksMap, setRemarksMap] = useState({});
  const [modalSrc, setModalSrc] = useState(null);
  const [error, setError] = useState('');

  const handleValidate = async (id, status) => {
    setError('');
    try {
      await validateAttendance({ id, status, remarks: remarksMap[id] || '' }).unwrap();
    } catch (err) {
      setError(err?.data?.message || 'Failed to validate attendance.');
    }
  };

  const columns = [
    { key: 'employee', label: 'Employee', value: (r) => r.user?.name },
    { key: 'date', label: 'Date', value: (r) => r.date },
    {
      key: 'selfieIn',
      label: 'Selfie (In)',
      value: () => '',
      render: (r) =>
        r.punchIn?.selfie && (
          <img className="selfie-thumb" src={r.punchIn.selfie} alt="in" onClick={() => setModalSrc(r.punchIn.selfie)} />
        ),
    },
    {
      key: 'selfieOut',
      label: 'Selfie (Out)',
      value: () => '',
      render: (r) =>
        r.punchOut?.selfie && (
          <img className="selfie-thumb" src={r.punchOut.selfie} alt="out" onClick={() => setModalSrc(r.punchOut.selfie)} />
        ),
    },
    {
      key: 'location',
      label: 'Location',
      value: (r) => (r.punchIn?.location ? `${r.punchIn.location.lat.toFixed(3)}, ${r.punchIn.location.lng.toFixed(3)}` : '-'),
      render: (r) => (
        <span style={{ fontSize: 12 }}>
          {r.punchIn?.location ? `${r.punchIn.location.lat.toFixed(3)}, ${r.punchIn.location.lng.toFixed(3)}` : '-'}
        </span>
      ),
    },
    {
      key: 'validation',
      label: 'Validation',
      value: (r) => r.validation?.status || 'Pending',
      render: (r) => <StatusBadge status={r.validation?.status || 'Pending'} />,
    },
    {
      key: 'remarks',
      label: 'Remarks',
      value: (r) => remarksMap[r._id] ?? r.validation?.remarks ?? '',
      render: (r) => (
        <input
          placeholder="Add remarks"
          value={remarksMap[r._id] ?? r.validation?.remarks ?? ''}
          onChange={(e) => setRemarksMap({ ...remarksMap, [r._id]: e.target.value })}
          style={{ marginBottom: 0, minWidth: 140 }}
        />
      ),
    },
    {
      key: 'action',
      label: 'Action',
      value: () => '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <button
            className="btn success"
            disabled={validating}
            onClick={() => handleValidate(r._id, 'Valid')}
            style={{ marginRight: 6, padding: '6px 12px' }}
          >
            Valid
          </button>
          <button
            className="btn danger"
            disabled={validating}
            onClick={() => handleValidate(r._id, 'Invalid')}
            style={{ padding: '6px 12px' }}
          >
            Invalid
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Validate Attendance Selfies</h1>
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
          rows={data?.records || []}
          emptyLabel="No records to validate."
          searchPlaceholder="Search records..."
          fileName="attendance-validation"
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
