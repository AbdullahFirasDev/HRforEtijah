import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetTimesheetQuery, useGetTimesheetSummaryQuery, useReapplyScheduleMutation } from '../features/api/timesheetApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Loading from '../components/Loading';
import Alert from '../components/Alert';
import EditTimesModal from '../components/EditTimesModal';
import { formatClockTime, formatHours, formatMinutes, formatMonthYear, todayStr } from '../utils/format';
import { attendanceNotes, notesText } from '../utils/attendance';
import { DAY_NAMES, shiftsText } from '../utils/workSchedule';
import { statusLabel } from '../utils/labels';

const STATES = {
  present: { label: 'حاضر', variant: 'success' },
  offWorked: { label: 'عمل في إجازة', variant: 'info' },
  absent: { label: 'غائب', variant: 'danger' },
  off: { label: 'إجازة', variant: 'muted' },
  pending: { label: 'لم يحضر بعد', variant: 'warning' },
};

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

// e.g. "09:00 ص – 05:00 م", "إجازة" or "دوام مرن"
const planText = (dayOff, shifts) => (dayOff ? 'إجازة' : shiftsText(shifts) || 'دوام مرن');

const signedHours = (h) => `${h > 0 ? '+' : ''}${formatHours(h)}`;
const countText = (days, minutes) => (days ? `${days} ${days === 1 ? 'يوم' : 'أيام'} · ${formatMinutes(minutes)}` : '-');

// The notes a timesheet day shows, in the shape attendanceNotes() reads
const dayNotes = (d) => ({
  lateMinutes: d.lateMinutes,
  earlyLeaveMinutes: d.earlyLeaveMinutes,
  missedPunchOut: d.missedPunchOut,
  overtimeMinutes: d.overtimeMinutes,
  sessionsCount: d.periods,
  dayOff: d.state === 'offWorked',
  edited: d.edited,
  leaveMinutes: d.leaveMinutes,
});

function NoteBadges({ day }) {
  const notes = attendanceNotes(dayNotes(day));
  if (!notes.length && !day.overtimeRequest && !day.planOutdated && !day.wrongDay) return '-';
  return (
    <span className="notes-cell">
      {day.planOutdated && <span className="badge warning">حُسب على دوام سابق</span>}
      {day.wrongDay && <span className="badge danger">تاريخ لا يطابق وقت الحضور</span>}
      {notes.map((n) => (
        <span key={n.key} className={`badge ${n.variant}`}>
          {n.text}
        </span>
      ))}
      {day.overtimeRequest && (
        <span className="badge muted">
          طلب إضافي {formatHours(day.overtimeRequest.hours)}: {statusLabel(day.overtimeRequest.status)}
        </span>
      )}
    </span>
  );
}

