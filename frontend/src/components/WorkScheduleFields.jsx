import { formatHours } from '../utils/format';
import {
  DAY_NAMES,
  MAX_SESSIONS_PER_DAY,
  MAX_SHIFTS_PER_DAY,
  dayFormHours,
  formWeeklyTotal,
  shiftsText,
} from '../utils/workSchedule';

// Weekly schedule — each day off, or working in one or more periods (e.g.
// 09:00–15:00 and 17:00–23:00 around a break) — and the multiple check-in
// exception, shared by the "add employee" and "manage account" windows.
// value: { days: [{ day, off, shifts: [{ start, end }] }], allowMultiple }
export default function WorkScheduleFields({ idPrefix, value, errors, onChange }) {
  const id = (name) => `${idPrefix}-${name}`;
  const setDay = (day, patch) =>
    onChange({ ...value, days: value.days.map((d) => (d.day === day ? { ...d, ...patch } : d)) });
  const setShift = (d, i, patch) => setDay(d.day, { shifts: d.shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  // The first working day with complete periods can be copied to the others
  const template = value.days.find((d) => !d.off && dayFormHours(d) > 0);
  const copyTemplate = () => {
    const shifts = template.shifts.filter((s) => s.start && s.end);
    onChange({ ...value, days: value.days.map((d) => (d.off ? d : { ...d, shifts: shifts.map((s) => ({ ...s })) })) });
  };

  return (
    <>
      <fieldset className={['field', errors.offDays && 'field-invalid'].filter(Boolean).join(' ')}>
        <legend>ساعات الدوام لكل يوم</legend>
        <div className="week-grid">
          <div className="week-head" aria-hidden="true">
            <span>اليوم</span>
            <span />
            <span>فترات الدوام (من – إلى)</span>
          </div>
          {value.days.map((d) => {
            const name = DAY_NAMES[d.day];
            const error = errors[`day${d.day}`];
            const hours = dayFormHours(d);
            return (
              <div key={d.day} className={['week-row', d.off && 'is-off'].filter(Boolean).join(' ')}>
                <span className="week-day">
                  {name}
                  <small>{d.off ? 'إجازة' : hours > 0 ? formatHours(hours) : 'دوام مرن'}</small>
                </span>
                <label className="day-chip week-off">
                  <input
                    type="checkbox"
                    checked={d.off}
                    onChange={(e) => setDay(d.day, { off: e.target.checked })}
                    aria-label={`${name} يوم إجازة`}
                  />
                  <span>إجازة</span>
                </label>
                {d.off ? (
                  <span className="week-off-text">يوم إجازة أسبوعية</span>
                ) : (
                  <div className="week-periods">
                    {d.shifts.map((s, i) => (
                      <div key={i} className="week-period">
                        <input
                          id={id(`start-${d.day}-${i}`)}
                          type="time"
                          dir="ltr"
                          value={s.start}
                          onChange={(e) => setShift(d, i, { start: e.target.value })}
                          aria-label={`بداية الفترة ${i + 1} يوم ${name}`}
                          aria-invalid={!!error}
                        />
                        <input
                          id={id(`end-${d.day}-${i}`)}
                          type="time"
                          dir="ltr"
                          value={s.end}
                          onChange={(e) => setShift(d, i, { end: e.target.value })}
                          aria-label={`نهاية الفترة ${i + 1} يوم ${name}`}
                          aria-invalid={!!error}
                        />
                        {d.shifts.length > 1 ? (
                          <button
                            type="button"
                            className="period-remove"
                            onClick={() => setDay(d.day, { shifts: d.shifts.filter((_, j) => j !== i) })}
                            aria-label={`حذف الفترة ${i + 1} يوم ${name}`}
                            title="حذف الفترة"
                          >
                            ×
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                    {d.shifts.length < MAX_SHIFTS_PER_DAY && (
                      <button
                        type="button"
                        className="period-add"
                        onClick={() => setDay(d.day, { shifts: [...d.shifts, { start: '', end: '' }] })}
                      >
                        + فترة أخرى في {name}
                      </button>
                    )}
                  </div>
                )}
                {error && <p className="field-error week-error">{error}</p>}
              </div>
            );
          })}
        </div>
        {errors.offDays && <p className="field-error">{errors.offDays}</p>}
        <div className="week-footer">
          <span className="week-total">مجموع الساعات المحددة أسبوعياً: {formatHours(formWeeklyTotal(value))}</span>
          {template && (
            <button type="button" className="btn secondary btn-sm" onClick={copyTemplate}>
              نسخ دوام {DAY_NAMES[template.day]} ({shiftsText(template.shifts.filter((s) => s.start && s.end))}) إلى كل أيام
              العمل
            </button>
          )}
        </div>
        <p className="field-hint">
          لمن يعمل على فترتين (مثلاً 9 ص – 3 م ثم 5 م – 11 م) أضف «فترة أخرى»؛ يسجّل حضوره وانصرافه لكل فترة، ويُغلق دوامه
          تلقائياً بعد نهاية كل فترة بـ5 دقائق إن لم يسجّل انصرافه. يوم العمل بلا ساعات «دوام مرن»: لا يُحسب فيه تأخير، ويكتمل بعدد
          الساعات الافتراضي.
        </p>
      </fieldset>

      <label className="check-row" htmlFor={id('multiple')}>
        <input
          id={id('multiple')}
          type="checkbox"
          checked={value.allowMultiple}
          onChange={(e) => onChange({ ...value, allowMultiple: e.target.checked })}
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
