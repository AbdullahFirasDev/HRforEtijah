import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { roleLabel } from '../utils/labels';
import { useGetUnreadCountQuery } from '../features/api/notificationApi';
import Header from './Header';
import InstallBanner from './InstallBanner';
import DailyMessages from './DailyMessages';
import {
  IconDashboard,
  IconClock,
  IconCalendar,
  IconClockPlus,
  IconChart,
  IconUsers,
  IconMapPin,
  IconTimesheet,
  IconHourglass,
  IconMail,
  IconBell,
} from './icons';

const NAV_ITEMS = {
  employee: [
    { to: '/employee/dashboard', label: 'لوحة المعلومات', icon: IconDashboard },
    { to: '/employee', label: 'تسجيل الحضور والانصراف', end: true, icon: IconClock },
    { to: '/employee/history', label: 'سجل حضوري', icon: IconCalendar },
    { to: '/employee/time-leaves', label: 'الزمنيات', icon: IconHourglass },
    { to: '/employee/timesheet', label: 'كشفي الشهري', icon: IconTimesheet },
    { to: '/employee/overtime', label: 'طلبات العمل الإضافي', icon: IconClockPlus },
    { to: '/employee/reports', label: 'تقاريري', icon: IconChart },
    { to: '/employee/notifications', label: 'الإشعارات', icon: IconBell, notifications: true },
  ],
  manager: [
    { to: '/manager', label: 'حضور الفريق', end: true, icon: IconUsers },
    { to: '/manager/time-leaves', label: 'الزمنيات', icon: IconHourglass },
    { to: '/manager/timesheet', label: 'الكشف الشهري', icon: IconTimesheet },
    { to: '/manager/overtime', label: 'اعتماد العمل الإضافي', icon: IconClockPlus },
    { to: '/manager/reports', label: 'التقارير', icon: IconChart },
    { to: '/manager/notifications', label: 'الإشعارات', icon: IconBell, notifications: true },
  ],
  admin: [
    { to: '/admin', label: 'المستخدمون', end: true, icon: IconUsers },
    { to: '/admin/attendance', label: 'سجل الحضور العام', icon: IconCalendar },
    { to: '/admin/time-leaves', label: 'الزمنيات', icon: IconHourglass },
    { to: '/admin/timesheet', label: 'الكشف الشهري', icon: IconTimesheet },
    { to: '/admin/overtime', label: 'اعتماد العمل الإضافي', icon: IconClockPlus },
    { to: '/admin/reports', label: 'التقارير', icon: IconChart },
    { to: '/admin/messages', label: 'الرسائل', icon: IconMail },
    { to: '/admin/geofence', label: 'النطاق الجغرافي', icon: IconMapPin },
    { to: '/admin/notifications', label: 'الإشعارات', icon: IconBell, notifications: true },
  ],
};

export default function Layout({ children }) {
  const user = useSelector(selectCurrentUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Same request as the header's bell (shared cache): no menu entry until set up
  const { data: notifications } = useGetUnreadCountQuery();

  const items = (NAV_ITEMS[user?.role] || []).filter((item) => !item.notifications || notifications?.enabled);

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
      <DailyMessages />
    </div>
  );
}
