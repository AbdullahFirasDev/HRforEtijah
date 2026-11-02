import { useState } from 'react';
import { useGetMyAttendanceQuery } from '../features/api/attendanceApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import { formatTime } from '../utils/format';

export default function AttendanceHistory() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading } = useGetMyAttendanceQuery(range);
  const [modalSrc, setModalSrc] = useState(null);

  const columns = [
    { key: 'date', label: 'Date', value: (r) => r.date },
    { key: 'punchIn', label: 'Punch In', value: (r) => formatTime(r.punchIn?.time), render: (r) => formatTime(r.punchIn?.time) },
    { key: 'punchOut', label: 'Punch Out', value: (r) => formatTime(r.punchOut?.time), render: (r) => formatTime(r.punchOut?.time) },
    { key: 'totalHours', label: 'Hours', value: (r) => `${r.totalHours || 0}h` },
    { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'validation',
      label: 'Validation',
      value: (r) => r.validation?.status || 'Pending',
      render: (r) => <StatusBadge status={r.validation?.status || 'Pending'} />,
    },
    {
      key: 'selfies',
      label: 'Selfies',
      value: () => '',
      render: (r) => (
        <>
          {r.punchIn?.selfie && (
            <img
              className="selfie-thumb"
              src={r.punchIn.selfie}
              alt="in"
              onClick={() => setModalSrc(r.punchIn.selfie)}
              style={{ marginRight: 6 }}
            />
          )}
          {r.punchOut?.selfie && (
            <img className="selfie-thumb" src={r.punchOut.selfie} alt="out" onClick={() => setModalSrc(r.punchOut.selfie)} />
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>My Attendance History</h1>

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
          fileName="my-attendance-history"
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
