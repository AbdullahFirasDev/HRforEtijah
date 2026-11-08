import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAddLeaveAttachmentMutation,
  useCancelLeaveMutation,
  useGetLeaveQuery,
  useRemoveLeaveAttachmentMutation,
  useReviewLeaveMutation,
  useRevokeLeaveMutation,
} from '../features/api/leaveApi';
import Alert from './Alert';
import Field from './Field';
import Loading from './Loading';
import LeaveStatusBadge from './LeaveStatusBadge';
import { formatDateTime } from '../utils/format';
import { roleLabel } from '../utils/labels';
import {
  ACCEPTED_FILES,
  COUNT_MODES,
  HISTORY_ACTIONS,
  MAX_FILES,
  daysText,
  fetchAttachmentUrl,
  fileSizeText,
  prepareFile,
  rangeText,
} from '../utils/leaves';

// One leave request: its details, files, decision and full history, with
// the actions the signed-in person may take (the server checks them again).
export default function LeaveDetailsModal({ id, onClose, onDone }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error: loadError } = useGetLeaveQuery(id);
  const [review, { isLoading: reviewing }] = useReviewLeaveMutation();
  const [cancel, { isLoading: cancelling }] = useCancelLeaveMutation();
  const [revoke, { isLoading: revoking }] = useRevokeLeaveMutation();
  const [addFile, { isLoading: adding }] = useAddLeaveAttachmentMutation();
  const [removeFile] = useRemoveLeaveAttachmentMutation();

  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState('');
  const [step, setStep] = useState(null); // 'cancel' | 'revoke'
  const [stepReason, setStepReason] = useState('');
  const [stepError, setStepError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [preview, setPreview] = useState(null); // { url, name }
  const fileRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !preview && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, preview]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);
  useEffect(() => {
    if (feedback) boxRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [feedback]);

  const r = data?.request;
  const can = data?.permissions || {};
  const balance = data?.balance;

  const act = async (fn, text) => {
    setFeedback(null);
    try {
      await fn();
      setFeedback({ type: 'success', text });
      onDone?.(text);
      return true;
    } catch (err) {
      setFeedback({ type: 'error', text: err?.data?.message || err?.message || 'تعذر تنفيذ الإجراء. حاول مرة أخرى.' });
      return false;
    }
  };

  const decide = async (status) => {
    const text = remarks.trim();
    if (status === 'Rejected' && text.length < 3) {
      setRemarksError('اكتب سبب الرفض (3 أحرف على الأقل)');
      return;
    }
    const ok = await act(
      () => review({ id, status, remarks: text }).unwrap(),
      status === 'Approved' ? `تم قبول طلب ${r.user?.name || 'الموظف'} رقم ${r.number}.` : `تم رفض طلب ${r.user?.name || 'الموظف'} رقم ${r.number}.`
    );
    if (ok) setRemarks('');
  };

  const confirmStep = async () => {
    const text = stepReason.trim();
    if (step === 'revoke' && text.length < 3) {
      setStepError('اكتب سبب إلغاء الإجازة المقبولة (3 أحرف على الأقل)');
      return;
    }
    const ok =
      step === 'revoke'
        ? await act(() => revoke({ id, reason: text }).unwrap(), `أُلغيت إجازة ${r.user?.name || 'الموظف'} رقم ${r.number}، وأُبلغ الموظف.`)
        : await act(() => cancel({ id, reason: text }).unwrap(), `أُلغي طلبك رقم ${r.number}.`);
    if (ok) {
      setStep(null);
      setStepReason('');
    }
  };

  const openFile = async (f) => {
    setFeedback(null);
    // Opened before the download finishes, so the browser doesn't block it
    const win = f.type === 'application/pdf' ? window.open('', '_blank') : null;
    try {
      const url = await fetchAttachmentUrl(id, f._id);
      if (f.type !== 'application/pdf') {
        setPreview({ url, name: f.name });
      } else if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
      }
    } catch (err) {
      win?.close();
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const pickFile = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    try {
      const { file, name } = await prepareFile(raw);
      await act(() => addFile({ id, file, name }).unwrap(), `أُضيف «${name}» إلى الطلب.`);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  const busy = reviewing || cancelling || revoking || adding;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !preview && onClose()}>
      <div ref={boxRef} className="modal-box modal-wide leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title">
        {isLoading ? (
          <Loading />
        ) : isError || !r ? (
          <>
            <Alert type="error">{loadError?.data?.message || 'تعذر تحميل الطلب.'}</Alert>
            <div className="form-actions manage-footer">
              <button type="button" className="btn secondary" onClick={onClose}>
                إغلاق
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="leave-modal-head">
              <h2 id="leave-modal-title" className="card-title">
                طلب إجازة رقم <span dir="ltr">{r.number}</span>
              </h2>
              <LeaveStatusBadge status={r.status} />
            </div>

            {feedback && (
              <Alert type={feedback.type} onClose={() => setFeedback(null)}>
                {feedback.text}
              </Alert>
            )}

            <dl className="detail-grid">
              <div>
                <dt>الموظف</dt>
                <dd>
                  {r.user?.name || '-'}
                  {(r.user?.employeeNumber || r.user?.department) && (
                    <small>{[r.user.employeeNumber && `رقم ${r.user.employeeNumber}`, r.user.department, r.user.jobTitle].filter(Boolean).join(' · ')}</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>نوع الإجازة</dt>
                <dd>
                  {r.typeName}
                  <small>
                    {r.policy?.paid === false ? 'غير مدفوعة' : 'مدفوعة'} · {COUNT_MODES[r.policy?.countMode]?.label || '-'}
                  </small>
                </dd>
              </div>
              <div>
                <dt>الفترة</dt>
                <dd>{rangeText(r)}</dd>
              </div>
              <div>
                <dt>عدد الأيام</dt>
                <dd>
                  {daysText(r.days)}
                  {r.calendarDays !== r.days && <small>من أصل {daysText(r.calendarDays)} في الفترة</small>}
                </dd>
              </div>
              <div>
                <dt>تاريخ التقديم</dt>
                <dd>{formatDateTime(r.createdAt)}</dd>
              </div>
              {balance && (
                <div>
                  <dt>رصيد سنة {balance.year}</dt>
                  <dd>
                    المتبقي {daysText(balance.remaining)}
                    <small>
                      الإجمالي {daysText(balance.total)} · المستخدم {daysText(balance.used)} · قيد المراجعة {daysText(balance.pending)}
                    </small>
                  </dd>
                </div>
              )}
            </dl>

            <section className="manage-section">
              <h3>سبب الإجازة</h3>
              <p className="manage-text pre-line">{r.reason}</p>
              {r.notes && (
                <>
                  <h3>ملاحظات</h3>
                  <p className="manage-text pre-line">{r.notes}</p>
                </>
              )}
            </section>

            <section className="manage-section">
              <h3>المرفقات ({r.attachments.length})</h3>
              {r.attachments.length ? (
                <ul className="file-list">
                  {r.attachments.map((f) => (
                    <li key={f._id}>
                      <span className="file-kind" aria-hidden="true">
                        {f.type === 'application/pdf' ? 'PDF' : 'صورة'}
                      </span>
                      <span className="file-name">{f.name}</span>
                      <small>{fileSizeText(f.size)}</small>
                      <span className="row-actions">
                        <button type="button" className="btn secondary btn-sm" onClick={() => openFile(f)}>
                          عرض
                        </button>
                        {can.canEditAttachments && (
                          <button
                            type="button"
                            className="btn secondary btn-sm"
                            disabled={busy}
                            onClick={() => act(() => removeFile({ id, attId: f._id }).unwrap(), `حُذف «${f.name}».`)}
                          >
                            حذف
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="manage-text">لا توجد مرفقات.</p>
              )}
              {can.canEditAttachments && r.attachments.length < MAX_FILES && (
                <>
                  <input ref={fileRef} type="file" accept={ACCEPTED_FILES} className="visually-hidden" onChange={pickFile} aria-label="إضافة مرفق" />
                  <button type="button" className="btn secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {adding ? 'جارٍ الرفع...' : 'إضافة مرفق'}
                  </button>
                </>
              )}
            </section>

            {(r.reviewedAt || r.cancelledAt) && (
              <section className="manage-section">
                <h3>القرار</h3>
                {r.reviewedAt && (
                  <p className="manage-text">
                    {r.status === 'Rejected' ? 'رفضه' : 'وافق عليه'} <strong>{r.reviewedByName || '-'}</strong> في {formatDateTime(r.reviewedAt)}
                    {r.reviewRemarks && (
                      <>
                        <br />
                        {r.status === 'Rejected' ? 'سبب الرفض' : 'الملاحظات'}: {r.reviewRemarks}
                      </>
                    )}
                  </p>
                )}
                {r.cancelledAt && (
                  <p className="manage-text">
                    ألغاه <strong>{r.cancelledByName || '-'}</strong> في {formatDateTime(r.cancelledAt)}
                    {r.cancelReason && (
                      <>
                        <br />
                        السبب: {r.cancelReason}
                      </>
                    )}
                  </p>
                )}
              </section>
            )}

            {can.canReview && (
              <section className="manage-section">
                <h3>المراجعة</h3>
                <Field id="leave-remarks" label="ملاحظاتك" hint="اختيارية عند القبول، ومطلوبة عند الرفض (سبب الرفض)" error={remarksError}>
                  <textarea
                    id="leave-remarks"
                    maxLength={500}
                    rows={3}
                    value={remarks}
                    onChange={(e) => {
                      setRemarks(e.target.value);
                      setRemarksError('');
                    }}
                    aria-invalid={!!remarksError}
                  />
                </Field>
                <div className="form-actions">
                  <button type="button" className="btn success" disabled={busy} onClick={() => decide('Approved')}>
                    قبول الطلب
                  </button>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => decide('Rejected')}>
                    رفض الطلب
                  </button>
                </div>
              </section>
            )}

            {step && (
              <section className="manage-section danger-zone">
                <h3>{step === 'revoke' ? 'إلغاء الإجازة المقبولة' : 'إلغاء الطلب'}</h3>
                <p className="form-note">
                  {step === 'revoke'
                    ? 'تُعاد أيامها إلى رصيد الموظف ويُبلَّغ بالإلغاء. يبقى القرار السابق في سجل الطلب.'
                    : 'لا يمكن التراجع عن الإلغاء؛ يمكنك تقديم طلب جديد لاحقاً.'}
                </p>
                <Field id="leave-step-reason" label={step === 'revoke' ? 'سبب الإلغاء' : 'سبب الإلغاء (اختياري)'} required={step === 'revoke'} error={stepError}>
                  <input
                    id="leave-step-reason"
                    maxLength={300}
                    value={stepReason}
                    onChange={(e) => {
                      setStepReason(e.target.value);
                      setStepError('');
                    }}
                    aria-invalid={!!stepError}
                  />
                </Field>
                <div className="form-actions">
                  <button type="button" className="btn danger" disabled={busy} onClick={confirmStep}>
                    {busy ? 'جارٍ الإلغاء...' : 'تأكيد الإلغاء'}
                  </button>
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep(null)}>
                    تراجع
                  </button>
                </div>
              </section>
            )}

            <section className="manage-section">
              <h3>سجل الطلب</h3>
              <ol className="leave-history">
                {r.history.map((h, i) => (
                  <li key={i}>
                    <strong>{HISTORY_ACTIONS[h.action] || h.action}</strong>
                    <span>
                      {h.byName || '-'} {h.byRole && <small>({roleLabel(h.byRole)})</small>}
                    </span>
                    <time dateTime={h.at}>{formatDateTime(h.at)}</time>
                    {h.note && <p>{h.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <div className="form-actions manage-footer">
              {can.canCancel && !step && (
                <button type="button" className="btn secondary" onClick={() => setStep('cancel')}>
                  إلغاء الطلب
                </button>
              )}
              {can.canRevoke && !step && (
                <button type="button" className="btn secondary" onClick={() => setStep('revoke')}>
                  إلغاء الإجازة المقبولة
                </button>
              )}
              <button type="button" className="btn" onClick={() => navigate(`/print/leave/${id}`)}>
                معاينة وطباعة A4
              </button>
              <button type="button" className="btn secondary" onClick={onClose}>
                إغلاق
              </button>
            </div>
          </>
        )}
      </div>

      {preview && (
        <div className="image-preview" role="dialog" aria-modal="true" aria-label={preview.name} onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <figure>
            <img src={preview.url} alt={preview.name} />
            <figcaption>
              <span>{preview.name}</span>
              <a className="btn-link" href={preview.url} download={preview.name}>
                تنزيل
              </a>
              <button type="button" className="btn secondary btn-sm" onClick={() => setPreview(null)}>
                إغلاق
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
