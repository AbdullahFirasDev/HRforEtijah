import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectSessionExpiresAt, SESSION_EXPIRED_NOTICE } from '../features/auth/authSlice';
import Alert from './Alert';

const WARN_MS = 60 * 1000;

// Signs the user out when the session token expires (15 minutes after
// sign-in by default) and counts down during the last minute.
export default function SessionTimer() {
  const expiresAt = useSelector(selectSessionExpiresAt);
  const dispatch = useDispatch();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => {
      const t = Date.now();
      if (t >= expiresAt) dispatch(logout(SESSION_EXPIRED_NOTICE));
      else if (expiresAt - t <= WARN_MS) setNow(t);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, dispatch]);

  const left = expiresAt ? expiresAt - now : Infinity;
  if (left > WARN_MS || left <= 0) return null;

  const secs = Math.ceil(left / 1000);
  const countdown = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <Alert type="warning" title="ستنتهي جلستك قريباً">
      سيتم تسجيل خروجك تلقائياً خلال {countdown}. احفظ ما تعمل عليه، ثم سجّل الدخول من جديد.
    </Alert>
  );
}
