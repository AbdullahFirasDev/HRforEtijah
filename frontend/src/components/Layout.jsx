import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { roleLabel } from '../utils/labels';
import Header from './Header';
import InstallBanner from './InstallBanner';
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
    { to: '/employee/dashboard', label: 'لوحة المعلومات', icon: IconDashboard },
    { to: '/employee', label: 'تسجيل الحضور والانصراف', end: true, icon: IconClock },
    { to: '/employee/history', label: 'سجل حضوري', icon: IconCalendar },
    { to: '/employee/overtime', label: 'طلبات العمل الإضافي', icon: IconClockPlus },
    { to: '/employee/reports', label: 'تقاريري', icon: IconChart },
  ],
  manager: [
    { to: '/manager', label: 'حضور الفريق', end: true, icon: IconUsers },
    { to: '/manager/overtime', label: 'اعتماد العمل الإضافي', icon: IconClockPlus },
    { to: '/manager/validation', label: 'التحقق من الصور', icon: IconShieldCheck },
    { to: '/manager/reports', label: 'التقارير', icon: IconChart },
  ],
  admin: [
    { to: '/admin', label: 'المستخدمون', end: true, icon: IconUsers },
    { to: '/admin/attendance', label: 'سجل الحضور العام', icon: IconCalendar },
    { to: '/admin/overtime', label: 'اعتماد العمل الإضافي', icon: IconClockPlus },
    { to: '/admin/validation', label: 'التحقق من الصور', icon: IconShieldCheck },
    { to: '/admin/reports', label: 'التقارير', icon: IconChart },
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

        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} aria-label="القائمة الرئيسية">
          <span className="role-badge">{roleLabel(user?.role)}</span>
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
                  <Icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="main-content">
          <InstallBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
