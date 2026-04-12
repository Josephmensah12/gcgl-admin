import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';

/* ─────────────────────────────────────────────────────────── */
/*  Helpers                                                    */
/* ─────────────────────────────────────────────────────────── */

const fmt = (n) => {
  const num = Number(n) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtK = (n) => {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1000) return `$${(num / 1000).toFixed(1)}k`;
  return `$${Math.round(num)}`;
};
const pctArrow = (pct) => (pct > 0 ? '↑' : pct < 0 ? '↓' : '→');

function computePresetRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const toISO = (d) => d.toISOString().split('T')[0];
  switch (preset) {
    case 'month':
      return { dateFrom: toISO(new Date(y, m, 1)), dateTo: toISO(new Date(y, m + 1, 0)) };
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return { dateFrom: toISO(new Date(y, q, 1)), dateTo: toISO(new Date(y, q + 3, 0)) };
    }
    case 'year':
      return { dateFrom: toISO(new Date(y, 0, 1)), dateTo: toISO(new Date(y, 11, 31)) };
    case 'ytd':
      return { dateFrom: toISO(new Date(y, 0, 1)), dateTo: toISO(now) };
    default:
      return { dateFrom: '', dateTo: '' };
  }
}

/* ─────────────────────────────────────────────────────────── */
/*  KPI card                                                    */
/* ─────────────────────────────────────────────────────────── */

