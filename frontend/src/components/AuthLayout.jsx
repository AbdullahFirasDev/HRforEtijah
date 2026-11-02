import InstallBanner from './InstallBanner';

// Shared frame for the login and signup pages.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src="/logo.png" alt="الاتجاه للسفر والسياحة" width="102" height="127" />
        <h1>{title}</h1>
        <p className="sub">{subtitle}</p>
        {children}
        {footer}
        <InstallBanner />
      </div>
    </div>
  );
}
