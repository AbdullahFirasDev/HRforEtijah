import { formatHours } from '../utils/format';
import { DAY_NAMES, MAX_SESSIONS_PER_DAY, clockHours, formWeeklyTotal } from '../utils/workSchedule';

// Weekly schedule (each day: off, or working with its own from/to hours) and
// the multiple check-in exception, shared by the "add employee" and "manage
// account" windows. value: { days: [{ day, off, start, end }], allowMultiple }
export default function WorkScheduleFields({ idPrefix, value, errors, onChange }) {
  const id = (name) => `${idPrefix}-${name}`;
  const setDay = (day, patch) =>
    onChange({ ...value, days: value.days.map((d) => (d.day === day ? { ...d, ...patch } : d)) });
  // The first working day with hours can be copied to the others
  const template = value.days.find((d) => !d.off && d.start && d.end && d.end > d.start);
  const copyTemplate = () =>
    onChange({ ...value, days: value.days.map((d) => (d.off ? d : { ...d, start: template.start, end: template.end })) });
  const total = formWeeklyTotal(value);

  return (
    <>
      <fieldset className={['field', errors.offDays && 'field-invalid'].filter(Boolean).join(' ')}>
        <legend>ساعات الدوام لكل يوم</legend>
        <div className="week-grid">
          <div className="week-head" aria-hidden="true">
            <span>اليوم</span>
            <span />
            <span>من</span>
            <span>إلى</span>
          </div>
          {value.days.map((d) => {
            const name = DAY_NAMES[d.day];
            const error = errors[`day${d.day}`];
            const valid = !d.off && d.start && d.end && d.end > d.start;
            return (
              <div key={d.day} className={['week-row', d.off && 'is-off'].filter(Boolean).join(' ')}>
                <span className="week-day">
                  {name}
                  <small>{d.off ? 'إجازة' : valid ? formatHours(clockHours(d.start, d.end)) : 'دوام مرن'}</small>
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
                  <>
                    <input
                      id={id(`start-${d.day}`)}
                      className="week-start"
                      type="time"
                      dir="ltr"
                      value={d.start}
                      onChange={(e) => setDay(d.day, { start: e.target.value })}
                      aria-label={`بداية دوام ${name}`}
                      aria-invalid={!!error}
                    />
                    <input
                      id={id(`end-${d.day}`)}
                      className="week-end"
                      type="time"
                      dir="ltr"
                      value={d.end}
                      onChange={(e) => setDay(d.day, { end: e.target.value })}
                      aria-label={`نهاية دوام ${name}`}
                      aria-invalid={!!error}
                    />
                  </>
                )}
                {error && <p className="field-error week-error">{error}</p>}
              </div>
            );
          })}
        </div>
        {errors.offDays && <p className="field-error">{errors.offDays}</p>}
        <div className="week-footer">
          <span className="week-total">مجموع الساعات المحددة أسبوعياً: {formatHours(total)}</span>
          {template && (
            <button type="button" className="btn secondary btn-sm" onClick={copyTemplate}>
              نسخ ساعات {DAY_NAMES[template.day]} إلى كل أيام العمل
            </button>
          )}
        </div>
        <p className="field-hint">
          يُحسب التأخير والانصراف المبكر على ساعات كل يوم. يوم العمل بلا ساعات «دوام مرن»: لا يُحسب فيه تأخير، ويكتمل بعدد
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
