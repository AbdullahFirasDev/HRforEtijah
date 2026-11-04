import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useDeleteMessageMutation, useGetMessagesQuery, useSendMessageMutation } from '../features/api/messageApi';
import { useGetAllUsersQuery } from '../features/api/userApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import { DailyMessageCard } from '../components/DailyMessages';
import { formatDateTime, todayStr } from '../utils/format';
import { roleLabel } from '../utils/labels';

const MAX_DAYS = 31;
const emptyForm = () => ({ title: '', body: '', from: todayStr(), to: todayStr(), toAll: true, recipients: [] });

const validate = ({ title, body, from, to, toAll, recipients }) => {
  const days = from && to ? (Date.parse(to) - Date.parse(from)) / 864e5 + 1 : 0;
  let toError;
  if (!to) toError = 'اختر تاريخ النهاية';
  else if (to < from) toError = 'تاريخ النهاية يجب ألا يسبق تاريخ البداية';
  else if (days > MAX_DAYS) toError = `تظهر الرسالة ${MAX_DAYS} يوماً كحد أقصى`;
  return {
    title: title.trim() ? undefined : 'اكتب عنوان الرسالة',
    body: body.trim() ? undefined : 'اكتب نص الرسالة',
    from: !from ? 'اختر تاريخ البداية' : from < todayStr() ? 'لا يمكن إرسال رسالة ليوم مضى' : undefined,
    to: toError,
    recipients: !toAll && !recipients.length ? 'اختر موظفاً واحداً على الأقل' : undefined,
  };
};

const periodText = (m) => (m.from === m.to ? m.from : `${m.from} إلى ${m.to}`);

