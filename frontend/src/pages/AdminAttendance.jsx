import { useState } from 'react';
import { useGetAllAttendanceQuery } from '../features/api/attendanceApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import { formatTime } from '../utils/format';

export default function AdminAttendance() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading } = useGetAllAttendanceQuery(range);
  const [modalSrc, setModalSrc] = useState(null);

  const columns = [
    { key: 'employee', label: 'Employee', value: (r) => r.user?.name },
    { key: 'date', label: 'Date', value: (r) => r.date },
    { key: 'punchIn', label: 'Punch In', value: (r) => formatTime(r.punchIn?.time) },
    { key: 'punchOut', label: 'Punch Out', value: (r) => formatTime(r.punchOut?.time) },
    { key: 'totalHours', label: 'Hours', value: (r) => `${r.totalHours || 0}h` },
    { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'validation',
      label: 'Validation',
      value: (r) => r.validation?.status || 'Pending',
      render: (r) => <StatusBadge status={r.validation?.status || 'Pending'} />,
    },
    {
      key: 'selfie',
      label: 'Selfie',
      value: () => '',
      render: (r) =>
        r.punchIn?.selfie && (
          <img className="selfie-thumb" src={r.punchIn.selfie} alt="selfie" onClick={() => setModalSrc(r.punchIn.selfie)} />
        ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>System-wide Attendance</h1>

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
          emptyLabel="No attendance records found."
          searchPlaceholder="Search attendance..."
          fileName="all-attendance"
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
