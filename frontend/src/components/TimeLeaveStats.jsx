import { useState } from 'react';
import { useGetTimeLeaveStatsQuery, useGetTimeLeavesForReviewQuery } from '../features/api/timeLeaveApi';
import DataTable from './DataTable';
import StatusBadge from './StatusBadge';
import Loading from './Loading';
import Alert from './Alert';
import { formatMinutes, formatMonthYear, todayStr } from '../utils/format';
import { statusLabel } from '../utils/labels';
import { leaveTimeText, leaveTypeLabel, leaveUseText } from '../utils/timeLeave';

const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, year: y, month: m };
};
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const countCell = (n) => (n ? String(n) : '-');

// One employee's time leaves in the month
function EmployeeLeaves({ employee, range, onBack }) {
  const { data, isLoading, isError } = useGetTimeLeavesForReviewQuery({ userId: employee.id, from: range.from, to: range.to });
  if (isLoading) return <Loading />;
  if (isError) return <Alert type="error">تعذر تحميل زمنيات الموظف.</Alert>;
  const columns = [
    { key: 'date', label: 'التاريخ', value: (l) => l.date },
    {
      key: 'leave',
      label: 'الزمنية',
      value: (l) => `${leaveTypeLabel(l.type)} ${leaveTimeText(l)}`,
      render: (l) => (
        <span className="cell-stack">
          <strong>{leaveTypeLabel(l.type)}</strong>
          <small>{leaveTimeText(l)}</small>
        </span>
      ),
    },
    { key: 'reason', label: 'السبب', value: (l) => l.reason, wrap: true },
    {
      key: 'status',
      label: 'الحالة',
      value: (l) => statusLabel(l.status),
      render: (l) => (
        <span className="cell-stack">
          <StatusBadge status={l.status} />
          {l.reviewedBy?.name && <small>{l.reviewedBy.name}</small>}
        </span>
      ),
    },
    { key: 'use', label: 'الاستخدام', value: leaveUseText },
  ];
  return (
    <>
      <div className="timesheet-person">
        <button type="button" className="btn secondary btn-sm" onClick={onBack}>
          → كل الموظفين
        </button>
        <h2>{employee.name}</h2>
      </div>
      <DataTable
        exportTitle={`زمنيات ${employee.name} — ${formatMonthYear(range.year, range.month)}`}
        columns={columns}
        rows={data?.leaves || []}
        rowKey={(l) => l._id}
        emptyLabel="لا توجد زمنيات لهذا الموظف في هذا الشهر."
        searchPlaceholder="ابحث في الزمنيات..."
        fileName={`time-leaves-${employee.name}-${range.from.slice(0, 7)}`}
      />
    </>
  );
}

// How many time leaves (زمنيات) each employee had in a month
export default function TimeLeaveStats() {
  const thisMonth = todayStr().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [employee, setEmployee] = useState(null);
  const range = monthRange(month);
  const { data, isLoading, isError, error } = useGetTimeLeaveStatsQuery({ from: range.from, to: range.to });

  const columns = [
    {
      key: 'name',
      label: 'الموظف',
      value: (e) => e.user.name,
      render: (e) => (
        <span className="cell-stack">
          <strong>{e.user.name}</strong>
          {e.user.isActive === false && <small>حساب معطّل</small>}
        </span>
      ),
    },
    {
      key: 'approved',
      label: 'عدد الزمنيات المعتمدة',
      value: (e) => String(e.approved),
      render: (e) => (e.approved ? <span className="badge info">{e.approved}</span> : '0'),
    },
    { key: 'minutes', label: 'مجموع وقتها', value: (e) => (e.approvedMinutes ? formatMinutes(e.approvedMinutes) : '-') },
    { key: 'during', label: 'خروج والعودة', value: (e) => countCell(e.during) },
    { key: 'end', label: 'انصراف مبكر', value: (e) => countCell(e.end) },
    { key: 'start', label: 'تأخير', value: (e) => countCell(e.start) },
    { key: 'added', label: 'أضافتها الإدارة', value: (e) => countCell(e.added) },
    {
      key: 'pending',
      label: 'قيد الانتظار',
      value: (e) => countCell(e.pending),
      render: (e) => (e.pending ? <span className="badge warning">{e.pending}</span> : '-'),
    },
    { key: 'rejected', label: 'مرفوضة', value: (e) => countCell(e.rejected) },
    { key: 'cancelled', label: 'ملغاة', value: (e) => countCell(e.cancelled) },
    {
      key: 'action',
      label: 'التفاصيل',
      value: () => '',
      render: (e) => (
        <button type="button" className="btn secondary btn-sm" onClick={() => setEmployee(e.user)}>
          عرض الزمنيات
        </button>
      ),
    },
  ];

  const t = data?.totals;
  return (
    <>
      <div className="toolbar month-bar">
        <button type="button" className="btn secondary btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          → الشهر السابق
        </button>
        <strong className="month-label">{formatMonthYear(range.year, range.month)}</strong>
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={month >= thisMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          الشهر التالي ←
        </button>
        {month !== thisMonth && (
          <button type="button" className="btn secondary btn-sm" onClick={() => setMonth(thisMonth)}>
            هذا الشهر
          </button>
        )}
      </div>
      {employee ? (
        <EmployeeLeaves employee={employee} range={range} onBack={() => setEmployee(null)} />
      ) : isLoading ? (
        <Loading />
      ) : isError ? (
        <Alert type="error">{error?.data?.message || 'تعذر تحميل سجل الزمنيات.'}</Alert>
      ) : (
        <>
          <div className="grid grid-4 timesheet-totals">
            <div className="stat-box">
              <div className="value">{t.approved}</div>
              <div className="label">زمنيات معتمدة</div>
            </div>
            <div className="stat-box">
              <div className="value">{t.approvedMinutes ? formatMinutes(t.approvedMinutes) : '0'}</div>
              <div className="label">مجموع وقتها</div>
            </div>
            <div className="stat-box">
              <div className="value">{t.pending}</div>
              <div className="label">قيد الانتظار</div>
            </div>
            <div className="stat-box">
              <div className="value">{t.added}</div>
              <div className="label">أضافتها الإدارة</div>
            </div>
          </div>
          <DataTable
            exportTitle={`سجل الزمنيات — ${formatMonthYear(range.year, range.month)}`}
            columns={columns}
            rows={data.employees}
            rowKey={(e) => e.user.id}
            emptyLabel="لا يوجد موظفون لعرض زمنياتهم."
            searchPlaceholder="ابحث عن موظف..."
            fileName={`time-leaves-${range.from.slice(0, 7)}`}
          />
        </>
      )}
    </>
  );
}
