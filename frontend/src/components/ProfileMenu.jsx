import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logout, selectSessionExpiresAt } from '../features/auth/authSlice';
import { roleLabel } from '../utils/labels';
import { formatTime } from '../utils/format';
import { getInstallPrompt, promptInstall, subscribeInstall } from '../utils/installPrompt';
import { useDeletePushSubscriptionMutation } from '../features/api/notificationApi';
import { stopPushOnSignOut } from '../utils/push';
import { IconChevronDown, IconDownload, IconLogout } from './icons';

// Skips the Arabic article "ال" (الكناني -> ك) and joins with a zero-width
// non-joiner so two Arabic initials don't connect.
const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w.length > 2 && w.startsWith('ال') ? w[2] : w[0])?.toUpperCase())
    .join('‌') || 'م';

export default function ProfileMenu({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const expiresAt = useSelector(selectSessionExpiresAt);
  const canInstall = !!useSyncExternalStore(subscribeInstall, getInstallPrompt);
  const [removePush] = useDeletePushSubscriptionMutation();

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // App clears the cached API data when the session ends. Signing out on
  // purpose also stops this user's push messages on this device (they
  // resume if the same user signs in again).
  const handleLogout = async () => {
    setOpen(false);
    await stopPushOnSignOut(removePush);
    dispatch(logout());
    navigate('/login');
  };

  const initials = initialsOf(user?.name);

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="قائمة الحساب"
      >
        <span className="avatar-circle">{initials}</span>
        <span className="profile-trigger-text">
          <span className="profile-name">{user?.name}</span>
          <span className="profile-status">
            <i className="status-dot" /> متصل
          </span>
        </span>
        <IconChevronDown size={16} className={`chevron ${open ? 'chevron-open' : ''}`} />
      </button>

      {open && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <span className="avatar-circle avatar-circle-lg">{initials}</span>
            <div>
              <div className="profile-name">{user?.name}</div>
              <div className="profile-role-badge">{roleLabel(user?.role)}</div>
              <div className="profile-status">
                <i className="status-dot" /> متصل
              </div>
            </div>
          </div>
          {expiresAt && (
            <p className="profile-session">
              تنتهي الجلسة تلقائياً الساعة <strong>{formatTime(expiresAt)}</strong>
            </p>
          )}
          <div className="profile-dropdown-divider" />
          {canInstall && (
            <button
              type="button"
              className="profile-dropdown-item"
              onClick={() => {
                setOpen(false);
                promptInstall();
              }}
            >
              <IconDownload size={18} />
              <span>
                تثبيت التطبيق
                <small>أضفه إلى الشاشة الرئيسية لجهازك</small>
              </span>
            </button>
          )}
          <button type="button" className="profile-dropdown-item danger" onClick={handleLogout}>
            <IconLogout size={18} />
            <span>
              تسجيل الخروج
              <small>الخروج من حسابك على هذا الجهاز</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
