import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logout } from '../features/auth/authSlice';
import { apiSlice } from '../features/api/apiSlice';
import { roleLabel } from '../utils/labels';
import { IconChevronDown, IconLogout } from './icons';

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

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = () => {
    dispatch(logout());
    dispatch(apiSlice.util.resetApiState());
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
          <div className="profile-dropdown-divider" />
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
