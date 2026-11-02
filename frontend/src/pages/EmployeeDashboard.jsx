import { useState } from 'react';
import CameraCapture from '../components/CameraCapture';
import StatusBadge from '../components/StatusBadge';
import useGeolocation from '../utils/useGeolocation';
import { formatTime } from '../utils/format';
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
      setError('Please capture a live selfie first.');
      setSubmitting(false);
      return;
    }
    try {
      const loc = await fetchLocation();
      const payload = { selfie, lat: loc.lat, lng: loc.lng };
      if (type === 'in') {
        await punchIn(payload).unwrap();
        setSuccess('Punched in successfully!');
      } else {
        await punchOut(payload).unwrap();
        setSuccess('Punched out successfully!');
      }
      setSelfie(null);
      refetch();
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <p>Loading...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Punch In / Punch Out</h1>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-box">
          <div className="value">{formatTime(attendance?.punchIn?.time)}</div>
          <div className="label">Punch In Time</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatTime(attendance?.punchOut?.time)}</div>
          <div className="label">Punch Out Time</div>
        </div>
        <div className="stat-box">
          <div className="value">{attendance?.totalHours ? `${attendance.totalHours}h` : '0h'}</div>
          <div className="label">Working Hours</div>
        </div>
      </div>

      {attendance?.status && (
        <div style={{ marginBottom: 16 }}>
          Today's Status: <StatusBadge status={attendance.status} />{' '}
          {attendance.validation?.status && attendance.validation.status !== 'Pending' && (
            <>
              &nbsp;| Selfie Validation: <StatusBadge status={attendance.validation.status} />
            </>
          )}
        </div>
      )}

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="card-title">
          {!hasPunchedIn ? 'Capture selfie to Punch In' : !hasPunchedOut ? 'Capture selfie to Punch Out' : 'Attendance complete for today'}
        </h3>

        {!hasPunchedIn || !hasPunchedOut ? (
          <>
            <CameraCapture capturedImage={selfie} onCapture={setSelfie} onRetake={() => setSelfie(null)} />
            {error && <p className="error-text">{error}</p>}
            {success && <p className="success-text">{success}</p>}
            <div style={{ marginTop: 14 }}>
              {!hasPunchedIn && (
                <button className="btn success" disabled={submitting || punchingIn} onClick={() => handleAction('in')}>
                  {submitting || punchingIn ? 'Punching In...' : 'Punch In'}
                </button>
              )}
              {hasPunchedIn && !hasPunchedOut && (
                <button className="btn danger" disabled={submitting || punchingOut} onClick={() => handleAction('out')}>
                  {submitting || punchingOut ? 'Punching Out...' : 'Punch Out'}
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
              Your location will be captured automatically when you punch in/out.
            </p>
          </>
        ) : (
          <p className="empty-state">You're all done for today. See you tomorrow!</p>
        )}
      </div>
    </div>
  );
}
