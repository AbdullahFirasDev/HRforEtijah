import { useRef, useState } from 'react';
import { useDeleteLeaveDraftMutation, useUploadLeaveDraftMutation } from '../features/api/leaveApi';
import { ACCEPTED_FILES, MAX_FILES, fileSizeText, prepareFile } from '../utils/leaves';

// Supporting documents for a new leave request. Each file is uploaded as soon
// as it is chosen (photos are shrunk first) and kept as a draft until the
// request is sent; `value` holds the uploaded drafts.
export default function AttachmentPicker({ id, value, onChange, required, error, disabled }) {
  const inputRef = useRef(null);
  const [upload] = useUploadLeaveDraftMutation();
  const [removeDraft] = useDeleteLeaveDraftMutation();
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState('');

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    setProblem('');
    const room = MAX_FILES - value.length;
    if (files.length > room) setProblem(`يمكن إرفاق ${MAX_FILES} ملفات كحد أقصى`);
    let next = value;
    for (const raw of files.slice(0, Math.max(0, room))) {
      setBusy((n) => n + 1);
      try {
        const { file, name } = await prepareFile(raw);
        const res = await upload({ file, name }).unwrap();
        next = [...next, res.attachment];
        onChange(next);
      } catch (err) {
        setProblem(err?.data?.message || err?.message || 'تعذر رفع الملف');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  const remove = async (file) => {
    onChange(value.filter((f) => f.id !== file.id));
    removeDraft(file.id); // a draft left behind is deleted by the server after a day anyway
  };

  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>
        المستندات الداعمة
        {required && (
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {value.length > 0 && (
        <ul className="file-list">
          {value.map((f) => (
            <li key={f.id}>
              <span className="file-kind" aria-hidden="true">
                {f.type === 'application/pdf' ? 'PDF' : 'صورة'}
              </span>
              <span className="file-name">{f.name}</span>
              <small>{fileSizeText(f.size)}</small>
              <button type="button" className="btn secondary btn-sm" onClick={() => remove(f)} disabled={disabled} aria-label={`حذف ${f.name}`}>
                حذف
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        className="visually-hidden"
        onChange={pick}
        disabled={disabled || busy > 0 || value.length >= MAX_FILES}
      />
      <button
        type="button"
        className="btn secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy > 0 || value.length >= MAX_FILES}
        aria-describedby={`${id}-hint`}
      >
        {busy ? 'جارٍ رفع الملف...' : value.length ? 'إرفاق ملف آخر' : 'إرفاق ملف'}
      </button>
      {problem || error ? (
        <p className="field-error" role="alert">
          {problem || error}
        </p>
      ) : (
        <p className="field-hint" id={`${id}-hint`}>
          PDF أو صورة، حتى {MAX_FILES} ملفات، 2 ميغابايت للملف (تُصغَّر الصور تلقائياً).
        </p>
      )}
    </div>
  );
}
