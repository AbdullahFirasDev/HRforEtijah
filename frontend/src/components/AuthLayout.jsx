import { IconClock } from './icons';

// Shared frame for the login and signup pages.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-logo">
            <IconClock size={20} strokeWidth={2.2} />
          </span>
          <span className="auth-brand-name">الاتجاه</span>
        </div>
        <h1>{title}</h1>
        <p className="sub">{subtitle}</p>
        {children}
        {footer}
      </div>
    </div>
  );
}
