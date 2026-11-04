import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetDailyReportQuery } from '../features/api/userApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import AttendanceNotes from '../components/AttendanceNotes';
import LocationCell from '../components/LocationCell';
import { formatHours, formatTime, todayStr } from '../utils/format';
import { statusLabel } from '../utils/labels';
import { locationText, notesText } from '../utils/attendance';

const TITLES = { employee: 'تقاريري', manager: 'تقارير الفريق', admin: 'تقارير النظام' };

export default function Reports() {
  const user = useSelector(selectCurrentUser);
  const [range, setRange] = useState({ from: todayStr(), to: todayStr() });
  const [modalSrc, setModalSrc] = useState(null);

  const { data, isLoading } = useGetDailyReportQuery(range);
  const title = TITLES[user?.role] || 'التقارير';

  const columns = [
    { key: 'name', label: 'الاسم', value: (r) => r.name },
    { key: 'date', label: 'التاريخ', value: (r) => r.date },
    { key: 'punchIn', label: 'وقت الحضور', value: (r) => formatTime(r.punchInTime) },
    { key: 'punchOut', label: 'وقت الانصراف', value: (r) => formatTime(r.punchOutTime) },
    {
      key: 'location',
      label: 'الموقع',
      value: (r) => locationText(r.location),
      render: (r) => <LocationCell location={r.location} />,
    },
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
      value: (r) => statusLabel(r.validationStatus || 'Pending'),
      render: (r) => <StatusBadge status={r.validationStatus || 'Pending'} />,
    },
    {
      key: 'selfie',
      label: 'التحقق من الهوية',
      value: () => '',
      render: (r) =>
        r.faceVerified ? (
          <span className="badge success">وجه مطابق</span>
        ) : (
          r.punchInSelfie && (
          <img
            className="selfie-thumb"
            src={r.punchInSelfie}
            alt="صورة الحضور"
            onClick={() => setModalSrc(r.punchInSelfie)}
          />
          )
        ),
    },
  ];

  return (
    <div>
      <PageHeader title={title} />

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
          exportTitle={title}
          columns={columns}
          rows={data?.report || []}
          emptyLabel="لا توجد سجلات للفترة المحددة."
          searchPlaceholder="ابحث في التقرير..."
          fileName="attendance-report"
          rowKey={(row, i) => row.id || i}
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