function Totals({ totals }) {
  const t = totals;
  const items = [
    {
      label: 'ساعات العمل / المطلوبة حتى اليوم',
      value: `${formatHours(t.workedHours)} / ${formatHours(t.targetHours)}`,
      sub: `المطلوب للشهر كاملاً حسب الجدول: ${formatHours(t.monthTargetHours)}`,
    },
    { label: 'الفرق', value: signedHours(t.balanceHours), tone: t.balanceHours < 0 ? 'neg' : 'pos' },
    { label: 'أيام الحضور / الغياب / الإجازة', value: `${t.presentDays} / ${t.absentDays} / ${t.offDays}` },
    { label: 'الزمنيات (إذن بالساعة)', value: t.leaveMinutes ? formatMinutes(t.leaveMinutes) : '0' },
    { label: 'التأخير', value: countText(t.lateDays, t.lateMinutes) },
    { label: 'الانصراف المبكر', value: countText(t.earlyLeaveDays, t.earlyLeaveMinutes) },
    {
      label: 'العمل الإضافي (معتمد / قيد الانتظار)',
      value: `${formatMinutes(t.overtimeMinutes)} (${formatHours(t.overtimeApprovedHours)} / ${formatHours(t.overtimePendingHours)})`,
    },
    { label: 'انصراف تلقائي (لم يسجّل الانصراف)', value: t.missedPunchOuts, tone: t.missedPunchOuts ? 'neg' : undefined },
  ];
  return (
    <div className="grid grid-4 timesheet-totals">
      {items.map((i) => (
        <div key={i.label} className={`stat-box${i.tone ? ` tone-${i.tone}` : ''}`}>
          <div className="value">{i.value}</div>
          <div className="label">{i.label}</div>
          {i.sub && <div className="sub">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function TimesheetDetail({ userId, range, onBack, canEdit }) {
  const { data, isLoading, isError, error } = useGetTimesheetQuery({ userId, from: range.from, to: range.to });
  const [editing, setEditing] = useState(null); // the day being corrected
  const [saved, setSaved] = useState('');
  const [reapply, { isLoading: reapplying }] = useReapplyScheduleMutation();
  const [reapplyError, setReapplyError] = useState('');
  if (isLoading) return <Loading />;
  if (isError) return <Alert type="error">{error?.data?.message || 'تعذر تحميل الكشف الشهري.'}</Alert>;

  // Days still to come (or before the account existed) aren't part of the sheet yet
  const rows = data.days.filter((d) => STATES[d.state]);
  const columns = [
    { key: 'date', label: 'التاريخ', value: (d) => `${d.date} ${DAY_NAMES[d.weekday]}`, render: (d) => (
      <span className="cell-stack">
        <strong>{d.date}</strong>
        <small>{DAY_NAMES[d.weekday]}</small>
      </span>
    ) },
    {
      key: 'plan',
      label: 'الدوام المحدد',
      wrap: true,
      value: (d) =>
        (d.dayOff ? 'إجازة' : shiftsText(d.shifts) || 'دوام مرن') + (d.planOutdated ? ` (الجدول الحالي: ${planText(d.currentDayOff, d.currentShifts)})` : ''),
      render: (d) => (
        <span className="cell-stack">
          <span>{planText(d.dayOff, d.shifts)}</span>
          {d.planOutdated && <small className="cell-warning">الجدول الحالي: {planText(d.currentDayOff, d.currentShifts)}</small>}
        </span>
      ),
    },
    { key: 'in', label: 'الحضور', value: (d) => (d.firstIn ? formatClockTime(d.firstIn) : '-') },
    {
      key: 'out',
      label: 'الانصراف',
      value: (d) => (d.lastOut ? formatClockTime(d.lastOut) : '-'),
    },
    {
      key: 'hours',
      label: 'الساعات / المطلوب',
      value: (d) => `${formatHours(d.workedHours)} / ${formatHours(d.targetHours)}`,
    },
    {
      key: 'state',
      label: 'الحالة',
      value: (d) => STATES[d.state].label,
      render: (d) => <span className={`badge ${STATES[d.state].variant}`}>{STATES[d.state].label}</span>,
    },
    {
      key: 'notes',
      label: 'ملاحظات',
      wrap: true,
      value: (d) =>
        [notesText(dayNotes(d)), d.overtimeRequest && `طلب إضافي ${d.overtimeRequest.hours} س: ${statusLabel(d.overtimeRequest.status)}`]
          .filter(Boolean)
          .join('، '),
      render: (d) => <NoteBadges day={d} />,
    },
  ];
  // Admins correct times, or record a day the employee never checked in
  if (canEdit) {
    columns.push({
      key: 'edit',
      label: 'تعديل',
      value: () => '',
      render: (d) => (
        <button
          type="button"
          className="btn secondary btn-sm"
          onClick={() => {
            setSaved('');
            setEditing(d);
          }}
        >
          {d.recordId ? 'تعديل الأوقات' : 'إضافة حضور'}
        </button>
      ),
    });
  }

  const recalculate = async () => {
    setSaved('');
    setReapplyError('');
    try {
      const res = await reapply({ userId: data.user.id, from: range.from, to: range.to }).unwrap();
      setSaved(`أُعيد حساب ${res.changed} من أيام ${data.user.name} حسب جدول دوامه الحالي.`);
    } catch (err) {
      setReapplyError(err?.data?.message || 'تعذرت إعادة الحساب. حاول مرة أخرى.');
    }
  };
  const { outdatedDays, wrongDays } = data.totals;

  return (
    <>
      {onBack && (
        <div className="timesheet-person">
          <button type="button" className="btn secondary btn-sm" onClick={onBack}>
            → كل الموظفين
          </button>
          <h2>{data.user.name}</h2>
        </div>
      )}
      <Alert type="success" onClose={() => setSaved('')}>
        {saved}
      </Alert>
      <Alert type="error" onClose={() => setReapplyError('')}>
        {reapplyError}
      </Alert>
      {outdatedDays > 0 && (
        <div className="schedule-mismatch" role="status">
          <p>
            <strong>
              {outdatedDays === 1 ? 'يوم واحد' : `${outdatedDays} أيام`} في هذا الشهر حُسب على دوام يختلف عن جدول {data.user.name} الحالي.
            </strong>{' '}
            سُجّلت قبل تحديد جدوله أو تعديله، فبقيت على الدوام الذي كان ساري المفعول وقتها (معلَّمة بـ «حُسب على دوام سابق»).
          </p>
          {canEdit ? (
            <button type="button" className="btn btn-sm" disabled={reapplying} onClick={recalculate}>
              {reapplying ? 'جارٍ إعادة الحساب...' : 'إعادة حساب هذه الأيام حسب الجدول الحالي'}
            </button>
          ) : (
            <p className="form-note">يستطيع مسؤول النظام إعادة حسابها حسب الجدول الحالي.</p>
          )}
        </div>
      )}
      {wrongDays > 0 && (
        <Alert type="warning" title="أيام بتاريخ غير مطابق">
          {wrongDays === 1 ? 'سجلّ واحد' : `${wrongDays} سجلات`} حضور مساءً قبل تصحيح توقيت النظام فظهر في اليوم التالي (معلَّم بـ «تاريخ
          لا يطابق وقت الحضور»). {canEdit ? 'راجع أوقاته وعدّلها أو احذف السجل.' : 'أبلغ مسؤول النظام لمراجعته.'}
        </Alert>
      )}
      {editing && (
        <EditTimesModal
          recordId={editing.recordId}
          userId={data.user.id}
          userName={data.user.name}
          date={editing.date}
          shifts={editing.dayOff ? [] : editing.shifts}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setSaved(message);
          }}
        />
      )}
      <Totals totals={data.totals} />
      <DataTable
        exportTitle={`الكشف الشهري لـ ${data.user.name} — ${formatMonthYear(range.year, range.month)}`}
        columns={columns}
        rows={rows}
        rowKey={(d) => d.date}
        emptyLabel="لا توجد أيام في هذه الفترة بعد."
        searchPlaceholder="ابحث في الأيام..."
        fileName={`timesheet-${data.user.email}-${range.from.slice(0, 7)}`}
      />
    </>
  );
}

function TimesheetSummary({ range, onOpen }) {
  const { data, isLoading, isError, error } = useGetTimesheetSummaryQuery({ from: range.from, to: range.to });
  if (isLoading) return <Loading />;
  if (isError) return <Alert type="error">{error?.data?.message || 'تعذر تحميل الكشف الشهري.'}</Alert>;

  const columns = [
    {
      key: 'name',
      label: 'الموظف',
      value: (e) => e.user.name,
      render: (e) => (
        <span className="cell-stack">
          <strong>{e.user.name}</strong>
          {e.totals.outdatedDays > 0 && <small className="cell-warning">{e.totals.outdatedDays} يوم على دوام سابق</small>}
        </span>
      ),
    },
    { key: 'days', label: 'حضور / غياب', value: (e) => `${e.totals.presentDays} / ${e.totals.absentDays}` },
    {
      key: 'hours',
      label: 'الساعات / المطلوب',
      value: (e) => `${formatHours(e.totals.workedHours)} / ${formatHours(e.totals.targetHours)}`,
    },
    {
      key: 'balance',
      label: 'الفرق',
      value: (e) => signedHours(e.totals.balanceHours),
      render: (e) => (
        <span className={`badge ${e.totals.balanceHours < 0 ? 'danger' : 'success'}`}>{signedHours(e.totals.balanceHours)}</span>
      ),
    },
    { key: 'late', label: 'التأخير', value: (e) => countText(e.totals.lateDays, e.totals.lateMinutes) },
    { key: 'overtime', label: 'الإضافي', value: (e) => (e.totals.overtimeMinutes ? formatMinutes(e.totals.overtimeMinutes) : '-') },
    { key: 'leaves', label: 'الزمنيات', value: (e) => (e.totals.leaveMinutes ? formatMinutes(e.totals.leaveMinutes) : '-') },
    {
      key: 'missed',
      label: 'انصراف تلقائي',
      value: (e) => String(e.totals.missedPunchOuts),
      render: (e) =>
        e.totals.missedPunchOuts ? <span className="badge danger">{e.totals.missedPunchOuts}</span> : '0',
    },
    {
      key: 'action',
      label: 'التفاصيل',
      value: () => '',
      render: (e) => (
        <button type="button" className="btn secondary btn-sm" onClick={() => onOpen(e.user.id)}>
          عرض الأيام
        </button>
      ),
    },
  ];

  return (
    <DataTable
      exportTitle={`الكشف الشهري — ${formatMonthYear(range.year, range.month)}`}
      columns={columns}
      rows={data.employees}
      rowKey={(e) => e.user.id}
      emptyLabel="لا يوجد موظفون لعرض كشوفهم."
      searchPlaceholder="ابحث عن موظف..."
      fileName={`timesheets-${range.from.slice(0, 7)}`}
    />
  );
}

// Timesheets: employees see their own month; managers and admins see a
// summary of the people they oversee and can open anyone's days.
export default function Timesheets() {
  const me = useSelector(selectCurrentUser);
  const oversees = me?.role === 'manager' || me?.role === 'admin';
  const thisMonth = todayStr().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [userId, setUserId] = useState(null);
  const range = monthRange(month);

  return (
    <div>
      <PageHeader
        title="الكشف الشهري"
        subtitle={
          oversees
            ? 'ملخص حضور الموظفين وساعاتهم لكل شهر: الغياب والتأخير والعمل الإضافي ومن لم يسجّل انصرافه.'
            : 'حضورك وساعات عملك لكل يوم من الشهر، مع التأخير والعمل الإضافي.'
        }
      />
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
      {oversees && !userId ? (
        <TimesheetSummary range={range} onOpen={setUserId} />
      ) : (
        <TimesheetDetail
          userId={oversees ? userId : null}
          range={range}
          onBack={oversees ? () => setUserId(null) : null}
          canEdit={me?.role === 'admin'}
        />
      )}
    </div>
  );
}
