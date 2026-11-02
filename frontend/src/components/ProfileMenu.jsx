import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logout } from '../features/auth/authSlice';
import { apiSlice } from '../features/api/apiSlice';
import { IconChevronDown, IconLogout } from './icons';

const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'U';

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
      <button type="button" className="profile-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="avatar-circle">{initials}</span>
        <span className="profile-trigger-text">
          <span className="profile-name">{user?.name}</span>
          <span className="profile-status">
            <i className="status-dot" /> Online
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
              <div className="profile-role-badge">{user?.role}</div>
              <div className="profile-status">
                <i className="status-dot" /> Online
              </div>
            </div>
          </div>
          <div className="profile-dropdown-divider" />
          <button type="button" className="profile-dropdown-item danger" onClick={handleLogout}>
            <IconLogout size={16} />
            <span>
              Logout
              <small>Sign out of your account</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
