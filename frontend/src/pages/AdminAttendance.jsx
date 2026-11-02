import { useState } from 'react';
import { useDeleteAttendanceMutation, useGetAllAttendanceQuery } from '../features/api/attendanceApi';
import StatusBadge from '../components/StatusBadge';
import SelfieModal from '../components/SelfieModal';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import Alert from '../components/Alert';
import AttendanceNotes from '../components/AttendanceNotes';
import SessionSelfies from '../components/SessionSelfies';
import DeleteAttendanceModal from '../components/DeleteAttendanceModal';
import { formatHours, formatTime } from '../utils/format';
import { statusLabel } from '../utils/labels';
import { notesText } from '../utils/attendance';

export default function AdminAttendance() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, isLoading } = useGetAllAttendanceQuery(range);
  const [deleteAttendance, { isLoading: deleting }] = useDeleteAttendanceMutation();
  const [modalSrc, setModalSrc] = useState(null);
  const [selected, setSelected] = useState([]);
  const [toDelete, setToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');

  const rows = data?.records || [];
  // Only rows still on screen count (the date filter may have hidden some)
  const selectedRows = rows.filter((r) => selected.includes(String(r._id)));

  const askDelete = () => {
    setDeleteError('');
    setSuccess('');
    setToDelete(selectedRows);
  };

  const confirmDelete = async () => {
    try {
      const res = await deleteAttendance(toDelete.map((r) => r._id)).unwrap();
      const { attendance, overtime } = res.deleted;
      setSuccess(
        `تم حذف ${attendance === 1 ? 'سجل حضور واحد' : `${attendance} من سجلات الحضور`}` +
          (overtime ? ` و${overtime === 1 ? 'طلب عمل إضافي مرتبط به' : `${overtime} من طلبات العمل الإضافي المرتبطة`}.` : '.')
      );
      setSelected((prev) => prev.filter((key) => !toDelete.some((r) => String(r._id) === key)));
      setToDelete(null);
    } catch (err) {
      setDeleteError(err?.data?.message || 'تعذر حذف السجلات. حاول مرة أخرى.');
    }
  };

  const columns = [
    { key: 'employee', label: 'الموظف', value: (r) => r.user?.name },
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
      key: 'selfie',
      label: 'الصورة',
      value: () => '',
      render: (r) => <SessionSelfies record={r} onOpen={setModalSrc} firstOnly />,
    },
  ];

  return (
    <div>
      <PageHeader title="سجل الحضور العام" subtitle="لحذف سجلات خاطئة حدّدها من المربع بجانب كل سجل، ثم اضغط «حذف المحدد»." />
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

      {selectedRows.length > 0 && (
        <div className="selection-bar" role="status">
          <span>
            تم تحديد {selectedRows.length === 1 ? 'سجل واحد' : `${selectedRows.length} سجلات`}
          </span>
          <button type="button" className="btn danger btn-sm" onClick={askDelete}>
            حذف المحدد
          </button>
          <button type="button" className="btn secondary btn-sm" onClick={() => setSelected([])}>
            إلغاء التحديد
          </button>
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          exportTitle="سجل الحضور العام"
          columns={columns}
          rows={rows}
          emptyLabel="لا توجد سجلات حضور."
          searchPlaceholder="ابحث في سجل الحضور..."
          fileName="all-attendance"
          selected={selected}
          onSelectedChange={setSelected}
        />
      )}
      {toDelete && (
        <DeleteAttendanceModal
          records={toDelete}
          deleting={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
      <SelfieModal src={modalSrc} onClose={() => setModalSrc(null)} />
    </div>
  );
}
