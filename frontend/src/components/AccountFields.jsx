import Field from './Field';
import { ROLE_LABELS, roleLabel } from '../utils/labels';

// Name / email / password / role / manager inputs shared by the signup page
// and the admin "Add Employee" form, so both follow the same rules and look.
export default function AccountFields({ idPrefix, form, errors, onChange, managers, passwordLabel, passwordHint }) {
  const id = (name) => `${idPrefix}-${name}`;

  return (
    <>
      <Field id={id('name')} label="الاسم الكامل" required error={errors.name}>
        <input
          id={id('name')}
          name="name"
          value={form.name}
          onChange={onChange}
          autoComplete="name"
          aria-invalid={!!errors.name}
        />
      </Field>

      <Field id={id('email')} label="البريد الإلكتروني" required error={errors.email}>
        <input
          id={id('email')}
          type="email"
          name="email"
          dir="ltr"
          placeholder="name@company.com"
          value={form.email}
          onChange={onChange}
          autoComplete="email"
          aria-invalid={!!errors.email}
        />
      </Field>

      <Field id={id('password')} label={passwordLabel} required hint={passwordHint} error={errors.password}>
        <input
          id={id('password')}
          type="password"
          name="password"
          value={form.password}
          onChange={onChange}
          autoComplete="new-password"
          aria-invalid={!!errors.password}
        />
      </Field>

      <Field id={id('role')} label="الدور">
        <select id={id('role')} name="role" value={form.role} onChange={onChange}>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      {form.role === 'employee' && (
        <Field
          id={id('managerId')}
          label="المدير المسؤول"
          required
          hint="كل موظف يتبع مديراً أو مسؤول نظام"
          error={
            errors.managerId ||
            (managers && managers.length === 0
              ? 'لا يوجد مدراء بعد. أنشئ حساب مدير أو مسؤول نظام أولاً.'
              : undefined)
          }
        >
          <select
            id={id('managerId')}
            name="managerId"
            value={form.managerId}
            onChange={onChange}
            aria-invalid={!!errors.managerId}
          >
            <option value="" disabled>
              اختر المدير
            </option>
            {managers?.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} ({roleLabel(m.role)})
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}
