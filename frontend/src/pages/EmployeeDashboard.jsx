import { useEffect, useState } from 'react';
import FaceCapture from '../components/FaceCapture';
import StatusBadge from '../components/StatusBadge';
import AttendanceNotes from '../components/AttendanceNotes';
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import useGeolocation from '../utils/useGeolocation';
import { formatClock, formatClockTime, formatDateLong, formatHours, formatMinutes, formatTime, formatTimer } from '../utils/format';
import { isExtended, openSessionOf, periodHours, sessionsOf } from '../utils/attendance';
import { shiftsText, weekLines } from '../utils/workSchedule';
import { dueDeparture, leaveTimeText, leaveTypeLabel, leaveUseText, pendingReturn } from '../utils/timeLeave';
import {
  useEnrollFaceMutation,
  useExtendSessionMutation,
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

  const [enrollFace, { isLoading: enrolling }] = useEnrollFaceMutation();
  const [extendSession, { isLoading: extending }] = useExtendSessionMutation();
  const [enrollingFace, setEnrollingFace] = useState(false);
  // Which punch the face check on screen is for: 'in', 'out' or none
  const [scanning, setScanning] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
  // Extended time runs until checking out, so it has a timer instead of a countdown
  const extraFrom = open?.extendedFrom ? new Date(open.extendedFrom) : null;
  const closesAt = isWorking && !extraFrom && attendance?.autoCloseAt ? new Date(attendance.autoCloseAt) : null;
  const minutesLeft = closesAt ? Math.max(0, Math.ceil((closesAt.getTime() - now) / 60000)) : null;
  // The period stays open a few minutes after its end so leaving on time is possible
  const lastCall = closesAt ? new Date(closesAt.getTime() + (today?.closeGraceMinutes || 0) * 60000) : null;
  const graceLeft = lastCall ? Math.max(0, Math.ceil((lastCall.getTime() - now) / 60000)) : null;
  const missed = (today?.recentMissed || []).filter((m) => !dismissed.includes(String(m.id)));

  const ticking = !!closesAt || !!extraFrom;
  useEffect(() => {
    if (!ticking) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), extraFrom ? 1000 : 30000);
    return () => clearInterval(id);
  }, [ticking, !!extraFrom]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissMissed = () => {
    const next = [...dismissed, ...missed.map((m) => String(m.id))];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-30)));
    } catch {
      // Private mode: the notice simply comes back next time
    }
  };

  const startScan = (type) => {
    setError('');
    setSuccess('');
    setScanning(type);
  };

  const handleExtend = async () => {
    setError('');
    setSuccess('');
    try {
      await extendSession().unwrap();
      setSuccess('تم تمديد وقتك. يستمر العدّ حتى تسجّل انصرافك.');
      refetch();
    } catch (err) {
      setError(err?.data?.message || 'تعذر تمديد الوقت. حاول مرة أخرى.');
    }
  };

  const handleEnroll = async (print) => {
    setEnrollingFace(false);
    setError('');
    try {
      await enrollFace({ face: print, consent: true }).unwrap();
      setSuccess('تم تسجيل بصمة وجهك. ستتحقق بها عند كل حضور وانصراف.');
      refetch();
    } catch (err) {
      setError(err?.data?.message || 'تعذر تسجيل بصمة الوجه. حاول مرة أخرى.');
    }
  };

  const handleAction = async (type, print) => {
    // Guard against double-clicks: geolocation lookup below can take seconds,
    // and punchingIn/punchingOut only flips once the mutation actually fires,
    // so without this a second click before that point fires a duplicate request.
    if (submitting) return;
    setScanning(null);
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const loc = await fetchLocation();
      const payload = { face: print, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy };
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
      ? 'تأكيد خروجك للزمنية'
      : 'تسجيل الانصراف'
    : returnLeave
      ? 'تأكيد عودتك من الزمنية'
      : canPunchIn
      ? nextPeriod > 1
        ? `بدء الفترة ${nextPeriod}`
        : 'تسجيل الحضور'
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
          <AttendanceNotes record={attendance} empty={null} />
        </div>
      )}

      {(sessions.length > 1 || sessions.some((s) => s.punchOut?.auto || isExtended(s))) && (
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
                {isExtended(s) && <span className="badge warning">وقت ممدد</span>}
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
              أنت في زمنية حتى {formatClock(returnLeave.to)}. عند عودتك اضغط «تأكيد العودة من الزمنية» وتحقق من وجهك.
            </p>
          )}
        </div>
      )}

      {extraFrom && (
        <div className="closing-banner is-extended">
          <div className="extended-clock">
            <small>الوقت الإضافي</small>
            <strong role="timer" dir="ltr">
              {formatTimer(now - extraFrom.getTime())}
            </strong>
          </div>
          <p>
            {now >= extraFrom.getTime() ? (
              <>
                انتهى دوامك الساعة <strong>{formatClockTime(extraFrom)}</strong>. يستمر العدّ حتى تسجّل انصرافك، وإن بلغ الوقت
                الإضافي 30 دقيقة يُرسل إلى مديرك للموافقة.
              </>
            ) : (
              <>
                يبدأ العدّ عند نهاية دوامك الساعة <strong>{formatClockTime(extraFrom)}</strong> ويستمر حتى تسجّل انصرافك.
              </>
            )}
          </p>
          <button
            type="button"
            className="btn danger btn-sm"
            disabled={!!scanning || submitting}
            onClick={() => startScan('out')}
          >
            إنهاء الوقت وتسجيل الانصراف
          </button>
          <small className="extended-note">
            إن نسيت تسجيل الانصراف يُغلق بعد {today?.extensionLimitHours} ساعة، ولا يُحتسب الوقت الممدد إلا بتصحيح من مسؤول النظام.
          </small>
        </div>
      )}

      {closesAt && (
        <div className={`closing-banner${minutesLeft <= WARN_MINUTES ? ' is-soon' : ''}`} role="status">
          <p>
            ينتهي دوامك الساعة <strong>{formatClockTime(closesAt)}</strong>. إن لم تسجّل انصرافك حتى{' '}
            <strong>{formatClockTime(lastCall)}</strong> يُغلق تلقائياً.{' '}
            <span className="closing-left">
              {minutesLeft > 0
                ? `متبقٍ ${formatMinutes(minutesLeft)}`
                : graceLeft > 0
                  ? `انتهى الوقت، سجّل انصرافك خلال ${formatMinutes(graceLeft)}`
                  : 'انتهى الوقت، ويُغلق الآن'}
            </span>
          </p>
          <button type="button" className="btn secondary btn-sm" disabled={extending} onClick={handleExtend}>
            {extending ? 'جارٍ التمديد...' : 'تمديد الوقت'}
          </button>
        </div>
      )}

      <div className="card card-narrow">
        <h3 className="card-title">{cardTitle}</h3>

        {!today?.faceEnrolled ? (
          <>
            <p className="manage-text">
              تسجيل الحضور والانصراف يتم بالتحقق من الوجه. سجّل بصمة وجهك مرة واحدة قبل البدء.
            </p>
            <Alert type="info" title="ماذا يُحفظ؟">
              تُحوَّل ملامح وجهك على جهازك إلى بصمة رقمية تُحفظ مشفّرة، وتُستخدم فقط للتأكد من هويتك عند الحضور والانصراف. لا تُحفظ
              أي صورة لوجهك، ويستطيع مسؤول النظام حذف البصمة في أي وقت.
            </Alert>
            <Alert type="error">{error}</Alert>
            {enrollingFace ? (
              <FaceCapture purpose="enroll" onCapture={handleEnroll} onCancel={() => setEnrollingFace(false)} />
            ) : (
              <button
                className="btn btn-block"
                disabled={enrolling}
                onClick={() => {
                  setError('');
                  setEnrollingFace(true);
                }}
              >
                {enrolling ? 'جارٍ حفظ بصمة الوجه...' : 'أوافق، سجّل بصمة وجهي'}
              </button>
            )}
          </>
        ) : scanning ? (
          <FaceCapture onCapture={(print) => handleAction(scanning, print)} onCancel={() => setScanning(null)} />
        ) : isWorking || canPunchIn ? (
          <>
            <div>
              <Alert type="error">{error}</Alert>
              {canPunchIn && (
                <button
                  className="btn success btn-block"
                  disabled={submitting || punchingIn}
                  onClick={() => startScan('in')}
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
                  onClick={() => startScan('out')}
                >
                  {submitting || punchingOut
                    ? 'جارٍ تسجيل الانصراف...'
                    : dueLeave
                      ? `تأكيد الخروج للزمنية (${formatClock(dueLeave.from)} – ${formatClock(dueLeave.to)})`
                      : 'تسجيل الانصراف'}
                </button>
              )}
            </div>
            <p className="form-note">
              عند الضغط يُطلب منك التحقق من وجهك ويُحدَّد موقعك، لذا اسمح للمتصفح بالوصول إلى الكاميرا والموقع.
            </p>
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
