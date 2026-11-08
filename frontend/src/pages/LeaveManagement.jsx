import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetLeaveFiltersQuery, useGetLeaveMetaQuery, useGetLeavesForReviewQuery } from '../features/api/leaveApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Field from '../components/Field';
import Alert from '../components/Alert';
import Loading from '../components/Loading';
import LeaveStatusBadge from '../components/LeaveStatusBadge';
import LeaveDetailsModal from '../components/LeaveDetailsModal';
import LeaveTypesPanel from '../components/LeaveTypesPanel';
import LeaveBalancesPanel from '../components/LeaveBalancesPanel';
import { formatDate, todayStr } from '../utils/format';
import { LEAVE_STATUS, currentYear, daysText, leaveStatusLabel, periodShort } from '../utils/leaves';

const monthBounds = () => {
  const t = todayStr();
  const [y, m] = t.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${t.slice(0, 7)}-01`, to: `${t.slice(0, 7)}-${String(last).padStart(2, '0')}` };
};

function DateField({ id, label, value, onChange, min, max }) {
  return (
    <Field id={id} label={label}>
      <div className="date-input" data-empty={!value} data-placeholder="اختر التاريخ">
        <input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

// Search box + department / type / status / period
function Filters({ value, onChange, options, showStatus }) {
  const [text, setText] = useState(value.q);
  useEffect(() => {
    const t = setTimeout(() => text !== value.q && onChange({ ...value, q: text }), 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch) => onChange({ ...value, ...patch });
  const any = value.q || value.department || value.type || value.status || value.from || value.to;
  return (
    <div className="toolbar leave-filters">
      <Field id="f-q" label="بحث">
        <input id="f-q" type="search" value={text} placeholder="اسم الموظف أو رقمه الوظيفي" onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field id="f-dept" label="القسم">
        <select id="f-dept" value={value.department} onChange={(e) => set({ department: e.target.value })}>
          <option value="">كل الأقسام</option>
          {options.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Field id="f-type" label="النوع">
        <select id="f-type" value={value.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">كل الأنواع</option>
          {options.types.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
              {!t.isActive ? ' (موقوف)' : ''}
            </option>
          ))}
        </select>
      </Field>
      {showStatus && (
        <Field id="f-status" label="الحالة">
          <select id="f-status" value={value.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">كل الحالات</option>
            {Object.entries(LEAVE_STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <DateField id="f-from" label="من تاريخ" value={value.from} max={value.to || undefined} onChange={(from) => set({ from })} />
      <DateField id="f-to" label="إلى تاريخ" value={value.to} min={value.from || undefined} onChange={(to) => set({ to })} />
      {any && (
        <div className="toolbar-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setText('');
              onChange({ q: '', department: '', type: '', status: '', from: '', to: '' });
            }}
          >
            مسح التصفية
          </button>
        </div>
      )}
    </div>
  );
}

function RequestsTab({ status, filters, setFilters, options, onOpen }) {
  const params = useMemo(() => {
    const p = { ...filters, ...(status && { status }) };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
  }, [filters, status]);
  const { data, isLoading, isFetching } = useGetLeavesForReviewQuery(params);
  const rows = data?.requests || [];

  const columns = [
    { key: 'number', label: 'رقم الطلب', value: (r) => r.number, render: (r) => <span dir="ltr">{r.number}</span> },
    {
      key: 'employee',
      label: 'الموظف',
      value: (r) => [r.user?.name, r.user?.department, r.user?.employeeNumber].filter(Boolean).join(' '),
      render: (r) => (
        <span className="cell-stack">
          <strong>{r.user?.name || '-'}</strong>
          {(r.user?.department || r.user?.employeeNumber) && <small>{[r.user.employeeNumber, r.user.department].filter(Boolean).join(' · ')}</small>}
        </span>
      ),
    },
    { key: 'type', label: 'النوع', value: (r) => r.typeName },
    { key: 'period', label: 'الفترة', value: periodShort },
    { key: 'days', label: 'الأيام', value: (r) => daysText(r.days) },
    { key: 'status', label: 'الحالة', value: (r) => leaveStatusLabel(r.status), render: (r) => <LeaveStatusBadge status={r.status} /> },
    { key: 'created', label: 'قُدّم في', value: (r) => formatDate(r.createdAt) },
    {
      key: 'open',
      label: 'الإجراء',
      value: () => '',
      render: (r) => (
        <button type="button" className={`btn btn-sm ${r.status === 'Pending' ? '' : 'secondary'}`} onClick={() => onOpen(r._id)}>
          {r.status === 'Pending' ? 'مراجعة' : 'عرض'}
        </button>
      ),
    },
  ];

  return (
    <>
      <Filters value={filters} onChange={setFilters} options={options} showStatus={!status} />
      {isLoading ? (
        <Loading />
      ) : (
        <div className={isFetching ? 'is-refreshing' : undefined}>
          <DataTable
            title={status === 'Pending' ? 'طلبات بانتظار قرارك' : 'كل الطلبات'}
            exportTitle={status === 'Pending' ? 'طلبات الإجازة المعلقة' : 'طلبات الإجازات'}
            columns={columns}
            rows={rows}
            rowKey={(r) => r._id}
            emptyLabel={status === 'Pending' ? 'لا توجد طلبات بانتظار المراجعة.' : 'لا توجد طلبات مطابقة.'}
            searchPlaceholder="ابحث في النتائج..."
            fileName="leave-requests"
          />
          {data?.requests?.length >= data?.limit && <p className="form-note">تظهر أحدث {data.limit} طلب؛ ضيّق التصفية لرؤية الأقدم.</p>}
        </div>
      )}
    </>
  );
}

function ReportsTab({ options }) {
  const navigate = useNavigate();
  const [report, setReport] = useState(() => ({ ...monthBounds(), type: '', status: 'Approved', department: '' }));
  const [reportError, setReportError] = useState('');
  const [statement, setStatement] = useState({ user: '', year: String(currentYear()) });
  const [statementError, setStatementError] = useState('');

  const openReport = (e) => {
    e.preventDefault();
    if (!report.from || !report.to) return setReportError('حدّد بداية الفترة ونهايتها');
    if (report.to < report.from) return setReportError('نهاية الفترة يجب أن تكون بعد بدايتها');
    const qs = new URLSearchParams(Object.entries(report).filter(([, v]) => v));
    navigate(`/print/leave-report?${qs}`);
    return undefined;
  };
  const openStatement = (e) => {
    e.preventDefault();
    if (!statement.user) return setStatementError('اختر الموظف');
    navigate(`/print/leave-statement?user=${statement.user}&year=${statement.year}`);
    return undefined;
  };

  return (
    <div className="grid grid-2 leave-report-grid">
      <form className="card" onSubmit={openReport} noValidate>
        <h3 className="card-title">تقرير الإجازات لفترة</h3>
        <div className="form-row">
          <DateField id="r-from" label="من تاريخ" value={report.from} max={report.to || undefined} onChange={(from) => setReport({ ...report, from })} />
          <DateField id="r-to" label="إلى تاريخ" value={report.to} min={report.from || undefined} onChange={(to) => setReport({ ...report, to })} />
        </div>
        <div className="form-row">
          <Field id="r-status" label="الحالة">
            <select id="r-status" value={report.status} onChange={(e) => setReport({ ...report, status: e.target.value })}>
              <option value="">كل الحالات</option>
              {Object.entries(LEAVE_STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="r-type" label="النوع">
            <select id="r-type" value={report.type} onChange={(e) => setReport({ ...report, type: e.target.value })}>
              <option value="">كل الأنواع</option>
              {options.types.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="r-dept" label="القسم">
          <select id="r-dept" value={report.department} onChange={(e) => setReport({ ...report, department: e.target.value })}>
            <option value="">كل الأقسام</option>
            {options.departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Alert type="error">{reportError}</Alert>
        <button type="submit" className="btn">
          معاينة التقرير وطباعته
        </button>
        <p className="form-note">يحسب أيام كل إجازة الواقعة داخل الفترة فقط، مع ملخص حسب النوع والموظف.</p>
      </form>

      <form className="card" onSubmit={openStatement} noValidate>
        <h3 className="card-title">كشف إجازات موظف</h3>
        <Field id="s-user" label="الموظف" required error={statementError}>
          <select
            id="s-user"
            value={statement.user}
            onChange={(e) => {
              setStatement({ ...statement, user: e.target.value });
              setStatementError('');
            }}
          >
            <option value="">اختر الموظف</option>
            {options.employees.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
                {u.department ? ` — ${u.department}` : ''}
                {!u.isActive ? ' (معطّل)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field id="s-year" label="السنة">
          <select id="s-year" value={statement.year} onChange={(e) => setStatement({ ...statement, year: e.target.value })}>
            {[currentYear() - 2, currentYear() - 1, currentYear(), currentYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn">
          معاينة الكشف وطباعته
        </button>
        <p className="form-note">كل طلبات الموظف في السنة مع أرصدته، ومكان لتوقيعه وتوقيع الإدارة.</p>
      </form>
    </div>
  );
}

const EMPTY_FILTERS = { q: '', department: '', type: '', status: '', from: '', to: '' };

// Managers decide on their team's leave requests; admins on everyone's, and
// also manage the kinds of leave and the balances
export default function LeaveManagement() {
  const user = useSelector(selectCurrentUser);
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const openId = params.get('request');
  const tab = params.get('tab') || 'pending';
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const { data: meta, isLoading: metaLoading } = useGetLeaveMetaQuery();
  const ready = meta?.ready;
  const { data: options } = useGetLeaveFiltersQuery(undefined, { skip: !ready });
  const { data: pendingData } = useGetLeavesForReviewQuery({ status: 'Pending' }, { skip: !ready });
  const pending = pendingData?.pending ?? 0;
  const opts = { types: options?.types || [], departments: options?.departments || [], employees: options?.employees || [] };

  const TABS = [
    { id: 'pending', label: `بانتظار المراجعة${pending ? ` (${pending})` : ''}` },
    { id: 'all', label: 'كل الطلبات' },
    { id: 'reports', label: 'التقارير والطباعة' },
    ...(isAdmin
      ? [
          { id: 'balances', label: 'الأرصدة' },
          { id: 'types', label: 'أنواع الإجازات' },
        ]
      : []),
  ];

  const setTab = (id) => setParams(id === 'pending' ? {} : { tab: id });
  const open = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('request', id);
    else next.delete('request');
    setParams(next, { replace: !id });
  };

  if (metaLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="إدارة الإجازات"
        subtitle={
          isAdmin
            ? 'راجع طلبات الإجازات، وتابع سجلها، واطبع الطلبات والتقارير. حدّد أنواع الإجازات وأرصدتها من التبويبين الأخيرين.'
            : 'راجع طلبات إجازات فريقك، وتابع سجلها، واطبع الطلبات والتقارير.'
        }
      />
      {!ready ? (
        <Alert type="info" title="قسم الإجازات غير مفعّل بعد">
          {isAdmin
            ? 'يحتاج القسم إلى إنشاء جداوله في قاعدة البيانات مرة واحدة: شغّل الأمر npm run leaves:migrate في مجلد backend (تجربة)، ثم npm run leaves:migrate -- --apply. لا يغيّر الأمر أي بيانات موجودة، ويُفعَّل القسم خلال دقيقة.'
            : 'سيُتاح بعد أن يكمل مسؤول النظام إعداد القسم.'}
        </Alert>
      ) : (
        <>
          {isAdmin && !opts.types.length && options && (
            <Alert type="warning" title="لا توجد أنواع إجازات بعد">
              لن يتمكن الموظفون من طلب إجازة حتى تضيف الأنواع التي تعتمدها الشركة من تبويب «أنواع الإجازات».
            </Alert>
          )}
          <div className="tabs" role="tablist" aria-label="أقسام إدارة الإجازات">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className={`tab${tab === t.id ? ' is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'pending' && <RequestsTab status="Pending" filters={filters} setFilters={setFilters} options={opts} onOpen={open} />}
            {tab === 'all' && <RequestsTab status="" filters={filters} setFilters={setFilters} options={opts} onOpen={open} />}
            {tab === 'reports' && <ReportsTab options={opts} />}
            {tab === 'balances' && isAdmin && <LeaveBalancesPanel />}
            {tab === 'types' && isAdmin && <LeaveTypesPanel />}
          </div>
        </>
      )}
      {openId && <LeaveDetailsModal id={openId} onClose={() => open(null)} />}
    </div>
  );
}
