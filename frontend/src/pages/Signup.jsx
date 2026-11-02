import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useRegisterMutation, useGetManagersListQuery } from '../features/api/authApi';
import { setCredentials } from '../features/auth/authSlice';
import AuthLayout from '../components/AuthLayout';
import AccountFields from '../components/AccountFields';
import Alert from '../components/Alert';
import { MIN_PASSWORD, hasErrors, updateAccountForm, validateAccountForm } from '../utils/validation';

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', managerId: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [register, { isLoading }] = useRegisterMutation();
  const { data: managersData } = useGetManagersListQuery();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => updateAccountForm(f, { name, value }));
    setErrors((prev) => ({ ...prev, [name]: undefined, ...(name === 'role' && { managerId: undefined }) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validateAccountForm(form);
    setErrors(found);
    if (hasErrors(found)) return;
    try {
      const res = await register(form).unwrap();
      dispatch(setCredentials(res));
      navigate(`/${res.user.role}`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر إنشاء الحساب. حاول مرة أخرى.');
    }
  };

  return (
    <AuthLayout
      title="إنشاء حساب"
      subtitle="انضم إلى نظام الاتجاه للحضور"
      footer={
        <>
          <p className="auth-footer">
            لديك حساب بالفعل؟ <Link to="/login">تسجيل الدخول</Link>
          </p>
          <p className="auth-note">
            ملاحظة: يجب على الموظف اختيار مدير أو مسؤول نظام يتبع له. إن لم يوجد أي مدير بعد، أنشئ حساب مدير أولاً.
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <AccountFields
          idPrefix="signup"
          form={form}
          errors={errors}
          onChange={handleChange}
          managers={managersData?.managers}
          passwordLabel="كلمة المرور"
          passwordHint={`${MIN_PASSWORD} أحرف على الأقل`}
        />
        <Alert type="error">{error}</Alert>
        <button type="submit" className="btn btn-block" disabled={isLoading}>
          {isLoading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
        </button>
      </form>
    </AuthLayout>
  );
}
