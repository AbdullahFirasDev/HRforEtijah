import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetAllUsersQuery, useUpdateUserMutation } from '../features/api/userApi';
import DataTable from '../components/DataTable';
import DateRangeFilter from '../components/DateRangeFilter';
import AddEmployeeModal from '../components/AddEmployeeModal';
import ManageUserModal from '../components/ManageUserModal';
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
  const me = useSelector(selectCurrentUser);
  const [roleFilter, setRoleFilter] = useState('');
  const { data, isLoading } = useGetAllUsersQuery({ role: roleFilter || undefined });
  const [updateUser] = useUpdateUserMutation();
  const [error, setError] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [manageId, setManageId] = useState(null);
  const [success, setSuccess] = useState('');

  // Looked up on every render so the manage window shows fresh data after each action
  const managed = data?.users?.find((u) => u.id === manageId);

  const handleCreated = (u) => {
    setShowAdd(false);
    setSuccess(`تمت إضافة ${u.name}. شارك البريد الإلكتروني وكلمة المرور الأولية مع الموظف ليتمكن من تسجيل الدخول.`);
  };

  const handleDeleted = (message) => {
    setManageId(null);
    setError('');
    setSuccess(message);
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
          disabled={u.id === me?.id}
          title={u.id === me?.id ? 'لا يمكنك تغيير دورك بنفسك' : undefined}
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
    {
      key: 'device',
      label: 'الجهاز المسجّل',
      value: (u) => (u.device ? `${u.device.label} (${formatDate(u.device.registeredAt)})` : 'لم يُسجَّل بعد'),
      render: (u) =>
        u.device ? (
          <span className="device-info">
            <strong>{u.device.label}</strong>
            <small>منذ {formatDate(u.device.registeredAt)}</small>
          </span>
        ) : (
          <span className="badge muted">لم يُسجَّل بعد</span>
        ),
    },
    { key: 'joined', label: 'تاريخ الإضافة', value: (u) => formatDate(u.createdAt) },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (u) => (
        <button
          className="btn secondary btn-sm"
          title="كلمة المرور، الجهاز، التفعيل، الحذف"
          onClick={() => {
            setError('');
            setSuccess('');
            setManageId(u.id);
          }}
        >
          إدارة
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="المستخدمون"
        subtitle="أضف الموظفين وعدّل أدوارهم. من «إدارة» تغيّر كلمة المرور، وتعيد تعيين الجهاز، وتعطّل الحساب أو تحذفه."
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
      {managed && <ManageUserModal user={managed} onClose={() => setManageId(null)} onDeleted={handleDeleted} />}

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
