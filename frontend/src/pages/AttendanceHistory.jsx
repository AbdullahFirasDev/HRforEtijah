import { useState } from 'react';
import { useGetMyAttendanceQuery } from '../features/api/attendanceApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import AttendanceNotes from '../components/AttendanceNotes';
import SessionSelfies from '../components/SessionSelfies';
import { formatHours, formatTime } from '../utils/format';
import { statusLabel } from '../utils/labels';
import { notesText } from '../utils/attendance';

export default function AttendanceHistory() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading } = useGetMyAttendanceQuery(range);
  const [modalSrc, setModalSrc] = useState(null);

  const columns = [
    { key: 'date', label: 'التاريخ', value: (r) => r.date },
    { key: 'punchIn', label: 'وقت الحضور', value: (r) => formatTime(r.punchIn?.time) },
    { key: 'punchOut', label: 'وقت الانصراف', value: (r) => formatTime(r.punchOut?.time) },
    { key: 'totalHours', label: 'الساعات', value: (r) => formatHours(r.totalHours) },
    { key: 'status', label: 'الحالة', value: (r) => statusLabel(r.status), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'notes',
      label: 'ملاحظات',
      value: notesText,
      render: (r) => <AttendanceNotes record={r} />,
    },
    {
      key: 'validation',
      label: 'التحقق',
      value: (r) => statusLabel(r.validation?.status || 'Pending'),
      render: (r) => <StatusBadge status={r.validation?.status || 'Pending'} />,
    },
    {
      key: 'selfies',
      label: 'التحقق من الهوية',
      value: () => '',
      render: (r) => <SessionSelfies record={r} onOpen={setModalSrc} />,
    },
  ];

  return (
    <div>
      <PageHeader title="سجل حضوري" />

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
          exportTitle="سجل حضوري"
          columns={columns}
          rows={data?.records || []}
          emptyLabel="لا توجد سجلات حضور."
          searchPlaceholder="ابحث في السجل..."
          fileName="my-attendance-history"
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
