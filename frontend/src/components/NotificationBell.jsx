import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { apiSlice } from '../features/api/apiSlice';
import {
  useDeletePushSubscriptionMutation,
  useGetNotificationSettingsQuery,
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkAllNotificationsReadMutation,
  useSavePushSubscriptionMutation,
} from '../features/api/notificationApi';
import { syncPush } from '../utils/push';
import NotificationList, { useOpenNotification } from './NotificationList';
import Loading from './Loading';
import { IconBell } from './icons';

// How often an open app asks for new notifications (only while it is visible)
const POLL_MS = 60000;

const subscribeVisibility = (fn) => {
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
};
const isVisible = () => document.visibilityState === 'visible';

// The bell in the header: unread count, the latest notifications, and the way
// to the full list and settings. Hidden until notifications are set up.
export default function NotificationBell() {
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);

  const { data, refetch } = useGetUnreadCountQuery(undefined, { pollingInterval: visible ? POLL_MS : 0 });
  const enabled = !!data?.enabled;
  const count = data?.count || 0;
  const latest = useGetNotificationsQuery({ limit: 8 }, { skip: !open || !enabled, refetchOnMountOrArgChange: true });
  const settings = useGetNotificationSettingsQuery(undefined, { skip: !enabled });
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const [savePush] = useSavePushSubscriptionMutation();
  const [removePush] = useDeletePushSubscriptionMutation();
  const openNotification = useOpenNotification(`/${user?.role}/notifications`);

  // Back in the app: ask straight away rather than at the next minute
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) refetch();
    wasVisible.current = visible;
  }, [visible, refetch]);

  // More unread than before: lists on screen refresh too
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) dispatch(apiSlice.util.invalidateTags(['Notification']));
    previous.current = count;
  }, [count, dispatch]);

  // From the service worker: a push arrived, or one was tapped while the app is open
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return undefined;
    const onMessage = (event) => {
      const type = event.data?.type;
      if (type === 'etijah:push') {
        dispatch(apiSlice.util.invalidateTags(['NotificationCount', 'Notification']));
      } else if (type === 'etijah:open') {
        const url = event.data.url;
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) navigate(url);
      }
    };
    sw.addEventListener('message', onMessage);
    sw.startMessages?.();
    return () => sw.removeEventListener('message', onMessage);
  }, [dispatch, navigate]);

  // Once per sign-in: keep this device's push subscription in step with the server
  const publicKey = settings.data?.push?.publicKey || null;
  const synced = useRef(null);
  useEffect(() => {
    if (!enabled || !settings.data || !user?.id) return;
    const tag = `${user.id}:${publicKey}`;
    if (synced.current === tag) return;
    synced.current = tag;
    syncPush({ userId: user.id, publicKey, save: savePush, remove: removePush });
  }, [enabled, settings.data, publicKey, user?.id, savePush, removePush]);

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!enabled) return null;

  const items = latest.data?.notifications || [];
  const label = count ? `الإشعارات، ${count} غير مقروء` : 'الإشعارات';

  return (
    <div className="notif-menu" ref={ref}>
      <button
        type="button"
        className="notif-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
      >
        <IconBell size={22} />
        {count > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="الإشعارات">
          <div className="notif-panel-head">
            <strong>الإشعارات</strong>
            {count > 0 && (
              <button type="button" className="link-button" onClick={() => markAll()} disabled={markingAll}>
                تحديد الكل كمقروء
              </button>
            )}
          </div>
          <div className="notif-panel-body">
            {latest.isLoading ? (
              <Loading />
            ) : latest.isError ? (
              <p className="empty-state">تعذر تحميل الإشعارات. حاول مرة أخرى بعد قليل.</p>
            ) : items.length ? (
              <NotificationList
                compact
                items={items}
                onOpen={(n) => {
                  setOpen(false);
                  openNotification(n);
                }}
              />
            ) : (
              <p className="empty-state">لا توجد إشعارات بعد.</p>
            )}
          </div>
          <Link to={`/${user.role}/notifications`} className="notif-panel-foot" onClick={() => setOpen(false)}>
            كل الإشعارات والإعدادات
          </Link>
        </div>
      )}
    </div>
  );
}
