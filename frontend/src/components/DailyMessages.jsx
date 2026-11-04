import { useEffect, useRef, useState } from 'react';
import { useGetMessageInboxQuery, useMarkMessageReadMutation } from '../features/api/messageApi';
import { formatDateLong } from '../utils/format';

// The popup itself; the admin's preview uses it too
export function DailyMessageCard({ message, position = 1, total = 1, buttonLabel, onDone }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, [message.id]);

  return (
    <div className="modal-overlay daily-overlay">
      <div className="daily-message" role="dialog" aria-modal="true" aria-labelledby="daily-title" aria-describedby="daily-body">
        <div className="daily-head">
          <img src="/logo-mark.png" alt="" width="44" height="44" />
          <span className="daily-kicker">رسالة اليوم</span>
          {total > 1 && (
            <span className="daily-count">
              {position} من {total}
            </span>
          )}
        </div>
        <h2 id="daily-title">{message.title}</h2>
        <p id="daily-body">{message.body}</p>
        <div className="daily-foot">
          <small>
            {message.sender ? `${message.sender} · ` : ''}
            {formatDateLong(message.sentAt)}
          </small>
          <button ref={buttonRef} type="button" className="btn" onClick={onDone}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shows the day's unread messages one at a time after signing in. A message
// counts as read once it is closed; if saving that fails it just shows again
// next time.
export default function DailyMessages() {
  const { data } = useGetMessageInboxQuery();
  const [markRead] = useMarkMessageReadMutation();
  const [closed, setClosed] = useState([]);

  const unread = (data?.messages || []).filter((m) => !closed.includes(m.id));
  const message = unread[0];
  if (!message) return null;

  const close = () => {
    setClosed((ids) => [...ids, message.id]);
    markRead(message.id);
  };

  return (
    <DailyMessageCard
      message={message}
      position={closed.length + 1}
      total={closed.length + unread.length}
      buttonLabel={unread.length > 1 ? 'الرسالة التالية' : 'حسناً'}
      onDone={close}
    />
  );
}
