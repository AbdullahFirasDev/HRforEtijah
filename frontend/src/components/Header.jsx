import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import ProfileMenu from './ProfileMenu';
import { IconMenu } from './icons';

export default function Header({ onToggleSidebar }) {
  const user = useSelector(selectCurrentUser);

  return (
    <header className="app-header">
      <button type="button" className="sidebar-toggle" onClick={onToggleSidebar} aria-label="فتح القائمة">
        <IconMenu size={22} />
      </button>
      <div className="app-header-brand">
        <span className="brand-logo">
          <img src="/logo-mark.png" alt="" width="32" height="32" />
        </span>
        <span className="app-header-text">
          <span className="app-header-title">الاتجاه للسفر والسياحة</span>
          <span className="app-header-subtitle">نظام الحضور والموارد البشرية</span>
        </span>
      </div>
      <div className="app-header-spacer" />
      <ProfileMenu user={user} />
    </header>
  );
}
