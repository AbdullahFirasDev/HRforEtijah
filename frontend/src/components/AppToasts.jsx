import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Alert from './Alert';
import SessionTimer from './SessionTimer';

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

// Notices pinned to the bottom of every screen: no connection, a new version
// of the app is ready, and the session countdown.
export default function AppToasts() {
  const online = useOnline();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <div className="toast-stack">
      {!online && (
        <Alert type="warning" title="لا يوجد اتصال بالإنترنت">
          لن يُسجَّل الحضور ولن تُرسل الطلبات حتى يعود الاتصال.
        </Alert>
      )}
      {needRefresh && (
        <Alert type="info" title="يتوفر إصدار جديد من التطبيق" onClose={() => setNeedRefresh(false)}>
          احفظ ما تعمل عليه ثم حدّث للحصول على آخر التحسينات.
          <div className="toast-actions">
            <button type="button" className="btn btn-sm" onClick={() => updateServiceWorker(true)}>
              تحديث الآن
            </button>
          </div>
        </Alert>
      )}
      <SessionTimer />
    </div>
  );
}
