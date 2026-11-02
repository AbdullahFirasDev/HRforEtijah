import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import ProfileMenu from './ProfileMenu';
import { IconMenu } from './icons';

export default function Header({ onToggleSidebar }) {
  const user = useSelector(selectCurrentUser);

  return (
    <header className="app-header">
      <button type="button" className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Toggle navigation">
        <IconMenu size={22} />
      </button>
      <div className="app-header-brand">
        <span className="app-header-logo">A</span>
        <span className="app-header-title">Attendance MS</span>
      </div>
      <div className="app-header-spacer" />
      <ProfileMenu user={user} />
    </header>
  );
}
