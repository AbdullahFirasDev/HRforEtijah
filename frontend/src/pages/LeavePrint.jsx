import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../features/auth/authSlice';
import { useGetLeaveQuery, useGetLeaveReportQuery, useGetLeaveStatementQuery } from '../features/api/leaveApi';
import { formatClockTime, formatDateLong, formatDayLong } from '../utils/format';
import { roleLabel } from '../utils/labels';
import { COUNT_MODES, HISTORY_ACTIONS, daysText, leaveStatusLabel } from '../utils/leaves';
import '../print.css';

const COMPANY = 'الاتجاه للسفر والسياحة';

// Page numbers and the document's name in the bottom margin of every page
const MARGIN_TEXT = "font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; font-size: 8pt; color: #6a5d4d; direction: rtl;";

// Text inside a CSS string (the page footer)
const cssString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

// Toolbar, A4 preview and print settings shared by the three documents.
// Printing waits for the font and the logo so nothing prints in a fallback.
function PrintShell({ docTitle, footer, loading, error, children }) {
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    if (!docTitle) return undefined;
    const before = document.title;
    document.title = docTitle; // the PDF's default file name
    return () => {
      document.title = before;
    };
  }, [docTitle]);

  useEffect(() => {
    if (loading || error) return undefined;
    let live = true;
    const logo = new Image();
    const logoReady = new Promise((resolve) => {
      logo.onload = resolve;
      logo.onerror = resolve;
      logo.src = '/logo.png';
    });
    Promise.all([document.fonts?.ready, logoReady]).then(() => live && setAssetsReady(true));
    return () => {
      live = false;
    };
  }, [loading, error]);

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(`/${user?.role || ''}/leaves`.replace('//', '/'));
  };

  return (
    <div className="print-page">
      <style>{`@page { size: A4 portrait; margin: 12mm 12mm 14mm; @bottom-left { content: "صفحة " counter(page) " من " counter(pages); ${MARGIN_TEXT} } @bottom-right { content: ${cssString(footer || COMPANY)}; ${MARGIN_TEXT} } }`}</style>
      <div className="print-toolbar no-print" role="toolbar" aria-label="أدوات الطباعة">
        <button type="button" className="btn secondary" onClick={back}>
          رجوع
        </button>
        <button type="button" className="btn" onClick={() => window.print()} disabled={loading || !!error || !assetsReady}>
          {assetsReady || error ? 'طباعة / حفظ PDF' : 'جارٍ التحضير...'}
        </button>
        <p>
          معاينة بمقاس A4 عمودي. لحفظ ملف PDF اختر «حفظ بتنسيق PDF» في نافذة الطباعة، ولنتيجة أنظف ألغِ خيار «الرؤوس والتذييلات».
        </p>
      </div>
      {loading ? (
        <p className="loading-state no-print">جارٍ تحميل المستند...</p>
      ) : error ? (
        <div className="print-error no-print" role="alert">
          {error}
        </div>
      ) : (
        <article className="print-sheet" dir="rtl" lang="ar">
          {children}
        </article>
      )}
    </div>
  );
}

