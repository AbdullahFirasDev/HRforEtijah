import { useState } from 'react';
import { useCreateUserMutation } from '../features/api/userApi';
import { useGetManagersListQuery } from '../features/api/authApi';
import AccountFields from './AccountFields';
import WorkScheduleFields from './WorkScheduleFields';
import Alert from './Alert';
import {
  MIN_PASSWORD,
  hasErrors,
  updateAccountForm,
  validateAccountForm,
  validateWorkSchedule,
} from '../utils/validation';
import { EMPTY_WORK_FORM, workPayload } from '../utils/workSchedule';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'employee', managerId: '' };

// Admin form for adding a staff account. Follows the signup rules: employees
// must report to an existing manager/admin, and get their working hours here.
// The admin stays signed in.
export default function AddEmployeeModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [work, setWork] = useState(EMPTY_WORK_FORM);
  const [workErrors, setWorkErrors] = useState({});
  const [error, setError] = useState('');
  const [createUser, { isLoading }] = useCreateUserMutation();
  const { data: managersData } = useGetManagersListQuery(undefined, { skip: !open });

  if (!open) return null;

  const isEmployee = form.role === 'employee';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => updateAccountForm(f, { name, value }));
    setErrors((prev) => ({ ...prev, [name]: undefined, ...(name === 'role' && { managerId: undefined }) }));
  };

  const handleWorkChange = (next) => {
    setWork(next);
    setWorkErrors({});
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setWork(EMPTY_WORK_FORM);
    setWorkErrors({});
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validateAccountForm(form);
    const foundWork = isEmployee ? validateWorkSchedule(work) : {};
    setErrors(found);
    setWorkErrors(foundWork);
    if (hasErrors(found) || hasErrors(foundWork)) return;
    try {
      const res = await createUser(isEmployee ? { ...form, ...workPayload(work) } : form).unwrap();
      reset();
      onCreated(res.user);
    } catch (err) {
      setError(err?.data?.message || 'تعذرت إضافة الموظف. حاول مرة أخرى.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide" role="dialog" aria-modal="true" aria-labelledby="add-employee-title">
        <h2 id="add-employee-title" className="card-title">
          إضافة موظف جديد
        </h2>
        <form onSubmit={handleSubmit} noValidate>
          <AccountFields
            idPrefix="add-employee"
            form={form}
            errors={errors}
            onChange={handleChange}
            managers={managersData?.managers}
            passwordLabel="كلمة المرور الأولية"
            passwordHint={`${MIN_PASSWORD} أحرف على الأقل، وتُسلَّم للموظف ليسجل دخوله بها`}
          />
          {isEmployee && (
            <section className="manage-section">
              <h3>الدوام</h3>
              <WorkScheduleFields idPrefix="add-work" value={work} errors={workErrors} onChange={handleWorkChange} />
            </section>
          )}
          <Alert type="error">{error}</Alert>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={isLoading}>
              {isLoading ? 'جارٍ الإضافة...' : 'إضافة الموظف'}
            </button>
            <button type="button" className="btn secondary" onClick={handleClose} disabled={isLoading}>
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
