import { useMemo, useState } from 'react';
import { useGetAllUsersQuery, useUpdateUserMutation } from '../features/api/userApi';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import { formatDate } from '../utils/format';

export default function AdminUsers() {
  const [roleFilter, setRoleFilter] = useState('');
  const { data, isLoading } = useGetAllUsersQuery({ role: roleFilter || undefined });
  const [updateUser] = useUpdateUserMutation();
  const [error, setError] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const handleToggleActive = async (u) => {
    setError('');
    try {
      await updateUser({ id: u.id, isActive: !u.isActive }).unwrap();
    } catch (err) {
      setError(err?.data?.message || 'Failed to update user.');
    }
  };

  const handleRoleChange = async (u, role) => {
    setError('');
    try {
      await updateUser({ id: u.id, role }).unwrap();
    } catch (err) {
      setError(err?.data?.message || 'Failed to update role.');
    }
  };

  const rows = useMemo(() => {
    const all = data?.users || [];
    return all.filter((u) => {
      const joined = formatDate(u.createdAt);
      return (!range.from || joined >= range.from) && (!range.to || joined <= range.to);
    });
  }, [data, range]);

  const columns = [
    { key: 'name', label: 'Name', value: (u) => u.name },
    { key: 'email', label: 'Email', value: (u) => u.email },
    {
      key: 'role',
      label: 'Role',
      value: (u) => u.role,
      render: (u) => (
        <select value={u.role} onChange={(e) => handleRoleChange(u, e.target.value)} style={{ marginBottom: 0 }}>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      value: (u) => (u.isActive ? 'Active' : 'Deactivated'),
      render: (u) => <span className={`badge ${u.isActive ? 'success' : 'danger'}`}>{u.isActive ? 'Active' : 'Deactivated'}</span>,
    },
    { key: 'joined', label: 'Joined', value: (u) => formatDate(u.createdAt) },
    {
      key: 'action',
      label: 'Action',
      value: () => '',
      render: (u) => (
        <button className="btn secondary" style={{ padding: '6px 12px' }} onClick={() => handleToggleActive(u)}>
          {u.isActive ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>All Users</h1>
      {error && <p className="error-text">{error}</p>}

      <DateRangeFilter
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onClear={() => setRange({ from: '', to: '' })}
        extra={
          <div>
            <label>Filter by Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        }
      />

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyLabel="No users found."
          searchPlaceholder="Search users..."
          fileName="all-users"
          rowKey={(row) => row.id}
        />
      )}
    </div>
  );
}
