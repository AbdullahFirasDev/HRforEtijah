import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import {
  useGetNotificationsQuery,
  useLazyGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
} from '../features/api/notificationApi';
import PageHeader from '../components/PageHeader';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import NotificationList, { useOpenNotification } from '../components/NotificationList';
import NotificationSettings from '../components/NotificationSettings';

const PAGE = 20;

// The notification history (all or unread only, older pages on demand) and
// the settings for what to be notified about
export default function Notifications() {
  const user = useSelector(selectCurrentUser);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, isError } = useGetNotificationsQuery({ limit: PAGE, unread: unreadOnly });
  const [fetchOlder, { isFetching: loadingOlder }] = useLazyGetNotificationsQuery();
  const [older, setOlder] = useState({ filter: unreadOnly, items: [], hasMore: null });
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const open = useOpenNotification(null);

  // Older pages belong to the filter they were loaded for
  const extra = older.filter === unreadOnly ? older : { items: [], hasMore: null };
  const first = data?.notifications || [];
  const seen = new Set(first.map((n) => n.id));
  const items = [...first, ...extra.items.filter((n) => !seen.has(n.id))];
  const hasMore = extra.hasMore ?? data?.hasMore;
  const unread = data?.unread || 0;

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    const page = await fetchOlder({ limit: PAGE, unread: unreadOnly, before: last.id }).unwrap().catch(() => null);
    if (page) setOlder({ filter: unreadOnly, items: [...extra.items, ...page.notifications], hasMore: page.hasMore });
  };

  const openItem = (n) => {
    open(n);
    // Older pages aren't refetched: show it read straight away
    setOlder((o) => ({ ...o, items: o.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }));
  };

  if (!isLoading && data && !data.enabled) {
    return (
      <>
        <PageHeader title="الإشعارات" />
        <Alert type="info">الإشعارات غير مفعّلة بعد. سيكمل مسؤول النظام إعدادها قريباً.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="الإشعارات"
        subtitle={unread ? `لديك ${unread} من الإشعارات غير المقروءة` : 'لا توجد إشعارات غير مقروءة'}
        actions={
          unread > 0 && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                markAll();
                setOlder((o) => ({ ...o, items: o.items.map((x) => ({ ...x, read: true })) }));
              }}
              disabled={markingAll}
            >
              تحديد الكل كمقروء
            </button>
          )
        }
      />

      <div className="card">
        <div className="notif-filter" role="group" aria-label="عرض الإشعارات">
          <button type="button" className={`chip-button${unreadOnly ? '' : ' is-on'}`} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            الكل
          </button>
          <button type="button" className={`chip-button${unreadOnly ? ' is-on' : ''}`} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            غير المقروءة
          </button>
        </div>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <Alert type="error">تعذر تحميل الإشعارات. حاول مرة أخرى بعد قليل.</Alert>
        ) : items.length ? (
          <>
            <NotificationList items={items} onOpen={openItem} />
            {hasMore && (
              <div className="notif-more">
                <button type="button" className="btn secondary btn-sm" onClick={loadMore} disabled={loadingOlder}>
                  {loadingOlder ? 'جارٍ التحميل...' : 'عرض المزيد'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="empty-state">{unreadOnly ? 'لا توجد إشعارات غير مقروءة.' : 'لا توجد إشعارات بعد.'}</p>
        )}
      </div>

      {user && <NotificationSettings />}
    </>
  );
}
