import { useEffect, useState } from 'react';
import CameraCapture from '../components/CameraCapture';
import StatusBadge from '../components/StatusBadge';
import AttendanceNotes from '../components/AttendanceNotes';
import ExtendTimePanel from '../components/ExtendTimePanel';
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import useGeolocation from '../utils/useGeolocation';
import { formatClock, formatClockTime, formatDateLong, formatHours, formatMinutes, formatTime } from '../utils/format';
import { openSessionOf, periodHours, sessionsOf } from '../utils/attendance';
import { shiftsText, weekLines } from '../utils/workSchedule';
import { dueDeparture, leaveTimeText, leaveTypeLabel, leaveUseText, pendingReturn } from '../utils/timeLeave';
import {
  useGetTodayStatusQuery,
  usePunchInMutation,
  usePunchOutMutation,
} from '../features/api/attendanceApi';

const DISMISSED_KEY = 'dismissedMissedPunchOuts';
// The countdown turns into a warning this close to the automatic close
const WARN_MINUTES = 15;

const readDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY)) || [];
  } catch {
    return [];
  }
};

export default function EmployeeDashboard() {
  // Polled so a period that closes by itself shows up without a reload
  const { data, isLoading, refetch } = useGetTodayStatusQuery(undefined, { pollingInterval: 60000 });
  const [punchIn, { isLoading: punchingIn }] = usePunchInMutation();
  const [punchOut, { isLoading: punchingOut }] = usePunchOutMutation();
  const { fetchLocation } = useGeolocation();

  const [selfie, setSelfie] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [extending, setExtending] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now, setNow] = useState(() => Date.now());

  const attendance = data?.attendance;
  const today = data?.today;
  const sessions = sessionsOf(attendance);
  const open = openSessionOf(attendance);
  const isWorking = !!open;
  const last = sessions[sessions.length - 1];
  const allowed = today?.maxSessions ?? 1;
  // Approved time leaves: the one a check-out now would start, and the one to come back from
  const leaves = today?.leaves || [];
  const returnLeave = pendingReturn(leaves);
  const dueLeave = isWorking ? dueDeparture(leaves) : null;
  const canPunchIn = !isWorking && (sessions.length < allowed || !!returnLeave);
  const nextPeriod = sessions.length + 1;
  const scheduleHours = shiftsText(today?.shifts);
  const todayWeekday = today ? new Date(`${today.date}T00:00:00Z`).getUTCDay() : null;
  const week = today?.week ? weekLines(today.week) : [];
  const closesAt = isWorking && attendance?.autoCloseAt ? new Date(attendance.autoCloseAt) : null;
  const minutesLeft = closesAt ? Math.max(0, Math.ceil((closesAt.getTime() - now) / 60000)) : null;
  const missed = (today?.recentMissed || []).filter((m) => !dismissed.includes(String(m.id)));

  useEffect(() => {
    if (!closesAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [closesAt]);

  const dismissMissed = () => {
    const next = [...dismissed, ...missed.map((m) => String(m.id))];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-30)));
    } catch {
      // Private mode: the notice simply comes back next time
    }
  };

  const handleAction = async (type) => {
    // Guard against double-clicks: geolocation lookup below can take seconds,
    // and punchingIn/punchingOut only flips once the mutation actually fires,
    // so without this a second click before that point fires a duplicate request.
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    if (!selfie) {
      setError('يرجى التقاط صورة مباشرة أولاً.');
      setSubmitting(false);
      return;
    }
    try {
      const loc = await fetchLocation();
      const payload = { selfie, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy };
      if (type === 'in') {
        const res = await punchIn(payload).unwrap();
        setSuccess(
          res.returnedFrom
            ? 'مرحباً بعودتك! سُجّلت عودتك من الزمنية.'
            : nextPeriod > 1
              ? `تم تسجيل حضور الفترة ${nextPeriod} بنجاح.`
              : 'تم تسجيل الحضور بنجاح.'
        );
      } else {
        const res = await punchOut({ ...payload, leaveId: dueLeave?._id }).unwrap();
        const more = sessions.length < allowed;
        if (res.leave) {
          setSuccess(
            res.leave.type === 'during'
              ? `تم تأكيد خروجك للزمنية. عُد قبل ${formatClock(res.leave.to)} وأكّد عودتك من هنا.`
              : 'تم تأكيد انصرافك بالزمنية المعتمدة. نراك غداً!'
          );
        } else {
          setSuccess(
            'تم تسجيل الانصراف بنجاح.' +
              (res.overtime ? ` أُرسل طلب عمل إضافي بـ ${formatHours(res.overtime.requestedHours)} إلى مديرك للموافقة.` : '') +
              (more ? ' إن عدت إلى العمل اليوم فسجّل حضور فترة جديدة.' : '')
          );
        }
      }
      setSelfie(null);
      setExtending(false);
      refetch();
    } catch (err) {
      setError(err?.data?.message || err?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.');
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <Loading />;

  const cardTitle = isWorking
    ? dueLeave
      ? 'التقط صورة لتأكيد خروجك للزمنية'
      : 'التقط صورة لتسجيل الانصراف'
    : returnLeave
      ? 'التقط صورة لتأكيد عودتك من الزمنية'
      : canPunchIn
      ? nextPeriod > 1
        ? `التقط صورة لبدء الفترة ${nextPeriod}`
        : 'التقط صورة لتسجيل الحضور'
      : 'اكتمل حضورك لهذا اليوم';

  return (
    <div>
      <PageHeader
        title="تسجيل الحضور والانصراف"
        subtitle={
          today?.dayOff
            ? sessions.length
              ? 'اليوم يوم إجازتك الأسبوعية.'
              : undefined // the notice below says it
            : scheduleHours
              ? `دوامك اليوم: ${scheduleHours}`
              : undefined
        }
      />

      {missed.length > 0 && (
        <Alert type="warning" title="لم تسجّل انصرافك" onClose={dismissMissed}>
          {missed.map((m) => (
            <span key={m.id} className="missed-line">
              يوم {formatDateLong(m.date)} أُغلق دوامك تلقائياً الساعة {m.closedAt.map(formatClockTime).join(' و')}.
            </span>
          ))}
          احرص على تسجيل الانصراف قبل مغادرتك، وإن عملت بعد ذلك الوقت فأبلغ مديرك.
        </Alert>
      )}

      {today?.dayOff && sessions.length === 0 && (
        <Alert type="info" title="اليوم يوم إجازتك الأسبوعية">
          إن طُلب منك العمل اليوم فسجّل حضورك كالمعتاد، وسيظهر سجلك بأنه عمل في يوم إجازة.
        </Alert>
      )}

      <div className="grid grid-3">
        <div className="stat-box">
          <div className="value">{formatTime(attendance?.punchIn?.time)}</div>
          <div className="label">{sessions.length > 1 ? 'أول حضور' : 'وقت الحضور'}</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatTime(attendance?.punchOut?.time)}</div>
          <div className="label">{sessions.length > 1 ? 'آخر انصراف' : 'وقت الانصراف'}</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatHours(attendance?.totalHours)}</div>
          <div className="label">ساعات العمل{today?.targetHours ? ` (المطلوب ${today.targetHours} س)` : ''}</div>
        </div>
      </div>

      {attendance?.status && (
        <div className="status-line">
          <span>
            حالة اليوم: <StatusBadge status={attendance.status} />
          </span>
          {attendance.validation?.status && attendance.validation.status !== 'Pending' && (
            <span>
              التحقق من الصورة: <StatusBadge status={attendance.validation.status} />
            </span>
          )}
          <AttendanceNotes record={attendance} empty={null} />
        </div>
      )}

      {(sessions.length > 1 || sessions.some((s) => s.punchOut?.auto || s.extendedUntil)) && (
        <div className="card card-narrow">
          <h3 className="card-title">فترات اليوم</h3>
          <ol className="session-list">
            {sessions.map((s, i) => (
              <li key={s.punchIn?.time || i}>
                <span className="session-num">{i + 1}</span>
                <span className="session-times">
                  من {formatTime(s.punchIn?.time)} إلى {s.punchOut?.time ? formatTime(s.punchOut.time) : 'الآن'}
                </span>
                {s.punchOut?.auto && <span className="badge danger">انصراف تلقائي</span>}
                {s.extendedUntil && <span className="badge info">ممدد حتى {formatClockTime(s.extendedUntil)}</span>}
                {s.punchOut?.time ? (
                  <span className="badge muted">{formatHours(periodHours(s))}</span>
                ) : (
                  <span className="badge info">جارية</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {success && <Alert type="success">{success}</Alert>}

      {leaves.length > 0 && (
        <div className="card card-narrow">
          <h3 className="card-title">زمنيات اليوم</h3>
          <ul className="week-list">
            {leaves.map((l) => (
              <li key={l._id}>
                <span className="cell-stack">
                  <strong>{leaveTypeLabel(l.type)}</strong>
                  <small>{leaveTimeText(l)}</small>
                </span>
                <span className="cell-stack">
                  <StatusBadge status={l.status} />
                  {l.status === 'Approved' && <small>{leaveUseText(l)}</small>}
                </span>
              </li>
            ))}
          </ul>
          {returnLeave && (
            <p className="form-note">
              أنت في زمنية حتى {formatClock(returnLeave.to)}. عند عودتك التقط صورة واضغط «تأكيد العودة من الزمنية».
            </p>
          )}
        </div>
      )}

      {closesAt && (
        <div className={`closing-banner${minutesLeft <= WARN_MINUTES ? ' is-soon' : ''}`} role="status">
          <p>
            {open.extendedUntil ? (
              <>
                وقتك ممدد حتى <strong>{formatClockTime(closesAt)}</strong>. سجّل انصرافك عند انتهائك؛ يُرسل الوقت الإضافي
                إلى مديرك للموافقة.
              </>
            ) : (
              <>
                يُغلق دوامك تلقائياً الساعة <strong>{formatClockTime(closesAt)}</strong> إن لم تسجّل انصرافك.
              </>
            )}{' '}
            <span className="closing-left">
              {minutesLeft > 0 ? `متبقٍ ${formatMinutes(minutesLeft)}` : 'انتهى الوقت، ويُغلق الآن'}
            </span>
          </p>
          {!extending && (
            <button type="button" className="btn secondary btn-sm" onClick={() => setExtending(true)}>
              {open.extendedUntil ? 'تمديد إضافي' : 'تمديد الوقت'}
            </button>
          )}
          {extending && (
            <ExtendTimePanel
              onCancel={() => setExtending(false)}
              onDone={(message) => {
                setExtending(false);
                setError('');
                setSuccess(message);
                refetch();
              }}
            />
          )}
        </div>
      )}

      <div className="card card-narrow">
        <h3 className="card-title">{cardTitle}</h3>

        {isWorking || canPunchIn ? (
          <>
            <CameraCapture capturedImage={selfie} onCapture={setSelfie} onRetake={() => setSelfie(null)} />
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Alert type="error">{error}</Alert>
              {canPunchIn && (
                <button
                  className="btn success btn-block"
                  disabled={submitting || punchingIn}
                  onClick={() => handleAction('in')}
                >
                  {submitting || punchingIn
                    ? 'جارٍ تسجيل الحضور...'
                    : returnLeave
                      ? 'تأكيد العودة من الزمنية'
                      : nextPeriod > 1
                      ? `تسجيل حضور الفترة ${nextPeriod}`
                      : 'تسجيل الحضور'}
                </button>
              )}
              {isWorking && (
                <button
                  className="btn danger btn-block"
                  disabled={submitting || punchingOut}
                  onClick={() => handleAction('out')}
                >
                  {submitting || punchingOut
                    ? 'جارٍ تسجيل الانصراف...'
                    : dueLeave
                      ? `تأكيد الخروج للزمنية (${formatClock(dueLeave.from)} – ${formatClock(dueLeave.to)})`
                      : 'تسجيل الانصراف'}
                </button>
              )}
            </div>
            <p className="form-note">سيُحدَّد موقعك تلقائياً عند تسجيل الحضور أو الانصراف، لذا اسمح للمتصفح بالوصول إلى الموقع.</p>
          </>
        ) : (
          <p className="empty-state">
            {last?.punchOut?.auto
              ? `أُغلق دوامك تلقائياً الساعة ${formatClockTime(last.punchOut.time)} لأنك لم تسجّل الانصراف. إن كنت ما زلت تعمل فأبلغ مديرك.`
              : today?.allowMultiplePunches && sessions.length >= allowed
                ? `وصلت إلى الحد الأقصى لفترات اليوم (${allowed} فترات). نراك غداً!`
                : 'انتهى يوم عملك. نراك غداً!'}
          </p>
        )}
      </div>

      {week.length > 0 && (
        <div className="card card-narrow">
          <h3 className="card-title">دوامك الأسبوعي</h3>
          <ul className="week-list">
            {week.map((l) => (
              <li key={l.day} className={[l.day === todayWeekday && 'is-today', l.off && 'is-off'].filter(Boolean).join(' ')}>
                <span className="week-list-day">
                  {l.name}
                  {l.day === todayWeekday && <span className="badge info">اليوم</span>}
                </span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
