import Field from './Field';
import { DAY_NAMES, MAX_SESSIONS_PER_DAY, WEEK_ORDER } from '../utils/workSchedule';

// Working hours, weekly days off and the multiple check-in exception, shared
// by the "add employee" and "manage account" windows.
// value: { start, end, offDays, allowMultiple } (see utils/workSchedule.js)
export default function WorkScheduleFields({ idPrefix, value, errors, onChange }) {
  const id = (name) => `${idPrefix}-${name}`;
  const set = (patch) => onChange({ ...value, ...patch });
  const toggleDay = (day) =>
    set({ offDays: value.offDays.includes(day) ? value.offDays.filter((d) => d !== day) : [...value.offDays, day] });

  return (
    <>
      <div className="form-row">
        <Field id={id('start')} label="بداية الدوام" error={errors.start}>
          <input
            id={id('start')}
            type="time"
            dir="ltr"
            value={value.start}
            onChange={(e) => set({ start: e.target.value })}
            aria-invalid={!!errors.start}
          />
        </Field>
        <Field id={id('end')} label="نهاية الدوام" error={errors.end}>
          <input
            id={id('end')}
            type="time"
            dir="ltr"
            value={value.end}
            onChange={(e) => set({ end: e.target.value })}
            aria-invalid={!!errors.end}
          />
        </Field>
      </div>
      <p className="field-hint form-row-hint">
        يُحسب التأخير والانصراف المبكر على هذه الساعات. اتركهما فارغين إن لم يكن للموظف دوام ثابت.
      </p>

      <fieldset className={['field', errors.offDays && 'field-invalid'].filter(Boolean).join(' ')}>
        <legend>يوم الإجازة الأسبوعية</legend>
        <div className="day-chips">
          {WEEK_ORDER.map((day) => (
            <label key={day} className="day-chip">
              <input type="checkbox" checked={value.offDays.includes(day)} onChange={() => toggleDay(day)} />
              <span>{DAY_NAMES[day]}</span>
            </label>
          ))}
        </div>
        {errors.offDays ? (
          <p className="field-error">{errors.offDays}</p>
        ) : (
          <p className="field-hint">يمكن اختيار أكثر من يوم. من يحضر في يوم إجازته يُعلَّم سجله بذلك.</p>
        )}
      </fieldset>

      <label className="check-row" htmlFor={id('multiple')}>
        <input
          id={id('multiple')}
          type="checkbox"
          checked={value.allowMultiple}
          onChange={(e) => set({ allowMultiple: e.target.checked })}
        />
        <span>
          <strong>السماح بتسجيل الحضور والانصراف أكثر من مرة في اليوم</strong>
          <small>
            استثناء لمن تتطلب طبيعة عمله الخروج والعودة خلال اليوم، حتى {MAX_SESSIONS_PER_DAY} فترات، وتُجمع ساعاتها.
          </small>
        </span>
      </label>
    </>
  );
}