function DocHead({ title, meta, stamp }) {
  return (
    <header className="doc-head">
      <div className="doc-brand">
        <img src="/logo.png" alt={COMPANY} />
        <div>
          <strong>{COMPANY}</strong>
          <span>إدارة الموارد البشرية</span>
        </div>
      </div>
      {stamp}
      <div className="doc-title">
        <h1>{title}</h1>
        <dl>
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

// Label/value boxes. The last box of an incomplete row stretches to the end
// of the row, so no empty cell is left.
function InfoGrid({ items, cols = 2 }) {
  const list = items.filter(Boolean);
  const spans = list.map(() => 1);
  let run = [];
  const close = () => {
    const rest = run.length % cols;
    if (rest) spans[run[run.length - 1]] = cols - rest + 1;
    run = [];
  };
  list.forEach(([, , wide], i) => (wide ? close() : run.push(i)));
  close();
  return (
    <dl className={`doc-info cols-${cols}`}>
      {list.map(([k, v, wide], i) => (
        <div key={k} className={wide ? 'is-wide' : undefined} style={!wide && spans[i] > 1 ? { gridColumn: `span ${spans[i]}` } : undefined}>
          <dt>{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// e.g. "8 نوفمبر 2026، 04:10 م"
const whenText = (value) => (value ? `${formatDateLong(value)}، ${formatClockTime(value)}` : '—');
// Keeps "2026-0007" in order inside Arabic text
const ltr = (s) => `\u2066${s}\u2069`;

function Signatures({ boxes }) {
  return (
    <section className="doc-section doc-signatures">
      <h2>التواقيع</h2>
      <div className={`sign-grid cols-${boxes.length}`}>
        {boxes.map((b) => (
          <div key={b} className="sign-box">
            <strong>{b}</strong>
            <span className="sign-line">الاسم:</span>
            <span className="sign-line">التوقيع:</span>
            <span className="sign-line">التاريخ:</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const DocFoot = ({ by }) => (
  <footer className="doc-foot">
    طُبع في {whenText(new Date())}
    {by ? ` بواسطة ${by}` : ''} · مستند صادر من نظام الموارد البشرية لشركة {COMPANY}
  </footer>
);

const employeeItems = (u) => [
  ['اسم الموظف', u?.name],
  ['الرقم الوظيفي', u?.employeeNumber],
  ['القسم', u?.department],
  ['المسمى الوظيفي', u?.jobTitle],
];

// ---------- One request (طلب إجازة) ----------
export function LeaveRequestPrint() {
  const { id } = useParams();
  const me = useSelector(selectCurrentUser);
  const { data, isLoading, error } = useGetLeaveQuery(id);
  const r = data?.request;
  const balance = data?.balance;

  return (
    <PrintShell
      docTitle={r ? `طلب إجازة ${r.number} - ${r.user?.name || ''}` : 'طلب إجازة'}
      footer={r ? `طلب إجازة رقم ${ltr(r.number)}` : ''}
      loading={isLoading}
      error={error ? error.data?.message || 'تعذر تحميل الطلب' : null}
    >
      {r && (
        <>
          <DocHead
            title="طلب إجازة"
            meta={[
              ['رقم الطلب', <span dir="ltr">{r.number}</span>],
              ['تاريخ التقديم', formatDateLong(r.createdAt)],
            ]}
            stamp={
              <div className={`doc-stamp is-${r.status.toLowerCase()}`} aria-label={`حالة الطلب: ${leaveStatusLabel(r.status)}`}>
                {leaveStatusLabel(r.status)}
              </div>
            }
          />

          <section className="doc-section">
            <h2>بيانات الموظف</h2>
            <InfoGrid items={employeeItems(r.user)} />
          </section>

          <section className="doc-section">
            <h2>تفاصيل الإجازة</h2>
            <InfoGrid
              cols={3}
              items={[
                ['نوع الإجازة', r.typeName],
                ['الأجر', r.policy?.paid === false ? 'غير مدفوعة' : 'مدفوعة'],
                ['طريقة الاحتساب', COUNT_MODES[r.policy?.countMode]?.label],
                ['تاريخ البداية', formatDayLong(r.startDate)],
                ['تاريخ النهاية', formatDayLong(r.endDate)],
                [
                  'عدد الأيام',
                  <span className="doc-days">
                    {daysText(r.days)}
                    {r.calendarDays !== r.days && <small> (من {daysText(r.calendarDays)} في الفترة)</small>}
                  </span>,
                ],
                ['سبب الإجازة', <span className="pre-line">{r.reason}</span>, true],
                r.notes && ['ملاحظات الموظف', <span className="pre-line">{r.notes}</span>, true],
                r.attachments?.length > 0 && ['المرفقات', r.attachments.map((a) => a.name).join('، '), true],
                balance && [
                  `رصيد سنة ${balance.year}`,
                  `الإجمالي ${daysText(balance.total)} · المستخدم ${daysText(balance.used)} · المتبقي ${daysText(balance.remaining)}`,
                  true,
                ],
              ]}
            />
          </section>

          <section className="doc-section">
            <h2>قرار المسؤول</h2>
            <InfoGrid
              cols={3}
              items={[
                ['حالة الطلب', leaveStatusLabel(r.status)],
                ['المسؤول', r.reviewedAt ? r.reviewedByName : 'لم يُتخذ قرار بعد'],
                ['تاريخ القرار', r.reviewedAt ? whenText(r.reviewedAt) : '—'],
                [r.status === 'Rejected' ? 'سبب الرفض' : 'ملاحظات المسؤول', r.reviewRemarks || '—', true],
                r.status === 'Cancelled' && ['الإلغاء', `ألغاه ${r.cancelledByName || '—'} في ${whenText(r.cancelledAt)}${r.cancelReason ? ` — السبب: ${r.cancelReason}` : ''}`, true],
              ]}
            />
          </section>

          <section className="doc-section doc-keep">
            <h2>سجل الطلب</h2>
            <table className="doc-table compact">
              <thead>
                <tr>
                  <th>الإجراء</th>
                  <th>بواسطة</th>
                  <th>التاريخ والوقت</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {r.history.map((h, i) => (
                  <tr key={i}>
                    <td>{HISTORY_ACTIONS[h.action] || h.action}</td>
                    <td>
                      {h.byName || '—'}
                      {h.byRole && <small> ({roleLabel(h.byRole)})</small>}
                    </td>
                    <td className="nowrap">{whenText(h.at)}</td>
                    <td>{h.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="doc-end">
            <Signatures boxes={['الموظف', 'المدير المباشر', 'الموارد البشرية / الإدارة']} />
            <DocFoot by={me?.name} />
          </div>
        </>
      )}
    </PrintShell>
  );
}

// ---------- An employee's year (كشف إجازات الموظف) ----------
export function LeaveStatementPrint() {
  const [params] = useSearchParams();
  const year = params.get('year') || String(new Date().getFullYear());
  const user = params.get('user') || undefined;
  const { data, isLoading, error } = useGetLeaveStatementQuery({ year, ...(user && { user }) });
  const e = data?.employee;
  const rows = data?.requests || [];
  const approvedDays = rows.filter((r) => r.status === 'Approved').reduce((s, r) => s + r.daysInPeriod, 0);

  return (
    <PrintShell
      docTitle={e ? `كشف إجازات ${e.name} ${year}` : 'كشف إجازات'}
      footer={e ? `كشف إجازات ${e.name} لسنة ${ltr(year)}` : ''}
      loading={isLoading}
      error={error ? error.data?.message || 'تعذر تحميل الكشف' : null}
    >
      {data && (
        <>
          <DocHead
            title="كشف إجازات الموظف"
            meta={[
              ['السنة', year],
              ['تاريخ الإصدار', formatDateLong(new Date())],
            ]}
          />
          <section className="doc-section">
            <h2>بيانات الموظف</h2>
            <InfoGrid items={employeeItems(e)} />
          </section>

          <section className="doc-section">
            <h2>ملخص الأرصدة والإجازات لسنة {year}</h2>
            {data.summary.length ? (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>نوع الإجازة</th>
                    <th>الأجر</th>
                    <th>الرصيد</th>
                    <th>المستخدم</th>
                    <th>المتبقي</th>
                    <th>معتمدة في السنة</th>
                    <th>قيد المراجعة</th>
                    <th>الطلبات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((s) => (
                    <tr key={s.type.id}>
                      <td>{s.type.name}</td>
                      <td>{s.type.paid === false ? 'غير مدفوعة' : 'مدفوعة'}</td>
                      <td>{s.balance ? s.balance.total : '—'}</td>
                      <td>{s.balance ? s.balance.used : '—'}</td>
                      <td>{s.balance ? <strong>{s.balance.remaining}</strong> : '—'}</td>
                      <td>{s.approvedDays}</td>
                      <td>{s.pendingDays}</td>
                      <td>{s.requests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="doc-empty">لا توجد أنواع إجازات أو طلبات لهذه السنة.</p>
            )}
            <p className="doc-note">«—» تعني أن النوع لا يُخصم من رصيد. الأيام محسوبة داخل السنة فقط.</p>
          </section>

          <section className="doc-section">
            <h2>طلبات الإجازة ({rows.length})</h2>
            {rows.length ? (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>رقم الطلب</th>
                    <th>النوع</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>الأيام</th>
                    <th>الحالة</th>
                    <th>القرار</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td>{i + 1}</td>
                      <td dir="ltr" className="nowrap">
                        {r.number}
                      </td>
                      <td>{r.typeName}</td>
                      <td className="nowrap">{r.startDate}</td>
                      <td className="nowrap">{r.endDate}</td>
                      <td>{r.daysInPeriod !== r.days ? `${r.daysInPeriod} من ${r.days}` : r.days}</td>
                      <td>
                        <span className={`doc-status is-${r.status.toLowerCase()}`}>{leaveStatusLabel(r.status)}</span>
                      </td>
                      <td>
                        {r.reviewedByName ? (
                          <>
                            {r.reviewedByName}
                            <small className="block">{formatDateLong(r.reviewedAt)}</small>
                          </>
                        ) : r.status === 'Cancelled' ? (
                          r.cancelledByName || '—'
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>مجموع أيام الإجازات المعتمدة في السنة</td>
                    <td colSpan={3}>
                      <strong>{daysText(approvedDays)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="doc-empty">لا توجد طلبات إجازة في هذه السنة.</p>
            )}
          </section>

          <div className="doc-end">
            <Signatures boxes={['الموظف', 'الموارد البشرية / الإدارة']} />
            <DocFoot by={data.printedBy} />
          </div>
        </>
      )}
    </PrintShell>
  );
}

// ---------- Everyone's leaves in a period (تقرير الإجازات) ----------
export function LeaveReportPrint() {
  const [params] = useSearchParams();
  const query = Object.fromEntries([...params.entries()].filter(([, v]) => v));
  const { data, isLoading, error } = useGetLeaveReportQuery(query);
  const rows = data?.rows || [];
  const filtersText = [
    query.status && `الحالة: ${leaveStatusLabel(query.status)}`,
    query.type && rows[0] && `النوع: ${rows[0].typeName}`,
    query.department && `القسم: ${query.department}`,
  ].filter(Boolean);

  return (
    <PrintShell
      docTitle={`تقرير الإجازات ${query.from || ''} - ${query.to || ''}`}
      footer={`تقرير الإجازات من ${ltr(query.from || '')} إلى ${ltr(query.to || '')}`}
      loading={isLoading}
      error={error ? error.data?.message || 'تعذر تحميل التقرير' : null}
    >
      {data && (
        <>
          <DocHead
            title="تقرير الإجازات"
            meta={[
              ['الفترة', `${formatDateLong(data.from)} — ${formatDateLong(data.to)}`],
              ['تاريخ الإصدار', formatDateLong(new Date())],
            ]}
          />
          {filtersText.length > 0 && <p className="doc-filters">التصفية: {filtersText.join(' · ')}</p>}

          <div className="doc-kpis">
            <div>
              <strong>{data.totals.requests}</strong>
              <span>طلب</span>
            </div>
            <div>
              <strong>{data.totals.approvedDays}</strong>
              <span>يوم إجازة معتمد في الفترة</span>
            </div>
            <div>
              <strong>{data.totals.pendingDays}</strong>
              <span>يوم قيد المراجعة</span>
            </div>
            <div>
              <strong>{data.byEmployee.length}</strong>
              <span>موظف</span>
            </div>
          </div>

          <div className="doc-two">
            <section className="doc-section doc-keep">
              <h2>حسب نوع الإجازة</h2>
              <table className="doc-table compact">
                <thead>
                  <tr>
                    <th>النوع</th>
                    <th>الطلبات</th>
                    <th>معتمدة</th>
                    <th>معلقة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map((t) => (
                    <tr key={t.name}>
                      <td>
                        {t.name}
                        {t.paid === false && <small> (غير مدفوعة)</small>}
                      </td>
                      <td>{t.requests}</td>
                      <td>{t.approvedDays}</td>
                      <td>{t.pendingDays}</td>
                    </tr>
                  ))}
                  {!data.byType.length && (
                    <tr>
                      <td colSpan={4}>لا توجد بيانات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="doc-section doc-keep">
              <h2>حسب الموظف</h2>
              <table className="doc-table compact">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>القسم</th>
                    <th>الطلبات</th>
                    <th>معتمدة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byEmployee.map((u) => (
                    <tr key={`${u.name}-${u.employeeNumber}`}>
                      <td>{u.name}</td>
                      <td>{u.department || '—'}</td>
                      <td>{u.requests}</td>
                      <td>{u.approvedDays}</td>
                    </tr>
                  ))}
                  {!data.byEmployee.length && (
                    <tr>
                      <td colSpan={4}>لا توجد بيانات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <section className="doc-section">
            <h2>تفاصيل الطلبات ({rows.length})</h2>
            {rows.length ? (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>رقم الطلب</th>
                    <th>الموظف</th>
                    <th>القسم</th>
                    <th>النوع</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>أيام الطلب</th>
                    <th>في الفترة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td>{i + 1}</td>
                      <td dir="ltr" className="nowrap">
                        {r.number}
                      </td>
                      <td>{r.user?.name || '—'}</td>
                      <td>{r.user?.department || '—'}</td>
                      <td>{r.typeName}</td>
                      <td className="nowrap">{r.startDate}</td>
                      <td className="nowrap">{r.endDate}</td>
                      <td>{r.days}</td>
                      <td>
                        <strong>{r.daysInPeriod}</strong>
                      </td>
                      <td>
                        <span className={`doc-status is-${r.status.toLowerCase()}`}>{leaveStatusLabel(r.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="doc-empty">لا توجد طلبات مطابقة في هذه الفترة.</p>
            )}
            {data.truncated && <p className="doc-note">عُرض أول 3000 طلب فقط؛ ضيّق الفترة أو التصفية.</p>}
          </section>

          <div className="doc-end">
            <Signatures boxes={['أعدّه', 'اعتمده']} />
            <DocFoot by={data.printedBy} />
          </div>
        </>
      )}
    </PrintShell>
  );
}
