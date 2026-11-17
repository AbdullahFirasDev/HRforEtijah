import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useFaceLoginMutation, useGetDeviceAccountsQuery, useLoginMutation } from '../features/api/authApi';
import { selectAuthNotice, setCredentials } from '../features/auth/authSlice';
import AuthLayout from '../components/AuthLayout';
import FaceCapture from '../components/FaceCapture';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import { hasErrors, validateLoginForm } from '../utils/validation';
import { getDeviceId } from '../utils/deviceId';
import { preloadFaceEngine } from '../utils/faceEngine';

// Face login is the main way in, with the face print each employee already
// registered for check-ins, on the device their account is tied to. Email and
// password stay available, and are the way in on a device with no face
// registered yet.
export default function Login() {
  const deviceId = getDeviceId();
  const { data: deviceData, isLoading: checkingDevice } = useGetDeviceAccountsQuery(deviceId, {
    refetchOnMountOrArgChange: true,
  });
  const faceAccounts = (deviceData?.accounts || []).filter((a) => a.faceEnrolled);
  const faceAvailable = faceAccounts.length > 0;
  // null: the default, face when this device has an account with a face print
  const [chosen, setChosen] = useState(null);
  const mode = chosen || (faceAvailable ? 'face' : 'password');

  const notice = useSelector(selectAuthNotice);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const signedIn = (res) => {
    dispatch(setCredentials(res));
    navigate(`/${res.user.role}`);
  };

  // The models start loading as soon as face login is possible, so the scan
  // begins the moment the camera is on
  useEffect(() => {
    if (faceAvailable) preloadFaceEngine();
  }, [faceAvailable]);

  // ---------- face
  const [faceLogin, { isLoading: faceSigningIn }] = useFaceLoginMutation();
  const [scanning, setScanning] = useState(false);
  const [faceError, setFaceError] = useState('');

  const startScan = () => {
    setFaceError('');
    setScanning(true);
  };

  const handleFace = async (print) => {
    setScanning(false);
    try {
      signedIn(await faceLogin({ deviceId, face: print }).unwrap());
    } catch (err) {
      setFaceError(err?.data?.message || 'تعذر تسجيل الدخول. تحقق من اتصالك ثم حاول مرة أخرى.');
    }
  };

  // ---------- email and password
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [login, { isLoading }] = useLoginMutation();

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
      signedIn(await login({ ...form, deviceId }).unwrap());
    } catch (err) {
      setError(err?.data?.message || 'تعذر تسجيل الدخول. تحقق من اتصالك ثم حاول مرة أخرى.');
    }
  };

  const switchTo = (next) => {
    setScanning(false);
    setFaceError('');
    setError('');
    setChosen(next);
  };

  const greeting =
    faceAccounts.length === 1 ? `مرحباً ${faceAccounts[0].name}` : `الحسابات على هذا الجهاز: ${faceAccounts.map((a) => a.name).join('، ')}`;

  return (
    <AuthLayout
      title="مرحباً بعودتك"
      subtitle="سجّل الدخول إلى نظام الاتجاه للحضور"
      footer={
        <>
          <p className="auth-footer">
            ليس لديك حساب؟ <Link to="/signup">إنشاء حساب</Link>
          </p>
          <p className="auth-note">
            ملاحظة: يُربط حسابك بأول جهاز تسجّل الدخول منه، ولا يمكن الدخول إليه من جهاز آخر إلا بعد أن يعيد مسؤول
            النظام تعيين الجهاز. بعد تسجيل بصمة وجهك (عند أول تسجيل حضور) تدخل بوجهك مباشرة من هذا الجهاز.
          </p>
        </>
      }
    >
      <Alert type="warning">{notice}</Alert>

      {checkingDevice ? (
        <Loading label="جارٍ التحقق من هذا الجهاز..." />
      ) : mode === 'face' ? (
        <div className="face-login">
          <p className="face-login-greeting">{greeting}</p>
          {scanning ? (
            <FaceCapture onCapture={handleFace} onCancel={() => setScanning(false)} />
          ) : faceSigningIn ? (
            <Loading label="جارٍ تسجيل الدخول..." />
          ) : (
            <>
              <Alert type="error">{faceError}</Alert>
              <button type="button" className="btn btn-block face-login-start" onClick={startScan}>
                {faceError ? 'إعادة المحاولة ببصمة الوجه' : 'تسجيل الدخول ببصمة الوجه'}
              </button>
            </>
          )}
          <p className="login-switch">
            <button type="button" className="link-button" onClick={() => switchTo('password')}>
              الدخول بالبريد الإلكتروني وكلمة المرور
            </button>
          </p>
        </div>
      ) : (
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
          {faceAvailable && (
            <p className="login-switch">
              <button type="button" className="link-button" onClick={() => switchTo('face')}>
                الدخول ببصمة الوجه
              </button>
            </p>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
