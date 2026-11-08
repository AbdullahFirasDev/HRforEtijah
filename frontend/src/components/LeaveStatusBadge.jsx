import { LEAVE_STATUS } from '../utils/leaves';

// قيد المراجعة / مقبول / مرفوض / ملغي
export default function LeaveStatusBadge({ status }) {
  const s = LEAVE_STATUS[status] || { label: status || '-', variant: 'info' };
  return <span className={`badge ${s.variant}`}>{s.label}</span>;
}
