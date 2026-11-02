import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { hasValidRole } from '../utils/roles';

// Guards a route: redirects to /login if not authenticated (or the stored
// user has an unrecognized role), and to the user's own dashboard if their
// role isn't in `allowedRoles`.
export default function ProtectedRoute({ allowedRoles }) {
  const user = useSelector(selectCurrentUser);

  if (!hasValidRole(user)) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return <Outlet />;
}