function KpiCard({ label, value, change, subtext, accent = 'blue' }) {
  const accents = {
    green: { bar: 'linear-gradient(135deg,#10B981,#059669)', fg: '#10B981' },
    blue:  { bar: 'linear-gradient(135deg,#6366F1,#3B82F6)', fg: '#1A1D2B' },
    red:   { bar: 'linear-gradient(135deg,#EF4444,#DC2626)', fg: '#EF4444' },
    gold:  { bar: 'linear-gradient(135deg,#F59E0B,#D97706)', fg: '#F59E0B' },
  };
  const a = accents[accent] || accents.blue;
  const changeTint = change == null ? null : change >= 0
    ? { bg: 'rgba(16,185,129,0.08)', color: '#10B981' }
    : { bg: 'rgba(239,68,68,0.07)', color: '#EF4444' };
  return (
    <div className="relative overflow-hidden bg-white rounded-[16px] p-5 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[16px]" style={{ background: a.bar }} />
      <p className="text-[11.5px] font-medium text-[#6B7194] uppercase tracking-wide">{label}</p>
      <p className="text-[24px] font-extrabold mt-1 tracking-[-0.6px] tabular-nums" style={{ color: a.fg }}>
        {typeof value === 'string' ? value : fmt(value)}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1">
        {subtext && <p className="text-[11px] text-[#9CA3C0] truncate">{subtext}</p>}
        {changeTint && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-bold"
            style={{ background: changeTint.bg, color: changeTint.color }}
          >
            {pctArrow(change)} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Page                                                       */
/* ─────────────────────────────────────────────────────────── */

export default function FinancialReports() {
  const { onMenuClick } = useLayout();
  const [tab, setTab] = useState('summary'); // summary | pnl | cashflow | customers
  const [preset, setPreset] = useState('month');
  const [customRange, setCustomRange] = useState({ dateFrom: '', dateTo: '' });
  const [summary, setSummary] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [cashflow, setCashflow] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [customerSort, setCustomerSort] = useState('total_spent');
  const [loading, setLoading] = useState(true);

  const activeRange = preset === 'custom' ? customRange : computePresetRange(preset);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = preset === 'custom'
        ? { dateFrom: customRange.dateFrom, dateTo: customRange.dateTo }
        : { period: preset };

      const [sumRes, pnlRes, cfRes, custRes] = await Promise.all([
        axios.get('/api/v1/financial-reports/summary', { params }),
        axios.get('/api/v1/financial-reports/pnl', { params }),
        axios.get('/api/v1/financial-reports/cash-flow', { params }),
        axios.get('/api/v1/financial-reports/customers', { params: { ...params, sortBy: customerSort, limit: 50 } }),
      ]);
      setSummary(sumRes.data.data);
      setPnl(pnlRes.data.data);
      setCashflow(cfRes.data.data);
      setCustomers(custRes.data.data);
    } catch (err) {
      console.error('Financial reports load error:', err);
    } finally {
      setLoading(false);
    }
  }, [preset, customRange.dateFrom, customRange.dateTo, customerSort]);

  useEffect(() => { load(); }, [load]);

  const PresetButton = ({ k, label }) => (
    <button
      type="button"
      onClick={() => setPreset(k)}
      className={`h-9 px-3 rounded-[8px] text-[12.5px] font-semibold transition-all ${
        preset === k
          ? 'bg-[#6366F1] text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)]'
          : 'bg-[#F4F6FA] text-[#6B7194] hover:bg-[#E9EBF2]'
      }`}
    >
      {label}
    </button>
  );

  const TabButton = ({ k, label, icon }) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`flex items-center gap-2 h-10 px-4 rounded-[10px] text-[13px] font-semibold transition-all ${
        tab === k
          ? 'bg-white text-[#1A1D2B] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
          : 'text-[#6B7194] hover:text-[#1A1D2B]'
      }`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Financial Reports"
        subtitle="Revenue, expenses, cash flow, and profit across any period"
        onMenuClick={onMenuClick}
        hideSearch
      />

      {/* Period picker */}
      <div className="gc-card p-4 mb-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px] mr-1">Period</span>
          <PresetButton k="month"   label="This Month" />
          <PresetButton k="quarter" label="This Quarter" />
          <PresetButton k="ytd"     label="YTD" />
          <PresetButton k="year"    label="This Year" />
          <PresetButton k="custom"  label="Custom" />
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customRange.dateFrom}
                onChange={(e) => setCustomRange((r) => ({ ...r, dateFrom: e.target.value }))}
                className="h-9 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12.5px] text-[#1A1D2B] focus:border-[#6366F1] outline-none"
              />
              <span className="text-[#9CA3C0]">→</span>
              <input
                type="date"
                value={customRange.dateTo}
                onChange={(e) => setCustomRange((r) => ({ ...r, dateTo: e.target.value }))}
                className="h-9 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12.5px] text-[#1A1D2B] focus:border-[#6366F1] outline-none"
              />
            </div>
          )}
          <div className="ml-auto text-[11.5px] text-[#9CA3C0]">
            {summary?.period && `${summary.period.from} → ${summary.period.to}`}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex p-1 bg-[#F4F6FA] rounded-[12px] mb-[18px] gap-1 flex-wrap">
        <TabButton k="summary"   label="Summary"       icon="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <TabButton k="pnl"       label="Profit & Loss" icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        <TabButton k="cashflow"  label="Cash Flow"     icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <TabButton k="customers" label="Customers"     icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </div>

      {loading ? (
        <LoadingSpinner text="Loading reports..." />
      ) : (
        <>
          {tab === 'summary' && summary && <SummaryTab data={summary} />}
          {tab === 'pnl' && pnl && <PnlTab data={pnl} />}
          {tab === 'cashflow' && cashflow && <CashFlowTab data={cashflow} />}
          {tab === 'customers' && customers && (
            <CustomersTab data={customers} sort={customerSort} onSortChange={setCustomerSort} />
          )}
        </>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Summary Tab                                                */
/* ─────────────────────────────────────────────────────────── */

function SummaryTab({ data }) {
  const c = data.current;
  const chg = data.change;
  return (
    <div className="space-y-[18px]">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
        <KpiCard label="Revenue"    value={c.revenue}    change={chg.revenue}    subtext={`${c.invoiceCount} invoices`}    accent="gold" />
        <KpiCard label="Collected"  value={c.collected}  change={chg.collected}  subtext={`${c.paymentCount} transactions`} accent="green" />
        <KpiCard label="Expenses"   value={c.expenses}   change={chg.expenses}   subtext={`${c.expenseCount} entries`}      accent="red" />
        <KpiCard label="Net Profit" value={c.netProfit}  change={chg.netProfit}  subtext={`${c.netMargin.toFixed(1)}% margin`} accent="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <div className="gc-card p-6">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] mb-4">Receivables snapshot</h3>
          <Row label="Invoiced (accrual)" value={fmt(c.revenue)} />
          <Row label="Collected (cash)"   value={fmt(c.collected)} valueColor="#10B981" />
          <Row label="Outstanding"        value={fmt(c.outstanding)} valueColor={c.outstanding > 0 ? '#EF4444' : '#10B981'} bold />
        </div>
        <div className="gc-card p-6">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] mb-4">Profitability</h3>
          <Row label="Revenue"    value={fmt(c.revenue)} />
          <Row label="Expenses"   value={`− ${fmt(c.expenses)}`} valueColor="#EF4444" />
          <Row label="Net profit" value={fmt(c.netProfit)} valueColor={c.netProfit >= 0 ? '#10B981' : '#EF4444'} bold />
          <Row label="Net margin" value={`${c.netMargin.toFixed(2)}%`} valueColor="#6366F1" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor = '#1A1D2B', bold = false }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-black/[0.03] last:border-0">
      <span className="text-[13px] text-[#6B7194]">{label}</span>
      <span
        className="tabular-nums"
        style={{ color: valueColor, fontWeight: bold ? 800 : 600, fontSize: bold ? '15px' : '13.5px' }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  P&L Tab                                                    */
/* ─────────────────────────────────────────────────────────── */

function PnlTab({ data }) {
  return (
    <div className="space-y-[18px]">
      {/* P&L statement */}
      <div className="gc-card p-6">
        <h3 className="text-[15px] font-bold text-[#1A1D2B] mb-4">Profit & Loss Statement</h3>
        <div className="space-y-0">
          <Row label="Revenue" value={fmt(data.revenue)} bold />
          <div className="h-1" />
          {data.expenses.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide mt-3 mb-1">Operating expenses</p>
              {data.expenses.map((e) => (
                <div key={e.category} className="flex items-center justify-between py-1.5 pl-3 border-b border-black/[0.03] last:border-0">
                  <div>
                    <span className="text-[13px] text-[#6B7194]">{e.category}</span>
                    <span className="text-[10px] text-[#9CA3C0] ml-2">{e.count} item{e.count === 1 ? '' : 's'}</span>
                  </div>
                  <span className="text-[13px] text-[#1A1D2B] tabular-nums">{fmt(e.amount)}</span>
                </div>
              ))}
              <Row label="Total expenses" value={`− ${fmt(data.totalExpenses)}`} valueColor="#EF4444" bold />
            </>
          )}
          <div className="h-2" />
          <div className="flex items-center justify-between pt-3 border-t-2 border-[#1A1D2B]">
            <span className="text-[14px] font-bold text-[#1A1D2B]">Net profit</span>
            <span
              className="text-[20px] font-extrabold tabular-nums"
              style={{ color: data.netProfit >= 0 ? '#10B981' : '#EF4444' }}
            >
              {fmt(data.netProfit)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-[#9CA3C0]">Net margin</span>
            <span className="text-[12px] font-semibold text-[#6366F1] tabular-nums">{data.netMargin.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Monthly breakdown */}
      {data.monthly?.length > 1 && (
        <div className="gc-card overflow-hidden">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] px-6 py-5 border-b border-black/[0.04]">Monthly Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Month</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Revenue</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Expenses</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-black/[0.03] last:border-0">
                    <td className="px-6 py-3 font-medium text-[#1A1D2B]">{m.label}</td>
                    <td className="px-6 py-3 text-right text-[#1A1D2B] tabular-nums">{fmt(m.revenue)}</td>
                    <td className="px-6 py-3 text-right text-[#EF4444] tabular-nums">− {fmt(m.expenses)}</td>
                    <td
                      className="px-6 py-3 text-right font-bold tabular-nums"
                      style={{ color: m.netProfit >= 0 ? '#10B981' : '#EF4444' }}
                    >
                      {fmt(m.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Cash Flow Tab                                              */
/* ─────────────────────────────────────────────────────────── */

function CashFlowTab({ data }) {
  return (
    <div className="space-y-[18px]">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        <KpiCard label="Inflows"  value={data.totalInflows}  accent="green" subtext="Payments received" />
        <KpiCard label="Outflows" value={data.totalOutflows} accent="red"   subtext="Expenses paid" />
        <KpiCard label="Net cash" value={data.netCashFlow}   accent={data.netCashFlow >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <div className="gc-card p-6">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] mb-4">Inflows by method</h3>
          {data.inflowsByMethod.length === 0 ? (
            <p className="text-[13px] text-[#9CA3C0]">No payments in this period.</p>
          ) : (
            data.inflowsByMethod.map((r) => (
              <Row key={r.method} label={`${r.method} (${r.count})`} value={fmt(r.amount)} valueColor="#10B981" />
            ))
          )}
        </div>

        <div className="gc-card p-6">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] mb-4">Outflows by category</h3>
          {data.outflowsByCategory.length === 0 ? (
            <p className="text-[13px] text-[#9CA3C0]">No expenses in this period.</p>
          ) : (
            data.outflowsByCategory.map((r) => (
              <Row key={r.category} label={`${r.category} (${r.count})`} value={fmt(r.amount)} valueColor="#EF4444" />
            ))
          )}
        </div>
      </div>

      {data.monthly?.length > 1 && (
        <div className="gc-card overflow-hidden">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] px-6 py-5 border-b border-black/[0.04]">Monthly Cash Flow</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Month</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Inflows</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Outflows</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-black/[0.03] last:border-0">
                    <td className="px-6 py-3 font-medium text-[#1A1D2B]">{m.label}</td>
                    <td className="px-6 py-3 text-right text-[#10B981] tabular-nums">{fmt(m.inflows)}</td>
                    <td className="px-6 py-3 text-right text-[#EF4444] tabular-nums">− {fmt(m.outflows)}</td>
                    <td
                      className="px-6 py-3 text-right font-bold tabular-nums"
                      style={{ color: m.net >= 0 ? '#10B981' : '#EF4444' }}
                    >
                      {fmt(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Customers Tab                                              */
/* ─────────────────────────────────────────────────────────── */

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366F1, #3B82F6)',
  'linear-gradient(135deg, #10B981, #059669)',
  'linear-gradient(135deg, #F59E0B, #D97706)',
  'linear-gradient(135deg, #EF4444, #DC2626)',
  'linear-gradient(135deg, #8B5CF6, #6366F1)',
  'linear-gradient(135deg, #EC4899, #DB2777)',
];
function gradientFor(name) {
  const hash = (name || '').split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function CustomersTab({ data, sort, onSortChange }) {
  const s = data.summary;
  const rows = data.customers;
  const maxSpent = Math.max(...rows.map((r) => r.totalSpent), 1);

  const SortButton = ({ k, label }) => (
    <button
      type="button"
      onClick={() => onSortChange(k)}
      className={`h-8 px-3 rounded-[8px] text-[11.5px] font-semibold transition-all ${
        sort === k
          ? 'bg-[#6366F1] text-white'
          : 'bg-[#F4F6FA] text-[#6B7194] hover:bg-[#E9EBF2]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-[18px]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[18px]">
        <KpiCard label="Total Customers"   value={`${s.totalCustomers.toLocaleString()}`} subtext="All time"        accent="blue" />
        <KpiCard label="Active in Period"  value={`${s.activeInPeriod.toLocaleString()}`} subtext="Had invoices"    accent="green" />
        <KpiCard label="New in Period"     value={`${s.newInPeriod.toLocaleString()}`}    subtext="First-ever invoice" accent="gold" />
        <KpiCard label="Top 5 Revenue Share" value={`${s.top5Share.toFixed(1)}%`}         subtext={fmt(s.totalPeriodRevenue) + ' total'} accent="red" />
      </div>

      {rows.length > 0 && (
        <div className="gc-card p-6">
          <h3 className="text-[15px] font-bold text-[#1A1D2B] mb-4">Top customers by revenue</h3>
          <div className="space-y-2">
            {rows.slice(0, 8).map((c, idx) => {
              const pct = maxSpent > 0 ? (c.totalSpent / maxSpent) * 100 : 0;
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <div
                    className="w-[28px] h-[28px] rounded-[8px] shrink-0 flex items-center justify-center text-white text-[10.5px] font-bold"
                    style={{ background: gradientFor(c.name) }}
                  >
                    {initialsOf(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12.5px] font-medium text-[#1A1D2B] truncate">
                        {idx + 1}. {c.name}
                      </span>
                      <span className="text-[12px] font-bold text-[#1A1D2B] tabular-nums shrink-0 ml-2">
                        {fmt(c.totalSpent)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#F4F6FA] rounded-full overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: gradientFor(c.name) }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="gc-card overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 px-6 py-5 border-b border-black/[0.04]">
          <div>
            <h3 className="text-[15px] font-bold text-[#1A1D2B]">Customer Ranking</h3>
            <p className="text-[11.5px] text-[#9CA3C0] mt-0.5">{rows.length} customers with activity in this period</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mr-1">Sort by</span>
            <SortButton k="total_spent"   label="Revenue" />
            <SortButton k="collected"     label="Collected" />
            <SortButton k="outstanding"   label="Outstanding" />
            <SortButton k="invoice_count" label="Orders" />
            <SortButton k="last_purchase" label="Recent" />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-center py-12 text-[#9CA3C0]">No customer activity in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="bg-[#F4F6FA]">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px] w-8">#</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Customer</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Orders</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Revenue</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Collected</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Outstanding</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Avg Order</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id} className="border-b border-black/[0.03] last:border-0 hover:bg-[rgba(99,102,241,0.02)] transition-colors">
                    <td className="px-6 py-3 text-[#9CA3C0] font-semibold">{i + 1}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-[30px] h-[30px] rounded-[8px] shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                          style={{ background: gradientFor(c.name) }}
                        >
                          {initialsOf(c.name)}
                        </div>
                        <div className="min-w-0">
                          <a href={`/customers/${c.id}`} className="font-semibold text-[#1A1D2B] hover:text-[#6366F1] block truncate">
                            {c.name}
                          </a>
                          <p className="text-[10.5px] text-[#9CA3C0] truncate">{c.phone || c.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-[#6B7194] tabular-nums">{c.invoiceCount}</td>
                    <td className="px-6 py-3 text-right font-bold text-[#1A1D2B] tabular-nums">{fmt(c.totalSpent)}</td>
                    <td className="px-6 py-3 text-right text-[#10B981] font-semibold tabular-nums">{fmt(c.collected)}</td>
                    <td
                      className="px-6 py-3 text-right font-semibold tabular-nums"
                      style={{ color: c.outstanding > 0.01 ? '#EF4444' : '#9CA3C0' }}
                    >
                      {fmt(c.outstanding)}
                    </td>
                    <td className="px-6 py-3 text-right text-[#6B7194] tabular-nums">{fmt(c.avgOrder)}</td>
                    <td className="px-6 py-3 text-[#6B7194] text-[12px]">
                      {c.lastPurchase ? new Date(c.lastPurchase).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
