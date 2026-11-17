import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetTimesheetQuery, useGetTimesheetSummaryQuery, useReapplyScheduleMutation } from '../features/api/timesheetApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Loading from '../components/Loading';
import Alert from '../components/Alert';
import EditTimesModal from '../components/EditTimesModal';
import TimeLeaveModal from '../components/TimeLeaveModal';
import { formatClock, formatClockTime, formatHours, formatMinutes, formatMonthYear, todayStr } from '../utils/format';
import { leaveTypeLabel } from '../utils/timeLeave';
import { attendanceNotes, notesText } from '../utils/attendance';
import { DAY_NAMES, shiftsText } from '../utils/workSchedule';
import { statusLabel } from '../utils/labels';

const STATES = {
  present: { label: 'حاضر', variant: 'success' },
  offWorked: { label: 'عمل في إجازة', variant: 'info' },
  absent: { label: 'غائب', variant: 'danger' },
  onLeave: { label: 'مجاز', variant: 'leave' },
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

// e.g. "+1 س 30 د", "−45 د", "0"
const signedMinutes = (m) => (m ? `${m > 0 ? '+' : '−'}${formatMinutes(Math.abs(m))}` : '0');
const daysText = (n) => `${n} ${n === 1 ? 'يوم' : n === 2 ? 'يومان' : 'أيام'}`;
const countText = (days, minutes) => (days ? `${daysText(days)} · ${formatMinutes(minutes)}` : '-');
const minutesCell = (m) => (m ? formatMinutes(m) : '-');

// The approved leave on the day: "اعتيادية · 2026-0007", or a note that the
// employee worked during it anyway
const leaveNote = (d) => {
  if (!d.leave) return '';
  const what = `${d.leave.typeName}${d.leave.paid ? '' : ' (بدون راتب)'}`;
  return d.state === 'onLeave' ? `${what} · ${d.leave.number}` : `عمل خلال إجازة مقبولة: ${what}`;
};

// The notes a timesheet day shows, in the shape attendanceNotes() reads
// (minute counts have their own columns)
const dayNotes = (d) => ({
  missedPunchOut: d.missedPunchOut,
  sessionsCount: d.periods,
  dayOff: d.state === 'offWorked',
  edited: d.edited,
});

// The day's approved time leaves (زمنيات)
const approvedLeaves = (d) => d.timeLeaves.filter((l) => l.status === 'Approved');
// e.g. "زمنية 10:00 ص – 12:00 م (تأخير عن بداية الدوام)، محتسب 2 س"
const approvedLeavesText = (d) => {
  const list = approvedLeaves(d);
  if (!list.length) return '';
  const what = list.map((l) => `زمنية ${formatClock(l.from)} – ${formatClock(l.to)} (${leaveTypeLabel(l.type)})`).join('، ');
  return d.leaveMinutes ? `${what}، محتسب ${formatMinutes(d.leaveMinutes)}` : what;
};

// Time leaves of the day not decided yet, e.g. "زمنية بانتظار القرار 10:00–12:00"
const pendingLeavesText = (d) =>
  d.timeLeaves
    .filter((l) => l.status === 'Pending')
    .map((l) => `زمنية بانتظار القرار ${l.from}–${l.to}`)
    .join('، ');
const shortText = (d) =>
  [
    d.absentMinutes > 0 && `غياب ${formatMinutes(d.absentMinutes)}`,
    d.shortMinutes > 0 && `خروج/فترة غير محضورة ${formatMinutes(d.shortMinutes)}`,
    d.autoCloses > 1 && `انصراف تلقائي ${d.autoCloses} مرات`,
  ]
    .filter(Boolean)
    .join('، ');

function NoteBadges({ day }) {
  const notes = attendanceNotes(dayNotes(day));
  const short = shortText(day);
  const pending = pendingLeavesText(day);
  if (!notes.length && !short && !pending && !day.overtimeRequest && !day.planOutdated && !day.wrongDay && !day.leave) return '-';
  return (
    <span className="notes-cell">
      {day.leave && <span className={`badge ${day.state === 'onLeave' ? 'muted' : 'info'}`}>{leaveNote(day)}</span>}
      {short && <span className="badge danger">{short}</span>}
      {pending && <span className="badge warning">{pending}</span>}
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
      label: 'ساعات العمل / المطلوبة',
      value: `${formatHours(t.workedHours)} / ${formatHours(t.targetHours)}`,
      sub: `المطلوب للشهر كاملاً حسب الجدول: ${formatHours(t.monthTargetHours)}`,
    },
    {
      label: 'الفرق (الرصيد)',
      value: signedMinutes(t.balanceMinutes),
      tone: t.balanceMinutes < 0 ? 'neg' : 'pos',
      sub: 'الإضافي والحضور المبكر ناقص التأخير والانصراف المبكر والغياب',
    },
    {
      label: 'أيام الحضور / الغياب / الإجازة',
      value: `${t.presentDays} / ${t.absentDays} / ${t.offDays}`,
      sub: t.onLeaveDays ? `مجاز (إجازات مقبولة): ${daysText(t.onLeaveDays)}` : undefined,
    },
    {
      label: 'الانصراف التلقائي (لم يسجّل الانصراف)',
      value: t.autoCloses ? `${t.autoCloses} ${t.autoCloses === 1 ? 'مرة' : 'مرات'}` : '0',
      tone: t.autoCloses ? 'neg' : undefined,
      sub: t.missedPunchOuts ? `في ${daysText(t.missedPunchOuts)}` : undefined,
    },
  ];
  // How the balance is made up: the lines add up to it
  const parts = [
    { key: 'earlyArrival', label: 'الحضور المبكر', sign: 1, days: t.earlyArrivalDays, minutes: t.earlyArrivalMinutes, sub: 'قبل بداية الدوام' },
    {
      key: 'overtime',
      label: 'العمل الإضافي',
      sign: 1,
      days: t.overtimeDays,
      minutes: t.overtimeMinutes,
      sub:
        t.overtimeApprovedHours || t.overtimePendingHours
          ? `طلبات: معتمد ${formatHours(t.overtimeApprovedHours)} · قيد الانتظار ${formatHours(t.overtimePendingHours)}`
          : 'بعد نهاية الدوام وفي أيام الإجازة',
    },
    { key: 'late', label: 'الحضور المتأخر', sign: -1, days: t.lateDays, minutes: t.lateMinutes, sub: 'بعد بداية الدوام أو العودة من زمنية' },
    { key: 'earlyLeave', label: 'الانصراف المبكر', sign: -1, days: t.earlyLeaveDays, minutes: t.earlyLeaveMinutes, sub: 'قبل نهاية الدوام' },
    t.shortMinutes > 0 && {
      key: 'short',
      label: 'خروج أثناء الدوام',
      sign: -1,
      days: t.shortDays,
      minutes: t.shortMinutes,
      sub: 'بلا زمنية، أو فترة دوام لم يحضرها',
    },
    t.absentMinutes > 0 && { key: 'absent', label: 'الغياب', sign: -1, days: t.absentDays, minutes: t.absentMinutes, sub: 'أيام دوام بلا حضور' },
  ].filter(Boolean);

  return (
    <>
      <div className="grid grid-4 timesheet-totals">
        {items.map((i) => (
          <div key={i.label} className={`stat-box${i.tone ? ` tone-${i.tone}` : ''}`}>
            <div className="value">{i.value}</div>
            <div className="label">{i.label}</div>
            {i.sub && <div className="sub">{i.sub}</div>}
          </div>
        ))}
      </div>
      <div className="balance-breakdown" role="group" aria-label="تفصيل الفرق">
        {parts.map((p) => (
          <div key={p.key} className={`balance-part ${p.sign > 0 ? 'is-plus' : 'is-minus'}`}>
            <span className="balance-sign" aria-hidden="true">
              {p.sign > 0 ? '+' : '−'}
            </span>
            <span className="balance-body">
              <strong>{p.minutes ? formatMinutes(p.minutes) : '0'}</strong>
              <span>{p.label}</span>
              <small>{p.days ? `${daysText(p.days)} · ${p.sub}` : p.sub}</small>
            </span>
          </div>
        ))}
        <div className="balance-part is-neutral">
          <span className="balance-sign" aria-hidden="true">
            ز
          </span>
          <span className="balance-body">
            <strong>{t.timeLeaveCount ? `${t.timeLeaveCount} ${t.timeLeaveCount === 1 ? 'زمنية' : 'زمنيات'}` : 'لا زمنيات'}</strong>
            <span>الزمنيات المعتمدة</span>
            <small>
              {t.timeLeaveCount
                ? `في ${daysText(t.timeLeaveDays)} · ${formatMinutes(t.timeLeaveRequestedMinutes)}، محتسب منها ${formatMinutes(t.leaveMinutes)} (لا تُحسب تأخيراً)`
                : 'لم تُعتمد زمنيات في هذه الفترة'}
              {t.timeLeavePendingCount ? ` · ${t.timeLeavePendingCount} بانتظار القرار` : ''}
            </small>
          </span>
        </div>
        <div className={`balance-part is-total ${t.balanceMinutes < 0 ? 'is-minus' : 'is-plus'}`}>
          <span className="balance-sign" aria-hidden="true">
            =
          </span>
          <span className="balance-body">
            <strong>{signedMinutes(t.balanceMinutes)}</strong>
            <span>الفرق</span>
            <small>مجموع البنود الموجبة والسالبة</small>
          </span>
        </div>
      </div>
      {t.todayInProgress && <p className="form-note">اليوم لم ينتهِ بعد، فلا يدخل في المجاميع حتى نهاية الدوام.</p>}
    </>
  );
}

