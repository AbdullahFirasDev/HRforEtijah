import { useState } from 'react';
import CameraCapture from '../components/CameraCapture';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import useGeolocation from '../utils/useGeolocation';
import { formatHours, formatTime } from '../utils/format';
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
  const hasPunchedIn = !!attendance?.punchIn?.time;
  const hasPunchedOut = !!attendance?.punchOut?.time;

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
      const payload = { selfie, lat: loc.lat, lng: loc.lng };
      if (type === 'in') {
        await punchIn(payload).unwrap();
        setSuccess('تم تسجيل الحضور بنجاح.');
      } else {
        await punchOut(payload).unwrap();
        setSuccess('تم تسجيل الانصراف بنجاح.');
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

  return (
    <div>
      <PageHeader title="تسجيل الحضور والانصراف" />

      <div className="grid grid-3">
        <div className="stat-box">
          <div className="value">{formatTime(attendance?.punchIn?.time)}</div>
          <div className="label">وقت الحضور</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatTime(attendance?.punchOut?.time)}</div>
          <div className="label">وقت الانصراف</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatHours(attendance?.totalHours)}</div>
          <div className="label">ساعات العمل</div>
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
        </div>
      )}

      {success && <Alert type="success">{success}</Alert>}

      <div className="card card-narrow">
        <h3 className="card-title">
          {!hasPunchedIn
            ? 'التقط صورة لتسجيل الحضور'
            : !hasPunchedOut
              ? 'التقط صورة لتسجيل الانصراف'
              : 'اكتمل حضورك لهذا اليوم'}
        </h3>

        {!hasPunchedIn || !hasPunchedOut ? (
          <>
            <CameraCapture capturedImage={selfie} onCapture={setSelfie} onRetake={() => setSelfie(null)} />
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Alert type="error">{error}</Alert>
              {!hasPunchedIn && (
                <button
                  className="btn success btn-block"
                  disabled={submitting || punchingIn}
                  onClick={() => handleAction('in')}
                >
                  {submitting || punchingIn ? 'جارٍ تسجيل الحضور...' : 'تسجيل الحضور'}
                </button>
              )}
              {hasPunchedIn && !hasPunchedOut && (
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
          <p className="empty-state">انتهى يوم عملك. نراك غداً!</p>
        )}
      </div>
    </div>
  );
}
