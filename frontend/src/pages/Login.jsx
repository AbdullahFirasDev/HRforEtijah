import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useLoginMutation } from '../features/api/authApi';
import { selectAuthNotice, setCredentials } from '../features/auth/authSlice';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/Field';
import Alert from '../components/Alert';
import { hasErrors, validateLoginForm } from '../utils/validation';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [login, { isLoading }] = useLoginMutation();
  const notice = useSelector(selectAuthNotice);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const found = validateLoginForm(form);
    setErrors(found);
    if (hasErrors(found)) return;
    try {
      const res = await login(form).unwrap();
      dispatch(setCredentials(res));
      navigate(`/${res.user.role}`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر تسجيل الدخول. تحقق من اتصالك ثم حاول مرة أخرى.');
    }
  };

  return (
    <AuthLayout
      title="مرحباً بعودتك"
      subtitle="سجّل الدخول إلى نظام الاتجاه للحضور"
      footer={
        <p className="auth-footer">
          ليس لديك حساب؟ <Link to="/signup">إنشاء حساب</Link>
        </p>
      }
    >
      <Alert type="warning">{notice}</Alert>
      <form onSubmit={handleSubmit} noValidate>
        <Field id="login-email" label="البريد الإلكتروني" required error={errors.email}>
          <input
            id="login-email"
            type="email"
            name="email"
            dir="ltr"
            placeholder="name@company.com"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field id="login-password" label="كلمة المرور" required error={errors.password}>
          <input
            id="login-password"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
            aria-invalid={!!errors.password}
          />
        </Field>
        <Alert type="error">{error}</Alert>
        <button type="submit" className="btn btn-block" disabled={isLoading}>
          {isLoading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
        </button>
      </form>
    </AuthLayout>
  );
}
