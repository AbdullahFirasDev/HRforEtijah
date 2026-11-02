import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import Header from './Header';
import {
  IconDashboard,
  IconClock,
  IconCalendar,
  IconClockPlus,
  IconChart,
  IconUsers,
  IconShieldCheck,
} from './icons';

const NAV_ITEMS = {
  employee: [
    { to: '/employee/dashboard', label: 'Dashboard', icon: IconDashboard },
    { to: '/employee', label: 'Punch In / Out', end: true, icon: IconClock },
    { to: '/employee/history', label: 'My Attendance', icon: IconCalendar },
    { to: '/employee/overtime', label: 'Overtime Requests', icon: IconClockPlus },
    { to: '/employee/reports', label: 'My Reports', icon: IconChart },
  ],
  manager: [
    { to: '/manager', label: 'Team Attendance', end: true, icon: IconUsers },
    { to: '/manager/overtime', label: 'Overtime Approvals', icon: IconClockPlus },
    { to: '/manager/validation', label: 'Validate Selfies', icon: IconShieldCheck },
    { to: '/manager/reports', label: 'Reports', icon: IconChart },
  ],
  admin: [
    { to: '/admin', label: 'All Users', end: true, icon: IconUsers },
    { to: '/admin/attendance', label: 'All Attendance', icon: IconCalendar },
    { to: '/admin/overtime', label: 'Overtime Approvals', icon: IconClockPlus },
    { to: '/admin/validation', label: 'Validate Selfies', icon: IconShieldCheck },
    { to: '/admin/reports', label: 'Reports', icon: IconChart },
  ],
};

export default function Layout({ children }) {
  const user = useSelector(selectCurrentUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const items = NAV_ITEMS[user?.role] || [];

  return (
    <div className="app-shell">
      <Header onToggleSidebar={() => setSidebarOpen((o) => !o)} />

      <div className="app-body">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <span className="role-badge">{user?.role}</span>
          <nav>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
