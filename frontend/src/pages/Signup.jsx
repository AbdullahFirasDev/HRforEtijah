import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useRegisterMutation, useGetManagersListQuery } from '../features/api/authApi';
import { setCredentials } from '../features/auth/authSlice';
import AuthLayout from '../components/AuthLayout';
import AccountFields from '../components/AccountFields';
import Alert from '../components/Alert';
import { MIN_PASSWORD, hasErrors, updateAccountForm, validateAccountForm } from '../utils/validation';
import { getDeviceId } from '../utils/deviceId';

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', managerId: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [register, { isLoading }] = useRegisterMutation();
  const { data: managersData } = useGetManagersListQuery();
  // Only the first account of a new system (no admin yet) picks its role
  const firstSetup = !!managersData?.firstSetup;
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
    const sent = firstSetup ? form : { ...form, role: 'employee' };
    const found = validateAccountForm(sent);
    setErrors(found);
    if (hasErrors(found)) return;
    try {
      const res = await register({ ...sent, deviceId: getDeviceId() }).unwrap();
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
            {firstSetup
              ? 'لا يوجد مسؤول نظام بعد: أنشئ أولاً حساب «مسؤول النظام»، ثم أضف منه المدراء والموظفين. '
              : 'ملاحظة: التسجيل من هذه الصفحة للموظفين، ويجب اختيار المدير الذي يتبع له الموظف. يضيف مسؤول النظام حسابات المدراء. '}
            ويُربط الحساب بهذا الجهاز، فلن يمكن الدخول إليه من جهاز آخر إلا بعد أن يعيد مسؤول النظام تعيين الجهاز.
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <AccountFields
          idPrefix="signup"
          showRole={firstSetup}
          form={firstSetup ? form : { ...form, role: 'employee' }}
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
