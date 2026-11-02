const VARIANT_MAP = {
  Completed: 'success',
  Incomplete: 'warning',
  Absent: 'danger',
  Valid: 'success',
  Invalid: 'danger',
  Pending: 'muted',
  Approved: 'success',
  Rejected: 'danger',
};

export default function StatusBadge({ status }) {
  const variant = VARIANT_MAP[status] || 'info';
  return <span className={`badge ${variant}`}>{status}</span>;
}
