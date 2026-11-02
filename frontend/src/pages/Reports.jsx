import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetDailyReportQuery } from '../features/api/userApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import { formatTime, todayStr } from '../utils/format';

export default function Reports() {
  const user = useSelector(selectCurrentUser);
  const [range, setRange] = useState({ from: todayStr(), to: todayStr() });
  const [modalSrc, setModalSrc] = useState(null);

  const { data, isLoading } = useGetDailyReportQuery(range);

  const columns = [
    { key: 'name', label: 'Name', value: (r) => r.name },
    { key: 'date', label: 'Date', value: (r) => r.date },
    { key: 'punchIn', label: 'Punch In', value: (r) => formatTime(r.punchInTime) },
    { key: 'punchOut', label: 'Punch Out', value: (r) => formatTime(r.punchOutTime) },
    {
      key: 'location',
      label: 'Location',
      value: (r) => (r.location ? `${r.location.lat.toFixed(3)}, ${r.location.lng.toFixed(3)}` : '-'),
    },
    { key: 'totalHours', label: 'Hours', value: (r) => `${r.totalHours || 0}h` },
    { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'validation',
      label: 'Validation',
      value: (r) => r.validationStatus || 'Pending',
      render: (r) => <StatusBadge status={r.validationStatus || 'Pending'} />,
    },
    {
      key: 'selfie',
      label: 'Selfie',
      value: () => '',
      render: (r) =>
        r.punchInSelfie && (
          <img className="selfie-thumb" src={r.punchInSelfie} alt="selfie" onClick={() => setModalSrc(r.punchInSelfie)} />
        ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>
        {user?.role === 'employee' ? 'My Reports' : user?.role === 'manager' ? 'Team Reports' : 'System-wide Reports'}
      </h1>

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
          rows={data?.report || []}
          emptyLabel="No records found for the selected filters."
          searchPlaceholder="Search reports..."
          fileName="attendance-report"
          rowKey={(row, i) => row.id || i}
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
