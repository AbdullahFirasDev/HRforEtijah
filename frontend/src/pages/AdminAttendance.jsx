import { useState } from 'react';
import { useDeleteAttendanceMutation, useGetAllAttendanceQuery } from '../features/api/attendanceApi';
import AttendanceDays from '../components/AttendanceDays';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import Alert from '../components/Alert';
import DeleteAttendanceModal from '../components/DeleteAttendanceModal';
import EditTimesModal from '../components/EditTimesModal';
import useAttendanceDays from '../utils/useAttendanceDays';

export default function AdminAttendance() {
  const { range, setRange, records, isLoading, hasMore, loadingMore, showMore } = useAttendanceDays(useGetAllAttendanceQuery);
  const [deleteAttendance, { isLoading: deleting }] = useDeleteAttendanceMutation();
  const [selected, setSelected] = useState([]);
  const [toDelete, setToDelete] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');

  // Only records still on screen count (the date filter may have hidden some)
  const selectedRows = records.filter((r) => selected.includes(String(r._id)));

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

  return (
    <div>
      <PageHeader title="سجل الحضور العام" subtitle="حدّد سجلاً من المربع بجانبه لتعديل أوقات حضوره وانصرافه، أو حدّد سجلاً أو أكثر لحذفها. ولإضافة يوم لم يُسجَّل فيه حضور استخدم «الكشف الشهري»." />
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
          {selectedRows.length === 1 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setSuccess('');
                setEditing(selectedRows[0]);
              }}
            >
              تعديل الأوقات
            </button>
          )}
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
        <AttendanceDays
          records={records}
          exportTitle="سجل الحضور العام"
          fileName="all-attendance"
          emptyLabel="لا توجد سجلات حضور."
          searchPlaceholder="ابحث في سجل الحضور..."
          selected={selected}
          onSelectedChange={setSelected}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onShowMore={showMore}
        />
      )}
      {editing && (
        <EditTimesModal
          recordId={editing._id}
          userName={editing.user?.name}
          date={editing.date}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setSelected([]);
            setSuccess(message);
          }}
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
    </div>
  );
}
