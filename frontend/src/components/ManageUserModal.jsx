import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import {
  useChangePasswordMutation,
  useDeleteUserMutation,
  useGetAllUsersQuery,
  useResetDeviceMutation,
  useUpdateUserMutation,
} from '../features/api/userApi';
import Field from './Field';
import Alert from './Alert';
import WorkScheduleFields from './WorkScheduleFields';
import { formatDate } from '../utils/format';
import { roleLabel } from '../utils/labels';
import { MIN_PASSWORD, hasErrors, validateNewPassword, validateWorkSchedule } from '../utils/validation';
import { workFormFrom, workPayload } from '../utils/workSchedule';

const EMPTY_PASSWORD = { password: '', confirm: '' };

// Admin-only actions on one account: working hours (employees), new password,
// device reset, activate/deactivate, and delete (moving the person's team
// elsewhere first).
export default function ManageUserModal({ user, onClose, onDeleted }) {
  const me = useSelector(selectCurrentUser);
  const isSelf = me?.id === user.id;
  // Unfiltered list (the page may be filtered by role) for team size and transfer targets
  const { data: allData } = useGetAllUsersQuery({ role: undefined });
  const users = allData?.users || [];

  const [changePassword, { isLoading: savingPassword }] = useChangePasswordMutation();
  const [resetDevice, { isLoading: resetting }] = useResetDeviceMutation();
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation();
  const [deleteUser, { isLoading: deleting }] = useDeleteUserMutation();

  const [work, setWork] = useState(() => workFormFrom(user));
  const [workErrors, setWorkErrors] = useState({});
  const [pw, setPw] = useState(EMPTY_PASSWORD);
  const [pwErrors, setPwErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferError, setTransferError] = useState('');

  // The window scrolls on small screens: bring results and the delete step into view
  const feedbackRef = useRef(null);
  const confirmRef = useRef(null);
  useEffect(() => {
    if (feedback) feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [feedback]);
  useEffect(() => {
    if (confirmDelete) confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [confirmDelete]);

  const team = users.filter((u) => String(u.manager) === String(user.id));
  const transferOptions = users.filter((u) => u.id !== user.id && u.isActive && ['manager', 'admin'].includes(u.role));

  const run = async (action, successText) => {
    setFeedback(null);
    try {
      await action().unwrap();
      setFeedback({ type: 'success', text: successText });
      return true;
    } catch (err) {
      setFeedback({ type: 'error', text: err?.data?.message || 'تعذر تنفيذ الإجراء. حاول مرة أخرى.' });
      return false;
    }
  };

  const handleWorkChange = (next) => {
    setWork(next);
    setWorkErrors({});
  };

  const saveWork = (e) => {
    e.preventDefault();
    const found = validateWorkSchedule(work);
    setWorkErrors(found);
    if (hasErrors(found)) return;
    run(() => updateUser({ id: user.id, ...workPayload(work) }), `تم حفظ دوام ${user.name}.`);
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPw((p) => ({ ...p, [name]: value }));
    setPwErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const savePassword = async (e) => {
    e.preventDefault();
    const found = validateNewPassword(pw);
    setPwErrors(found);
    if (hasErrors(found)) return;
    const ok = await run(
      () => changePassword({ id: user.id, password: pw.password }),
      isSelf
        ? 'تم تغيير كلمة مرورك. سجّل الدخول من جديد بكلمة المرور الجديدة.'
        : `تم تغيير كلمة مرور ${user.name}، وأُنهيت جلساته الحالية. شارك معه كلمة المرور الجديدة.`
    );
    if (ok) setPw(EMPTY_PASSWORD);
  };

  const handleDelete = async () => {
    setTransferError('');
    if (team.length && !transferTo) {
      setTransferError('اختر المدير الذي يُنقل إليه موظفو هذا الحساب');
      return;
    }
    setFeedback(null);
    try {
      const res = await deleteUser({ id: user.id, transferTo: team.length ? transferTo : undefined }).unwrap();
      const target = transferOptions.find((u) => u.id === transferTo);
      onDeleted(
        `تم حذف حساب ${user.name}، وحُذف معه ${res.deleted.attendance} من سجلات الحضور و${res.deleted.overtime} من طلبات العمل الإضافي` +
          (res.transferred ? `، ونُقل ${res.transferred} من موظفيه إلى ${target?.name || 'المدير المختار'}.` : '.')
      );
    } catch (err) {
      setFeedback({ type: 'error', text: err?.data?.message || 'تعذر حذف الحساب. حاول مرة أخرى.' });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide" role="dialog" aria-modal="true" aria-labelledby="manage-user-title">
        <h2 id="manage-user-title" className="card-title">
          إدارة حساب {user.name}
        </h2>
        <div className="manage-meta">
          <span dir="ltr">{user.email}</span>
          <span className="badge info">{roleLabel(user.role)}</span>
          <span className={`badge ${user.isActive ? 'success' : 'danger'}`}>{user.isActive ? 'نشط' : 'معطّل'}</span>
          {isSelf && <span className="badge muted">حسابك</span>}
        </div>

        <div ref={feedbackRef}>
          {feedback && (
            <Alert type={feedback.type} onClose={() => setFeedback(null)}>
              {feedback.text}
            </Alert>
          )}
        </div>

        {user.role === 'employee' && (
          <section className="manage-section">
            <h3>الدوام والاستثناءات</h3>
            <p className="form-note">
              تُعتمد ساعات الدوام ويوم الإجازة لكل يوم عند أول تسجيل حضور فيه، فلا يتغير ما سُجّل سابقاً. أما السماح بتعدد
              الحضور فيسري فوراً.
            </p>
            <form onSubmit={saveWork} noValidate>
              <WorkScheduleFields idPrefix="manage-work" value={work} errors={workErrors} onChange={handleWorkChange} />
              <button type="submit" className="btn" disabled={updating}>
                {updating ? 'جارٍ الحفظ...' : 'حفظ الدوام'}
              </button>
            </form>
          </section>
        )}

        <section className="manage-section">
          <h3>تغيير كلمة المرور</h3>
          <p className="form-note">
            {isSelf
              ? 'بعد الحفظ تنتهي جلستك الحالية، وتسجّل الدخول بكلمة المرور الجديدة.'
              : 'بعد الحفظ تنتهي كل جلسات المستخدم الحالية، ويسجّل الدخول بكلمة المرور الجديدة.'}
          </p>
          <form onSubmit={savePassword} noValidate>
            <Field id="manage-password" label="كلمة المرور الجديدة" required hint={`${MIN_PASSWORD} أحرف على الأقل`} error={pwErrors.password}>
              <input
                id="manage-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={pw.password}
                onChange={handlePasswordChange}
                aria-invalid={!!pwErrors.password}
              />
            </Field>
            <Field id="manage-confirm" label="تأكيد كلمة المرور" required error={pwErrors.confirm}>
              <input
                id="manage-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={handlePasswordChange}
                aria-invalid={!!pwErrors.confirm}
              />
            </Field>
            <button type="submit" className="btn" disabled={savingPassword}>
              {savingPassword ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}
            </button>
          </form>
        </section>

        <section className="manage-section">
          <h3>الجهاز المسجّل</h3>
          {user.device ? (
            <>
              <p className="manage-text">
                <strong>{user.device.label}</strong> — مسجّل منذ {formatDate(user.device.registeredAt)}
              </p>
              <button
                type="button"
                className="btn secondary"
                disabled={resetting}
                onClick={() =>
                  run(() => resetDevice(user.id), `تمت إعادة تعيين جهاز ${user.name}. سيُسجَّل الجهاز الذي يدخل منه في المرة القادمة.`)
                }
              >
                إعادة تعيين الجهاز
              </button>
            </>
          ) : (
            <p className="manage-text">لم يُسجَّل جهاز بعد؛ سيُسجَّل أول جهاز يدخل منه.</p>
          )}
        </section>

        <section className="manage-section">
          <h3>حالة الحساب</h3>
          {isSelf ? (
            <p className="manage-text">لا يمكنك تعطيل حسابك بنفسك.</p>
          ) : (
            <>
              <p className="manage-text">
                {user.isActive
                  ? 'التعطيل يمنع الدخول مع الاحتفاظ بكل سجلات الحضور، ويمكن التفعيل لاحقاً.'
                  : 'الحساب معطّل ولا يمكنه الدخول. سجلاته محفوظة.'}
              </p>
              <button
                type="button"
                className={`btn ${user.isActive ? 'secondary' : 'success'}`}
                disabled={updating}
                onClick={() =>
                  run(
                    () => updateUser({ id: user.id, isActive: !user.isActive }),
                    user.isActive ? `تم تعطيل حساب ${user.name}.` : `تم تفعيل حساب ${user.name}.`
                  )
                }
              >
                {user.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
              </button>
            </>
          )}
        </section>

        <section className="manage-section danger-zone">
          <h3>حذف الحساب</h3>
          {isSelf ? (
            <p className="manage-text">لا يمكنك حذف حسابك بنفسك. اطلب ذلك من مسؤول آخر.</p>
          ) : !confirmDelete ? (
            <>
              <p className="manage-text">
                يحذف الحساب وكل سجلات حضوره وطلبات العمل الإضافي نهائياً. لإيقاف الدخول مع الاحتفاظ بالسجلات استخدم «تعطيل
                الحساب».
              </p>
              <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
                حذف الحساب…
              </button>
            </>
          ) : (
            <div ref={confirmRef}>
              <Alert type="error" title="تأكيد الحذف النهائي">
                سيُحذف حساب {user.name} وجميع سجلاته، ولا يمكن التراجع عن ذلك.
              </Alert>
              {team.length > 0 && (
                <Field
                  id="manage-transfer"
                  label={`نقل الموظفين التابعين (${team.length}) إلى`}
                  required
                  error={transferError || (transferOptions.length === 0 ? 'لا يوجد مدير آخر نشط لنقل الموظفين إليه.' : undefined)}
                >
                  <select
                    id="manage-transfer"
                    value={transferTo}
                    onChange={(e) => {
                      setTransferTo(e.target.value);
                      setTransferError('');
                    }}
                    aria-invalid={!!transferError}
                  >
                    <option value="" disabled>
                      اختر المدير
                    </option>
                    {transferOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({roleLabel(m.role)})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="form-actions">
                <button type="button" className="btn danger" disabled={deleting} onClick={handleDelete}>
                  {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف نهائياً'}
                </button>
                <button type="button" className="btn secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                  تراجع
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="form-actions manage-footer">
          <button type="button" className="btn secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
