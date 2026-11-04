import { useGetTeamAttendanceQuery } from '../features/api/attendanceApi';
import AttendanceDays from '../components/AttendanceDays';
import DateRangeFilter from '../components/DateRangeFilter';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import useAttendanceDays from '../utils/useAttendanceDays';

export default function TeamAttendance() {
  const { range, setRange, records, isLoading, hasMore, loadingMore, showMore } = useAttendanceDays(useGetTeamAttendanceQuery);

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
        <AttendanceDays
          records={records}
          exportTitle="حضور الفريق"
          fileName="team-attendance"
          emptyLabel="لا توجد سجلات حضور لفريقك."
          searchPlaceholder="ابحث في حضور الفريق..."
          hasMore={hasMore}
          loadingMore={loadingMore}
          onShowMore={showMore}
        />
      )}
    </div>
  );
}
