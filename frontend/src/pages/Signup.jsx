import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useRegisterMutation, useGetManagersListQuery } from '../features/api/authApi';
import { setCredentials } from '../features/auth/authSlice';

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', managerId: '' });
  const [register, { isLoading }] = useRegisterMutation();
  const { data: managersData } = useGetManagersListQuery();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'role' && value !== 'employee') {
      // Manager/Admin accounts don't report to anyone through this form.
      setForm({ ...form, role: value, managerId: '' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await register(form).unwrap();
      dispatch(setCredentials(res));
      navigate(`/${res.user.role}`);
    } catch (err) {
      setError(err?.data?.message || 'Signup failed. Please try again.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create account</h1>
        <p className="sub">Join the Attendance Management System</p>
        <form onSubmit={handleSubmit}>
          <label>Full Name</label>
          <input name="name" value={form.name} onChange={handleChange} required />
          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} required />
          <label>Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            minLength={6}
            required
          />
          <label>Role</label>
          <select name="role" value={form.role} onChange={handleChange}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          {form.role === 'employee' && (
            <>
              <label>Assign Manager</label>
              <select name="managerId" value={form.managerId} onChange={handleChange} required>
                <option value="" disabled>
                  Select a manager
                </option>
                {managersData?.managers?.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
              {managersData && managersData.managers?.length === 0 && (
                <p className="error-text">
                  No managers/admins exist yet. Ask an admin to sign up first before registering employees.
                </p>
              )}
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: 13 }}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
        <p style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
          Note: Employees must select an existing Manager/Admin to report to. Register a Manager or
          Admin account first if none exist yet.
        </p>
      </div>
    </div>
  );
}
