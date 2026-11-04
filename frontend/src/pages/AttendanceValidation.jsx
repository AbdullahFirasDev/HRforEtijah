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
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import SessionSelfies from '../components/SessionSelfies';
import LocationCell from '../components/LocationCell';
import { statusLabel } from '../utils/labels';
import { farthestText, locationText } from '../utils/attendance';

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
  const [success, setSuccess] = useState('');

  const handleValidate = async (r, status) => {
    setError('');
    setSuccess('');
    try {
      await validateAttendance({ id: r._id, status, remarks: remarksMap[r._id] || '' }).unwrap();
      setSuccess(`تم اعتماد سجل ${r.user?.name || 'الموظف'} بتاريخ ${r.date} على أنه "${statusLabel(status)}".`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر حفظ نتيجة التحقق. حاول مرة أخرى.');
    }
  };

  const columns = [
    { key: 'employee', label: 'الموظف', value: (r) => r.user?.name },
    { key: 'date', label: 'التاريخ', value: (r) => r.date },
    {
      key: 'selfies',
      label: 'التحقق من الهوية',
      value: () => '',
      render: (r) => <SessionSelfies record={r} onOpen={setModalSrc} />,
    },
    {
      key: 'location',
      label: 'موقع الحضور',
      value: (r) => [locationText(r.punchIn?.location), farthestText(r)].filter(Boolean).join(' · '),
      render: (r) => <LocationCell location={r.punchIn?.location} farthest={farthestText(r)} />,
    },
    {
      key: 'validation',
      label: 'التحقق',
      value: (r) => statusLabel(r.validation?.status || 'Pending'),
      render: (r) => <StatusBadge status={r.validation?.status || 'Pending'} />,
    },
    {
      key: 'remarks',
      label: 'الملاحظات',
      value: (r) => remarksMap[r._id] ?? r.validation?.remarks ?? '',
      render: (r) => (
        <input
          className="input-sm"
          placeholder="أضف ملاحظة"
          aria-label={`ملاحظة على سجل ${r.user?.name || ''}`}
          value={remarksMap[r._id] ?? r.validation?.remarks ?? ''}
          onChange={(e) => setRemarksMap({ ...remarksMap, [r._id]: e.target.value })}
          style={{ minWidth: 140 }}
        />
      ),
    },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (r) => (
        <span className="row-actions">
          <button className="btn success btn-sm" disabled={validating} onClick={() => handleValidate(r, 'Valid')}>
            صحيح
          </button>
          <button className="btn danger btn-sm" disabled={validating} onClick={() => handleValidate(r, 'Invalid')}>
            غير صحيح
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="التحقق من الحضور" subtitle="السجلات الجديدة يُتحقق منها تلقائياً بمطابقة الوجه. راجع الموقع، أو صور السجلات القديمة، واعتمد السجل أو ارفضه." />
      <Alert type="error" onClose={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>

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
          exportTitle="التحقق من الحضور"
          columns={columns}
          rows={data?.records || []}
          emptyLabel="لا توجد سجلات للتحقق."
          searchPlaceholder="ابحث في السجلات..."
          fileName="attendance-validation"
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
