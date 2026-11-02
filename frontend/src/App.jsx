import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentUser, logout } from './features/auth/authSlice';
import { hasValidRole } from './utils/roles';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import Signup from './pages/Signup';
import EmployeeSummary from './pages/EmployeeSummary';
import EmployeeDashboard from './pages/EmployeeDashboard';
import AttendanceHistory from './pages/AttendanceHistory';
import OvertimeRequests from './pages/OvertimeRequests';
import Reports from './pages/Reports';
import TeamAttendance from './pages/TeamAttendance';
import OvertimeApprovals from './pages/OvertimeApprovals';
import AttendanceValidation from './pages/AttendanceValidation';
import AdminUsers from './pages/AdminUsers';
import AdminAttendance from './pages/AdminAttendance';

function withLayout(Component) {
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

export default function App() {
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const loggedIn = hasValidRole(user);

  // A stored user with an unrecognized/missing role can't map to any route;
  // clear it instead of letting "/" <-> "*" redirect forever.
  useEffect(() => {
    if (user && !loggedIn) dispatch(logout());
  }, [user, loggedIn, dispatch]);

  return (
    <Routes>
      <Route path="/login" element={loggedIn ? <Navigate to={`/${user.role}`} replace /> : <Login />} />
      <Route path="/signup" element={loggedIn ? <Navigate to={`/${user.role}`} replace /> : <Signup />} />

      {/* Employee routes */}
      <Route element={<ProtectedRoute allowedRoles={['employee']} />}>
        <Route path="/employee/dashboard" element={withLayout(EmployeeSummary)} />
        <Route path="/employee" element={withLayout(EmployeeDashboard)} />
        <Route path="/employee/history" element={withLayout(AttendanceHistory)} />
        <Route path="/employee/overtime" element={withLayout(OvertimeRequests)} />
        <Route path="/employee/reports" element={withLayout(Reports)} />
      </Route>

      {/* Manager routes */}
      <Route element={<ProtectedRoute allowedRoles={['manager']} />}>
        <Route path="/manager" element={withLayout(TeamAttendance)} />
        <Route path="/manager/overtime" element={withLayout(OvertimeApprovals)} />
        <Route path="/manager/validation" element={withLayout(AttendanceValidation)} />
        <Route path="/manager/reports" element={withLayout(Reports)} />
      </Route>

      {/* Admin routes */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={withLayout(AdminUsers)} />
        <Route path="/admin/attendance" element={withLayout(AdminAttendance)} />
        <Route path="/admin/overtime" element={withLayout(OvertimeApprovals)} />
        <Route path="/admin/validation" element={withLayout(AttendanceValidation)} />
        <Route path="/admin/reports" element={withLayout(Reports)} />
      </Route>

      <Route
        path="/"
        element={loggedIn ? <Navigate to={`/${user.role}`} replace /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
