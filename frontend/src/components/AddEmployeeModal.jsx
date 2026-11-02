import { useState } from 'react';
import { useCreateUserMutation } from '../features/api/userApi';
import { useGetManagersListQuery } from '../features/api/authApi';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'employee', managerId: '' };

// Admin form for adding a staff account. Follows the signup rules: employees
// must report to an existing manager/admin. The admin stays signed in.
export default function AddEmployeeModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [createUser, { isLoading }] = useCreateUserMutation();
  const { data: managersData } = useGetManagersListQuery(undefined, { skip: !open });

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'role' && value !== 'employee') {
      // Manager/Admin accounts don't report to anyone.
      setForm({ ...form, role: value, managerId: '' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await createUser(form).unwrap();
      setForm(EMPTY_FORM);
      onCreated(res.user);
    } catch (err) {
      setError(err?.data?.message || 'Failed to add employee.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 className="card-title">Add New Employee</h2>
        <form onSubmit={handleSubmit}>
          <label>Full Name</label>
          <input name="name" value={form.name} onChange={handleChange} required autoFocus />
          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} required />
          <label>Initial Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            minLength={6}
            autoComplete="new-password"
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
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn secondary" onClick={handleClose} disabled={isLoading}>
              Cancel
            </button>
            <button className="btn" disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
