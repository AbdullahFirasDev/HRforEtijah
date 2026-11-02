import { useEffect, useMemo, useState } from 'react';
import { useGetMyAttendanceQuery, useGetTodayStatusQuery } from '../features/api/attendanceApi';
import { useGetMyOvertimeQuery } from '../features/api/overtimeApi';
import MonthlyHoursChart from '../components/MonthlyHoursChart';
import StatusBreakdownBars from '../components/StatusBreakdownBars';
import { todayStr, formatDateLong } from '../utils/format';

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

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (attLoading) return <p>Loading...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>My Dashboard</h1>
      <p style={{ color: 'var(--color-muted)', marginTop: 0, marginBottom: 20 }}>{monthLabel} overview</p>

      <div className="grid grid-4 dashboard-stats">
        <div className="stat-box">
          <div className="value">{isLive ? liveHours.toFixed(2) : today?.totalHours || 0}h</div>
          <div className="label">{isLive ? "Today's Live Hours" : "Today's Hours"}</div>
        </div>
        <div className="stat-box">
          <div className="value">{totalHours.toFixed(1)}h</div>
          <div className="label">Total Hours ({monthLabel.split(' ')[0]})</div>
        </div>
        <div className="stat-box">
          <div className="value">{presentDays}</div>
          <div className="label">Present Days</div>
        </div>
        <div className="stat-box">
          <div className="value">{avgHours.toFixed(1)}h</div>
          <div className="label">Avg Hours / Day</div>
        </div>
        <div className="stat-box">
          <div className="value">{approvedOvertimeHours}h</div>
          <div className="label">Overtime Approved</div>
        </div>
        <div className="stat-box">
          <div className="value">{pendingOvertime}</div>
          <div className="label">Overtime Pending</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatDateLong(todayStr())}</div>
          <div className="label">Today's Date</div>
        </div>
        <div className="stat-box">
          <div className="value">{today?.status || 'Not Punched In'}</div>
          <div className="label">Today's Status</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3 className="card-title">Hours Worked — {monthLabel}</h3>
          <MonthlyHoursChart days={chartDays} todayDate={to} />
        </div>
        <div className="card">
          <h3 className="card-title">Attendance Breakdown — {monthLabel}</h3>
          <StatusBreakdownBars
            items={[
              { label: 'Completed', count: statusCounts.Completed, color: 'var(--color-success)' },
              { label: 'Incomplete', count: statusCounts.Incomplete, color: 'var(--color-warning)' },
              { label: 'Absent', count: statusCounts.Absent, color: 'var(--color-danger)' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