function TimesheetDetail({ userId, range, onBack, canEdit, canGrant }) {
  const { data, isLoading, isError, error } = useGetTimesheetQuery({ userId, from: range.from, to: range.to });
  const [editing, setEditing] = useState(null); // the day being corrected
  const [leaveDay, setLeaveDay] = useState(null); // the day getting a time leave
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
        {approvedLeaves(d).length > 0 && (
          <span className="badge info">{approvedLeaves(d).length > 1 ? `${approvedLeaves(d).length} زمنيات` : 'زمنية'}</span>
        )}
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
    { key: 'earlyArrival', label: 'حضور مبكر', value: (d) => minutesCell(d.earlyArrivalMinutes) },
    {
      key: 'late',
      label: 'تأخير',
      value: (d) => minutesCell(d.lateMinutes),
      render: (d) => (d.lateMinutes ? <span className="badge warning">{formatMinutes(d.lateMinutes)}</span> : '-'),
    },
    {
      key: 'earlyLeave',
      label: 'انصراف مبكر',
      value: (d) => minutesCell(d.earlyLeaveMinutes),
      render: (d) => (d.earlyLeaveMinutes ? <span className="badge warning">{formatMinutes(d.earlyLeaveMinutes)}</span> : '-'),
    },
    {
      key: 'overtime',
      label: 'إضافي',
      value: (d) => minutesCell(d.overtimeMinutes),
      render: (d) => (d.overtimeMinutes ? <span className="badge info">{formatMinutes(d.overtimeMinutes)}</span> : '-'),
    },
    {
      key: 'timeLeaves',
      label: 'زمنية',
      wrap: true,
      value: (d) => approvedLeavesText(d) || '-',
      render: (d) => {
        const list = approvedLeaves(d);
        if (!list.length) return '-';
        return (
          <span className="cell-stack">
            {list.map((l) => (
              <span key={l.id}>
                <span className="badge info" dir="ltr">
                  {l.from}–{l.to}
                </span>{' '}
                <small>
                  {leaveTypeLabel(l.type)}
                  {l.added ? ' · أضافتها الإدارة' : ''}
                </small>
              </span>
            ))}
            {d.leaveMinutes > 0 && <small>محتسب: {formatMinutes(d.leaveMinutes)}</small>}
          </span>
        );
      },
    },
    {
      key: 'balance',
      label: 'الفرق',
      value: (d) => (d.counted ? signedMinutes(d.balanceMinutes) : 'جارٍ'),
      render: (d) =>
        !d.counted ? (
          <span className="badge muted">جارٍ</span>
        ) : d.balanceMinutes ? (
          <span className={`badge ${d.balanceMinutes < 0 ? 'danger' : 'success'}`}>{signedMinutes(d.balanceMinutes)}</span>
        ) : (
          '0'
        ),
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
        [
          leaveNote(d),
          shortText(d),
          pendingLeavesText(d),
          notesText(dayNotes(d)),
          d.overtimeRequest && `طلب إضافي ${d.overtimeRequest.hours} س: ${statusLabel(d.overtimeRequest.status)}`,
        ]
          .filter(Boolean)
          .join('، '),
      render: (d) => <NoteBadges day={d} />,
    },
  ];
  // Admins correct times, or record a day the employee never checked in;
  // managers and admins add or correct a time leave (زمنية) on any working day
  if (canEdit || canGrant) {
    columns.push({
      key: 'edit',
      label: 'إجراءات',
      value: () => '',
      render: (d) => (
        <span className="row-actions">
          {canEdit && (
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
          )}
          {canGrant && !d.dayOff && (
            <button
              type="button"
              className={`btn btn-sm${d.uncovered.length ? '' : ' secondary'}`}
              title={d.uncovered.length ? 'في هذا اليوم وقت غير مبرر يمكن احتسابه زمنية' : undefined}
              onClick={() => {
                setSaved('');
                setLeaveDay(d);
              }}
            >
              {d.timeLeaves.length ? `زمنية (${d.timeLeaves.length})` : 'زمنية'}
            </button>
          )}
        </span>
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
      {leaveDay && (
        <TimeLeaveModal
          employee={{ id: data.user.id, name: data.user.name }}
          date={leaveDay.date}
          shifts={leaveDay.shifts}
          leaves={leaveDay.timeLeaves}
          uncovered={leaveDay.uncovered}
          onClose={() => setLeaveDay(null)}
          onSaved={(message) => {
            setLeaveDay(null);
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
    { key: 'onLeave', label: 'مجاز', value: (e) => (e.totals.onLeaveDays ? String(e.totals.onLeaveDays) : '-') },
    {
      key: 'hours',
      label: 'الساعات / المطلوب',
      value: (e) => `${formatHours(e.totals.workedHours)} / ${formatHours(e.totals.targetHours)}`,
    },
    {
      key: 'balance',
      label: 'الفرق',
      value: (e) => signedMinutes(e.totals.balanceMinutes),
      render: (e) => (
        <span className={`badge ${e.totals.balanceMinutes < 0 ? 'danger' : 'success'}`}>{signedMinutes(e.totals.balanceMinutes)}</span>
      ),
    },
    { key: 'earlyArrival', label: 'حضور مبكر', value: (e) => minutesCell(e.totals.earlyArrivalMinutes) },
    { key: 'late', label: 'التأخير', value: (e) => countText(e.totals.lateDays, e.totals.lateMinutes) },
    { key: 'earlyLeave', label: 'انصراف مبكر', value: (e) => countText(e.totals.earlyLeaveDays, e.totals.earlyLeaveMinutes) },
    { key: 'overtime', label: 'الإضافي', value: (e) => minutesCell(e.totals.overtimeMinutes) },
    {
      key: 'leaves',
      label: 'عدد الزمنيات',
      value: (e) =>
        e.totals.timeLeaveCount ? `${e.totals.timeLeaveCount} · ${formatMinutes(e.totals.timeLeaveRequestedMinutes)}` : '-',
      render: (e) =>
        e.totals.timeLeaveCount ? (
          <span className="cell-stack">
            <span className="badge info">{e.totals.timeLeaveCount}</span>
            <small>{formatMinutes(e.totals.timeLeaveRequestedMinutes)}</small>
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'missed',
      label: 'انصراف تلقائي',
      value: (e) => String(e.totals.autoCloses),
      render: (e) => (e.totals.autoCloses ? <span className="badge danger">{e.totals.autoCloses}</span> : '0'),
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
          canGrant={oversees}
        />
      )}
    </div>
  );
}
