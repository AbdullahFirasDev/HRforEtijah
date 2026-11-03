import { useState } from 'react';
import Field from './Field';
import Alert from './Alert';
import { useExtendSessionMutation } from '../features/api/attendanceApi';
import { formatClockTime } from '../utils/format';

const CHOICES = [
  { hours: 1, label: 'ساعة' },
  { hours: 2, label: 'ساعتان' },
  { hours: 3, label: '3 ساعات' },
  { hours: 4, label: '4 ساعات' },
];

// Lets an employee keep working past the end of their period. The period
// then closes by itself only at the new time; checking out earlier is fine.
export default function ExtendTimePanel({ onDone, onCancel }) {
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [extend, { isLoading }] = useExtendSessionMutation();

  const submit = async () => {
    setError('');
    try {
      const res = await extend({ hours, reason: reason.trim() || null }).unwrap();
      onDone(
        `تم تمديد وقتك حتى ${formatClockTime(res.extendedUntil)}. سجّل انصرافك عند انتهائك، ويُرسل الوقت الإضافي إلى مديرك للموافقة.`
      );
    } catch (err) {
      setError(err?.data?.message || 'تعذر تمديد الوقت. حاول مرة أخرى.');
    }
  };

  return (
    <div className="extend-panel">
      <p className="extend-question">كم ستعمل بعد نهاية الوقت الحالي؟</p>
      <div className="day-chips" role="radiogroup" aria-label="مدة التمديد">
        {CHOICES.map((c) => (
          <label key={c.hours} className="day-chip">
            <input type="radio" name="extend-hours" checked={hours === c.hours} onChange={() => setHours(c.hours)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      <Field id="extend-reason" label="سبب العمل الإضافي (اختياري)" hint="يظهر لمديرك مع طلب العمل الإضافي">
        <input id="extend-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Alert type="error">{error}</Alert>
      <div className="form-actions">
        <button type="button" className="btn" disabled={isLoading} onClick={submit}>
          {isLoading ? 'جارٍ التمديد...' : 'تأكيد التمديد'}
        </button>
        <button type="button" className="btn secondary" disabled={isLoading} onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  );
}
