import { useNavigate } from 'react-router-dom';
import { useMarkNotificationReadMutation } from '../features/api/notificationApi';
import { formatRelative } from '../utils/format';

// Opening a notification marks it read and goes to its page (or `fallback`
// for one without a page, e.g. a message from the administration)
export function useOpenNotification(fallback) {
  const navigate = useNavigate();
  const [markRead] = useMarkNotificationReadMutation();
  return (notification) => {
    if (!notification.read) markRead(notification.id);
    const to = notification.link || fallback;
    if (to) navigate(to);
  };
}

// Notifications, newest first; unread ones stand out. `compact` (the bell's
// panel) keeps each to two lines of text.
export default function NotificationList({ items, onOpen, compact = false }) {
  return (
    <ul className={`notif-list${compact ? ' is-compact' : ''}`}>
      {items.map((n) => (
        <li key={n.id}>
          <button type="button" className={`notif-item${n.read ? '' : ' is-unread'}`} onClick={() => onOpen(n)}>
            <span className="notif-dot" aria-hidden="true" />
            <span className="notif-text">
              <strong className="notif-title">{n.title}</strong>
              {n.body && <span className="notif-body">{n.body}</span>}
              <span className="notif-time">
                <time dateTime={n.at}>{formatRelative(n.at)}</time>
                {!n.read && <span className="notif-unread-label"> · غير مقروء</span>}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
