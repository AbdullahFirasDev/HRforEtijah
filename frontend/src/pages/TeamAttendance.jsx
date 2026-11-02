import { useState } from 'react';
import { useGetTeamAttendanceQuery } from '../features/api/attendanceApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import { formatHours, formatTime } from '../utils/format';
import { statusLabel } from '../utils/labels';

export default function TeamAttendance() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading } = useGetTeamAttendanceQuery(range);
  const [modalSrc, setModalSrc] = useState(null);

  const columns = [
    { key: 'employee', label: 'الموظف', value: (r) => r.user?.name },
    { key: 'date', label: 'التاريخ', value: (r) => r.date },
    { key: 'punchIn', label: 'وقت الحضور', value: (r) => formatTime(r.punchIn?.time) },
    { key: 'punchOut', label: 'وقت الانصراف', value: (r) => formatTime(r.punchOut?.time) },
    { key: 'totalHours', label: 'الساعات', value: (r) => formatHours(r.totalHours) },
    { key: 'status', label: 'الحالة', value: (r) => statusLabel(r.status), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'validation',
      label: 'التحقق',
      value: (r) => statusLabel(r.validation?.status || 'Pending'),
      render: (r) => <StatusBadge status={r.validation?.status || 'Pending'} />,
    },
    {
      key: 'selfie',
      label: 'الصورة',
      value: () => '',
      render: (r) =>
        r.punchIn?.selfie && (
          <img
            className="selfie-thumb"
            src={r.punchIn.selfie}
            alt="صورة الحضور"
            onClick={() => setModalSrc(r.punchIn.selfie)}
          />
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="حضور الفريق" />

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
          exportTitle="حضور الفريق"
          columns={columns}
          rows={data?.records || []}
          emptyLabel="لا توجد سجلات حضور لفريقك."
          searchPlaceholder="ابحث في حضور الفريق..."
          fileName="team-attendance"
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