// Admins write a message and choose who sees it as a popup when they sign in
export default function AdminMessages() {
  const me = useSelector(selectCurrentUser);
  const { data, isLoading } = useGetMessagesQuery();
  const { data: usersData } = useGetAllUsersQuery({ limit: 1000 });
  const [sendMessage, { isLoading: sending }] = useSendMessageMutation();
  const [deleteMessage, { isLoading: deleting }] = useDeleteMessageMutation();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [readers, setReaders] = useState(null); // the message whose readers are shown
  const [confirmDelete, setConfirmDelete] = useState(null);

  // The sender never gets their own message as a popup
  const staff = useMemo(() => (usersData?.users || []).filter((u) => u.isActive && u.id !== me?.id), [usersData, me]);
  const shown = staff.filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase()));
  const allShownChosen = shown.length > 0 && shown.every((u) => form.recipients.includes(u.id));

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setSuccess('');
  };
  const togglePerson = (id) =>
    update({ recipients: form.recipients.includes(id) ? form.recipients.filter((x) => x !== id) : [...form.recipients, id] });
  const toggleShown = () => {
    const ids = shown.map((u) => u.id);
    update({
      recipients: allShownChosen ? form.recipients.filter((x) => !ids.includes(x)) : [...new Set([...form.recipients, ...ids])],
    });
  };

  const checked = () => {
    const found = validate(form);
    setErrors(found);
    return !Object.values(found).some(Boolean);
  };

  const preview = () => {
    const found = validate(form);
    if (found.title || found.body) setErrors(found);
    else setPreviewing(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!checked()) return;
    try {
      await sendMessage({ ...form, title: form.title.trim(), body: form.body.trim() }).unwrap();
      const who = form.toAll ? 'الجميع' : form.recipients.length === 1 ? 'موظف واحد' : `${form.recipients.length} موظفين`;
      setForm(emptyForm());
      setSuccess(`أُرسلت الرسالة إلى ${who}، وتظهر لهم عند تسجيل الدخول.`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر إرسال الرسالة. حاول مرة أخرى.');
    }
  };

  const remove = async (m) => {
    setError('');
    setSuccess('');
    try {
      await deleteMessage(m.id).unwrap();
      setConfirmDelete(null);
      setSuccess(`حُذفت رسالة «${m.title}».`);
    } catch (err) {
      setError(err?.data?.message || 'تعذر حذف الرسالة.');
    }
  };

  const columns = [
    {
      key: 'message',
      label: 'الرسالة',
      wrap: true,
      value: (m) => `${m.title} ${m.body}`,
      render: (m) => (
        <span className="cell-stack">
          <strong>{m.title}</strong>
          <small className="message-excerpt">{m.body}</small>
        </span>
      ),
    },
    { key: 'period', label: 'تظهر في', value: periodText, render: (m) => <span dir="ltr">{periodText(m)}</span> },
    { key: 'to', label: 'إلى', value: (m) => (m.toAll ? 'الجميع' : `${m.people.length} موظف`) },
    {
      key: 'reads',
      label: 'القراءة',
      value: (m) => `${m.readCount} من ${m.people.length}`,
      render: (m) => (
        <button type="button" className="btn secondary btn-sm" onClick={() => setReaders(m)}>
          {m.readCount} من {m.people.length}
        </button>
      ),
    },
    { key: 'sent', label: 'أُرسلت', value: (m) => formatDateTime(m.createdAt) },
    {
      key: 'action',
      label: 'الإجراء',
      value: () => '',
      render: (m) =>
        confirmDelete === m.id ? (
          <span className="row-actions">
            <button type="button" className="btn danger btn-sm" disabled={deleting} onClick={() => remove(m)}>
              تأكيد الحذف
            </button>
            <button type="button" className="btn secondary btn-sm" onClick={() => setConfirmDelete(null)}>
              تراجع
            </button>
          </span>
        ) : (
          <button type="button" className="btn secondary btn-sm" onClick={() => setConfirmDelete(m.id)}>
            حذف
          </button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="الرسائل" subtitle="اكتب رسالة واختر من تصل إليه، فتظهر له نافذة منبثقة عند تسجيل الدخول." />
      <Alert type="success" onClose={() => setSuccess('')}>
        {success}
      </Alert>

      <div className="card card-narrow">
        <h3 className="card-title">رسالة جديدة</h3>
        <form onSubmit={submit} noValidate>
          <Field id="msg-title" label="العنوان" required error={errors.title}>
            <input
              id="msg-title"
              maxLength={100}
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
              aria-invalid={!!errors.title}
            />
          </Field>
          <Field id="msg-body" label="نص الرسالة" required error={errors.body} hint={`${form.body.length} من 2000 حرف`}>
            <textarea
              id="msg-body"
              maxLength={2000}
              value={form.body}
              onChange={(e) => update({ body: e.target.value })}
              aria-invalid={!!errors.body}
            />
          </Field>

          <div className="form-row">
            <Field id="msg-from" label="تظهر من" required error={errors.from}>
              <div className="date-input" data-empty={!form.from} data-placeholder="اختر التاريخ">
                <input
                  id="msg-from"
                  type="date"
                  min={todayStr()}
                  value={form.from}
                  onChange={(e) => update({ from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })}
                  aria-invalid={!!errors.from}
                />
              </div>
            </Field>
            <Field id="msg-to" label="حتى" required error={errors.to}>
              <div className="date-input" data-empty={!form.to} data-placeholder="اختر التاريخ">
                <input
                  id="msg-to"
                  type="date"
                  min={form.from}
                  value={form.to}
                  onChange={(e) => update({ to: e.target.value })}
                  aria-invalid={!!errors.to}
                />
              </div>
            </Field>
          </div>
          <p className="field-hint form-row-hint">تظهر مرة واحدة في اليوم لكل شخص طوال هذه الفترة.</p>

          <fieldset className="field">
            <legend>إرسال إلى</legend>
            <div className="choice-cards">
              <label className="choice-card">
                <input type="radio" name="msg-audience" checked={form.toAll} onChange={() => update({ toAll: true })} />
                <span>
                  <strong>الجميع</strong>
                  <small>كل الموظفين والمدراء الذين حساباتهم نشطة</small>
                </span>
              </label>
              <label className="choice-card">
                <input type="radio" name="msg-audience" checked={!form.toAll} onChange={() => update({ toAll: false })} />
                <span>
                  <strong>موظفون محددون</strong>
                  <small>اختر من القائمة من تصل إليه الرسالة</small>
                </span>
              </label>
            </div>
          </fieldset>

          {!form.toAll && (
            <div className={['field', errors.recipients && 'field-invalid'].filter(Boolean).join(' ')}>
              <div className="people-tools">
                <input
                  type="search"
                  className="input-sm"
                  placeholder="ابحث عن موظف..."
                  aria-label="ابحث عن موظف"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="button" className="btn secondary btn-sm" disabled={!shown.length} onClick={toggleShown}>
                  {allShownChosen ? 'إلغاء تحديد الظاهرين' : 'تحديد الظاهرين'}
                </button>
              </div>
              <ul className="people-list">
                {shown.map((u) => (
                  <li key={u.id}>
                    <label>
                      <input type="checkbox" checked={form.recipients.includes(u.id)} onChange={() => togglePerson(u.id)} />
                      <span>{u.name}</span>
                      <small>{roleLabel(u.role)}</small>
                    </label>
                  </li>
                ))}
                {!shown.length && <li className="people-empty">لا يوجد موظف بهذا الاسم.</li>}
              </ul>
              {errors.recipients ? (
                <p className="field-error">{errors.recipients}</p>
              ) : (
                <p className="field-hint">تم اختيار {form.recipients.length}</p>
              )}
            </div>
          )}

          <Alert type="error">{error}</Alert>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={sending}>
              {sending ? 'جارٍ الإرسال...' : 'إرسال الرسالة'}
            </button>
            <button type="button" className="btn secondary" onClick={preview}>
              معاينة
            </button>
          </div>
        </form>
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <DataTable
          title="الرسائل المرسلة"
          exportTitle="الرسائل المرسلة"
          columns={columns}
          rows={data?.messages || []}
          rowKey={(m) => m.id}
          emptyLabel="لم تُرسل أي رسالة بعد."
          searchPlaceholder="ابحث في الرسائل..."
          fileName="messages"
        />
      )}

      {previewing && (
        <DailyMessageCard
          message={{ id: 'preview', title: form.title, body: form.body, sender: 'معاينة', sentAt: new Date() }}
          buttonLabel="إغلاق المعاينة"
          onDone={() => setPreviewing(false)}
        />
      )}

      {readers && (
        <div className="modal-overlay" onClick={() => setReaders(null)}>
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="readers-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="readers-title" className="card-title">
              من قرأ «{readers.title}»
            </h2>
            <ul className="week-list">
              {readers.people.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  {p.readAt ? (
                    <small>قرأها {formatDateTime(p.readAt)}</small>
                  ) : (
                    <span className="badge muted">لم يقرأها بعد</span>
                  )}
                </li>
              ))}
              {!readers.people.length && <li>لا يوجد مستلمون.</li>}
            </ul>
            <div className="form-actions">
              <button type="button" className="btn secondary" onClick={() => setReaders(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
