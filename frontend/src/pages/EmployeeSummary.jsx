import { useEffect, useMemo, useState } from 'react';
import { useGetMyAttendanceQuery, useGetTodayStatusQuery } from '../features/api/attendanceApi';
import { useGetMyOvertimeQuery } from '../features/api/overtimeApi';
import MonthlyHoursChart from '../components/MonthlyHoursChart';
import StatusBreakdownBars from '../components/StatusBreakdownBars';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import { todayStr, formatDateLong, formatHours, formatMonthYear } from '../utils/format';
import { statusLabel } from '../utils/labels';

const MS_PER_HOUR = 1000 * 60 * 60;

function monthBounds() {
  const today = todayStr();
  const [y, m] = today.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  return { from: first, to: today, year: y, month: m };
}

export default function EmployeeSummary() {
  const { from, to, year, month } = useMemo(monthBounds, []);
  const { data: attData, isLoading: attLoading } = useGetMyAttendanceQuery({ from, to, limit: 100 });
  const { data: todayData } = useGetTodayStatusQuery(undefined, { pollingInterval: 30000 });
  const { data: otData } = useGetMyOvertimeQuery();

  const [now, setNow] = useState(() => Date.now());
  const today = todayData?.attendance;
  const isLive = !!today?.punchIn?.time && !today?.punchOut?.time;

  useEffect(() => {
    if (!isLive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const records = attData?.records || [];

  const liveHours = isLive ? (now - new Date(today.punchIn.time).getTime()) / MS_PER_HOUR : 0;

  const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0) + liveHours;
  const presentDays = records.filter((r) => r.status === 'Completed' || r.status === 'Incomplete').length;
  const avgHours = presentDays ? totalHours / presentDays : 0;

  const statusCounts = records.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { Completed: 0, Incomplete: 0, Absent: 0 }
  );

  const overtimeThisMonth = (otData?.requests || []).filter((o) => o.date >= from && o.date <= to);
  const pendingOvertime = overtimeThisMonth.filter((o) => o.status === 'Pending').length;
  const approvedOvertimeHours = overtimeThisMonth
    .filter((o) => o.status === 'Approved')
    .reduce((sum, o) => sum + o.requestedHours, 0);

  const daysInView = new Date(year, month, 0).getDate();
  const todayDayNum = Number(to.slice(-2));
  const lastDay = month === new Date().getMonth() + 1 && year === new Date().getFullYear() ? todayDayNum : daysInView;

  const byDate = new Map(records.map((r) => [r.date, r.totalHours || 0]));
  const chartDays = Array.from({ length: lastDay }, (_, i) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    let hours = byDate.get(dateStr) || 0;
    if (dateStr === to && isLive) hours = liveHours;
    return { date: dateStr, hours };
  });

  const monthLabel = formatMonthYear(year, month);
  const monthName = monthLabel.split(' ')[0];

  if (attLoading) return <Loading />;

  return (
    <div>
      <PageHeader title="لوحة المعلومات" subtitle={`ملخص شهر ${monthLabel}`} />

      <div className="grid grid-4 dashboard-stats">
        <div className="stat-box">
          <div className="value">{formatHours(isLive ? liveHours.toFixed(2) : today?.totalHours)}</div>
          <div className="label">{isLive ? 'ساعات اليوم (مباشر)' : 'ساعات اليوم'}</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatHours(totalHours.toFixed(1))}</div>
          <div className="label">إجمالي ساعات {monthName}</div>
        </div>
        <div className="stat-box">
          <div className="value">{presentDays}</div>
          <div className="label">أيام الحضور</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatHours(avgHours.toFixed(1))}</div>
          <div className="label">متوسط الساعات يومياً</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatHours(approvedOvertimeHours)}</div>
          <div className="label">العمل الإضافي المعتمد</div>
        </div>
        <div className="stat-box">
          <div className="value">{pendingOvertime}</div>
          <div className="label">طلبات إضافي قيد الانتظار</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatDateLong(todayStr())}</div>
          <div className="label">تاريخ اليوم</div>
        </div>
        <div className="stat-box">
          <div className="value">{today?.status ? statusLabel(today.status) : 'لم تسجّل حضورك'}</div>
          <div className="label">حالة اليوم</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="card-title">ساعات العمل — {monthLabel}</h3>
          <MonthlyHoursChart days={chartDays} todayDate={to} />
        </div>
        <div className="card">
          <h3 className="card-title">توزيع الحضور — {monthLabel}</h3>
          <StatusBreakdownBars
            items={[
              { label: statusLabel('Completed'), count: statusCounts.Completed, color: 'var(--color-success)' },
              { label: statusLabel('Incomplete'), count: statusCounts.Incomplete, color: 'var(--color-warning)' },
              { label: statusLabel('Absent'), count: statusCounts.Absent, color: 'var(--color-danger)' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
