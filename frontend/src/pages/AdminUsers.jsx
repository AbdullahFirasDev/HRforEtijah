import { useMemo, useState } from 'react';
import { useGetAllUsersQuery, useUpdateUserMutation } from '../features/api/userApi';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import AddEmployeeModal from '../components/AddEmployeeModal';
import PageHeader from '../components/PageHeader';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import { formatDate } from '../utils/format';
import { ROLE_LABELS, roleLabel } from '../utils/labels';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => (
  <option key={value} value={value}>
    {label}
  </option>
));

export default function AdminUsers() {
  const [roleFilter, setRoleFilter] = useState('');
  const { data, isLoading } = useGetAllUsersQuery({ role: roleFilter || undefined });
  const [updateUser] = useUpdateUserMutation();
  const [error, setError] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [success, setSuccess] = useState('');

  const handleCreated = (u) => {
    setShowAdd(false);
    setSuccess(`تمت إضافة ${u.name}. شارك البريد الإلكتروني وكلمة المرور الأولية مع الموظف ليتمكن من تسجيل الدخول.`);
  };

  const handleToggleActive = async (u) => {
    setError('');
    setSuccess('');
    try {
      await updateUser({ id: u.id, isActive: !u.isActive }).unwrap();
      setSuccess(u.isActive ? `تم تعطيل حساب ${u.name}.` : `تم تفعيل حساب ${u.name}.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر تحديث حالة المستخدم.');
    }
  };

  const handleRoleChange = async (u, role) => {
    setError('');
    setSuccess('');
    try {
      await updateUser({ id: u.id, role }).unwrap();
      setSuccess(`تم تغيير دور ${u.name} إلى "${roleLabel(role)}".`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر تغيير الدور.');
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
    { key: 'name', label: 'الاسم', value: (u) => u.name },
    { key: 'email', label: 'البريد الإلكتروني', value: (u) => u.email, render: (u) => <span dir="ltr">{u.email}</span> },
    {
      key: 'role',
      label: 'الدور',
      value: (u) => roleLabel(u.role),
      render: (u) => (
        <select
          className="input-sm"
          aria-label={`دور ${u.name}`}
          value={u.role}
          onChange={(e) => handleRoleChange(u, e.target.value)}
          style={{ minWidth: 140 }}
        >
          {ROLE_OPTIONS}
        </select>
      ),
    },
    {
      key: 'status',
      label: 'الحالة',
      value: (u) => (u.isActive ? 'نشط' : 'معطّل'),
      render: (u) => <span className={`badge ${u.isActive ? 'success' : 'danger'}`}>{u.isActive ? 'نشط' : 'معطّل'}</span>,
    },
    { key: 'joined', label: 'تاريخ الإضافة', value: (u) => formatDate(u.createdAt) },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (u) => (
        <button
          className={`btn btn-sm ${u.isActive ? 'secondary' : 'success'}`}
          onClick={() => handleToggleActive(u)}
        >
          {u.isActive ? 'تعطيل' : 'تفعيل'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="المستخدمون"
        subtitle="أضف الموظفين وعدّل أدوارهم وفعّل حساباتهم أو عطّلها."
        actions={
          <button
            className="btn"
            onClick={() => {
              setSuccess('');
              setShowAdd(true);
            }}
          >
            + إضافة موظف
          </button>
        }
      />
      <Alert type="error" onClose={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>

      <AddEmployeeModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={handleCreated} />

      <DateRangeFilter
        from={range.from}
        to={range.to}
        onFromChange={(v) => setRange({ ...range, from: v })}
        onToChange={(v) => setRange({ ...range, to: v })}
        onClear={() => setRange({ from: '', to: '' })}
        extra={
          <Field id="role-filter" label="تصفية حسب الدور">
            <select id="role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">الكل</option>
              {ROLE_OPTIONS}
            </select>
          </Field>
        }
      />

      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          exportTitle="المستخدمون"
          columns={columns}
          rows={rows}
          emptyLabel="لا يوجد مستخدمون."
          searchPlaceholder="ابحث عن مستخدم..."
          fileName="all-users"
          rowKey={(row) => row.id}
        />
      )}
    </div>
  );
}
