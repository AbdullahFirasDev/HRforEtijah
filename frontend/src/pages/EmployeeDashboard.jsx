import { useState } from 'react';
import CameraCapture from '../components/CameraCapture';
import StatusBadge from '../components/StatusBadge';
import AttendanceNotes from '../components/AttendanceNotes';
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import useGeolocation from '../utils/useGeolocation';
import { formatHours, formatTime } from '../utils/format';
import { openSessionOf, periodHours, sessionsOf } from '../utils/attendance';
import { hoursText } from '../utils/workSchedule';
import {
  useGetTodayStatusQuery,
  usePunchInMutation,
  usePunchOutMutation,
} from '../features/api/attendanceApi';

export default function EmployeeDashboard() {
  const { data, isLoading, refetch } = useGetTodayStatusQuery();
  const [punchIn, { isLoading: punchingIn }] = usePunchInMutation();
  const [punchOut, { isLoading: punchingOut }] = usePunchOutMutation();
  const { fetchLocation } = useGeolocation();

  const [selfie, setSelfie] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const attendance = data?.attendance;
  const today = data?.today;
  const sessions = sessionsOf(attendance);
  const isWorking = !!openSessionOf(attendance);
  const multiple = !!today?.allowMultiplePunches;
  // A first check-in, or another period for staff allowed several a day
  const canPunchIn = !isWorking && (sessions.length === 0 || (multiple && sessions.length < today.maxSessions));
  const nextPeriod = sessions.length + 1;
  const scheduleHours = hoursText(today);

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
        await punchIn(payload).unwrap();
        setSuccess(nextPeriod > 1 ? `تم تسجيل حضور الفترة ${nextPeriod} بنجاح.` : 'تم تسجيل الحضور بنجاح.');
      } else {
        await punchOut(payload).unwrap();
        setSuccess(
          multiple && sessions.length < today.maxSessions
            ? 'تم تسجيل الانصراف بنجاح. إن عدت إلى العمل اليوم فسجّل حضور فترة جديدة.'
            : 'تم تسجيل الانصراف بنجاح.'
        );
      }
      setSelfie(null);
      refetch();
    } catch (err) {
      setError(err?.data?.message || err?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <Loading />;

  const cardTitle = isWorking
    ? 'التقط صورة لتسجيل الانصراف'
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

      {sessions.length > 1 && (
        <div className="card card-narrow">
          <h3 className="card-title">فترات اليوم</h3>
          <ol className="session-list">
            {sessions.map((s, i) => (
              <li key={s.punchIn?.time || i}>
                <span className="session-num">{i + 1}</span>
                <span className="session-times">
                  من {formatTime(s.punchIn?.time)} إلى {s.punchOut?.time ? formatTime(s.punchOut.time) : 'الآن'}
                </span>
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
                  {submitting || punchingOut ? 'جارٍ تسجيل الانصراف...' : 'تسجيل الانصراف'}
                </button>
              )}
            </div>
            <p className="form-note">سيُحدَّد موقعك تلقائياً عند تسجيل الحضور أو الانصراف، لذا اسمح للمتصفح بالوصول إلى الموقع.</p>
          </>
        ) : (
          <p className="empty-state">
            {multiple && sessions.length >= today.maxSessions
              ? `وصلت إلى الحد الأقصى لفترات اليوم (${today.maxSessions} فترات). نراك غداً!`
              : 'انتهى يوم عملك. نراك غداً!'}
          </p>
        )}
      </div>
    </div>
  );
}
