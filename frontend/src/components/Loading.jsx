export default function Loading({ label = 'جارٍ التحميل...' }) {
  return (
    <p className="loading-state" role="status">
      {label}
    </p>
  );
}
