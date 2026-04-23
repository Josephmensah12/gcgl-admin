import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { SkeletonPage } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { exportCSV } from '../utils/csvExport';

const METHODS = ['Cash', 'Check', 'Zelle', 'Square', 'Other'];

export default function Payments() {
  const { onMenuClick } = useLayout();
  const [transactions, setTransactions] = useState([]);
  const [aggregates, setAggregates] = useState({ totalPayments: 0, totalRefunds: 0, netCollected: 0, paymentCount: 0, refundCount: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', transactionType: '', paymentMethod: '', includeVoided: false, dateFrom: '', dateTo: '', datePreset: 'all' });
  const [loading, setLoading] = useState(true);

  const applyDatePreset = (preset) => {
    const now = new Date();
    let dateFrom = '', dateTo = '';
    if (preset === 'today') {
      dateFrom = dateTo = now.toISOString().split('T')[0];
    } else if (preset === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      dateFrom = d.toISOString().split('T')[0]; dateTo = now.toISOString().split('T')[0];
    } else if (preset === 'month') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      dateTo = now.toISOString().split('T')[0];
    } else if (preset === 'year') {
      dateFrom = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      dateTo = now.toISOString().split('T')[0];
    }
    setFilters(f => ({ ...f, dateFrom, dateTo, datePreset: preset }));
    setPagination(p => ({ ...p, page: 1 }));
  };

  const loadTransactions = useCallback(async () => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, sortBy: 'payment_date', sortOrder: 'DESC' };
      if (filters.search) params.search = filters.search;
      if (filters.transactionType) params.transactionType = filters.transactionType;
      if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
      if (filters.includeVoided) params.includeVoided = 'true';
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const res = await axios.get('/api/v1/transactions', { params });
      setTransactions(res.data.data.transactions);
      setAggregates(res.data.data.aggregates);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <><PageHeader title="Payments" subtitle="Loading..." onMenuClick={onMenuClick} hideSearch /><SkeletonPage kpiCards={3} tableRows={8} tableCols={7} /></>;

  return (
    <>
      <PageHeader title="Payments" subtitle="Payment and refund transaction history" onMenuClick={onMenuClick} hideSearch />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px] mb-[18px]">
        <StatCard label="Total Payments" value={fmt(aggregates.totalPayments)} sub={`${aggregates.paymentCount} transactions`} accent="green" />
        <StatCard label="Total Refunds" value={fmt(aggregates.totalRefunds)} sub={`${aggregates.refundCount} transactions`} accent="amber" />
        <StatCard label="Net Collected" value={fmt(aggregates.netCollected)} sub={`${aggregates.transactionCount || 0} total`} accent="blue" />
      </div>

      {/* Filters */}
      <div className="gc-card p-5 mb-[18px]">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { key: 'all', label: 'All Time' },
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'Last 7 Days' },
            { key: 'month', label: 'This Month' },
            { key: 'year', label: 'This Year' },
            { key: 'custom', label: 'Custom' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => key === 'custom' ? setFilters(f => ({ ...f, datePreset: 'custom' })) : applyDatePreset(key)}
              className={`h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ${
                filters.datePreset === key
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#F4F6FA] text-[#6B7194] hover:bg-[#E9EBF2]'
              }`}
            >
              {label}
            </button>
          ))}
          {filters.datePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}
                className="h-8 px-2 rounded-lg border border-black/[0.06] bg-white text-[12px] focus:border-[#6366F1] outline-none"
              />
              <span className="text-[11px] text-[#9CA3C0]">to</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPagination(p => ({ ...p, page: 1 })); }}
                className="h-8 px-2 rounded-lg border border-black/[0.06] bg-white text-[12px] focus:border-[#6366F1] outline-none"
              />
            </div>
          )}
        </div>
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <svg className="w-4 h-4 absolute left-3 top-3 text-[#9CA3C0] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
              placeholder="Search by customer or invoice #..."
              className="w-full h-10 pl-9 pr-4 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all"
            />
          </div>
          <select
            value={filters.transactionType}
            onChange={(e) => { setFilters((f) => ({ ...f, transactionType: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
            className="h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] focus:border-[#6366F1] outline-none"
          >
            <option value="">All Types</option>
            <option value="PAYMENT">Payments</option>
            <option value="REFUND">Refunds</option>
          </select>
          <select
            value={filters.paymentMethod}
            onChange={(e) => { setFilters((f) => ({ ...f, paymentMethod: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
            className="h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] focus:border-[#6366F1] outline-none"
          >
            <option value="">All Methods</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label className="flex items-center gap-2 text-[12.5px] text-[#6B7194] cursor-pointer">
            <input
              type="checkbox"
              checked={filters.includeVoided}
              onChange={(e) => { setFilters((f) => ({ ...f, includeVoided: e.target.checked })); setPagination((p) => ({ ...p, page: 1 })); }}
              className="rounded accent-[#6366F1]"
            />
            Show voided
          </label>
          <button
            onClick={() => exportCSV(transactions, [
              { key: r => new Date(r.paymentDate).toLocaleDateString(), label: 'Date' },
              { key: r => r.invoice?.invoiceNumber || '', label: 'Invoice #' },
              { key: r => r.invoice?.customerName || '', label: 'Customer' },
              { key: 'transactionType', label: 'Type' },
              { key: 'paymentMethod', label: 'Method' },
              { key: 'amount', label: 'Amount' },
              { key: 'comment', label: 'Comment' },
            ], 'payments')}
            className="h-10 px-4 rounded-[10px] bg-[#F4F6FA] text-[#6B7194] text-[12px] font-semibold hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="gc-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-[#F4F6FA]">
                {['Date', 'Invoice', 'Customer', 'Type', 'Method', 'Amount', 'Comment', 'By'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-6 py-3 text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px] ${i === 5 ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const isVoided = !!tx.voidedAt;
                const isRefund = tx.transactionType === 'REFUND';
                const typeColors = isVoided
                  ? { bg: 'rgba(0,0,0,0.04)', color: '#9CA3C0' }
                  : isRefund
                  ? { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' }
                  : { bg: 'rgba(16,185,129,0.08)', color: '#10B981' };
                return (
                  <tr
                    key={tx.id}
                    className={`border-b border-black/[0.03] last:border-0 hover:bg-[rgba(99,102,241,0.02)] transition-colors ${isVoided ? 'opacity-50' : ''}`}
                  >
                    <td className="px-6 py-3.5 text-[#6B7194]">{new Date(tx.paymentDate).toLocaleDateString()}</td>
                    <td className="px-6 py-3.5">
                      <Link to={`/pickups/${tx.invoice?.id}`} className="font-bold text-[#6366F1] hover:text-[#4F46E5]">
                        #{tx.invoice?.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-[#1A1D2B] font-medium">{tx.invoice?.customerName}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold"
                        style={{ background: typeColors.bg, color: typeColors.color }}
                      >
                        <span className="w-[5px] h-[5px] rounded-full bg-current" />
                        {isRefund ? 'Refund' : 'Payment'}{isVoided ? ' (Voided)' : ''}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#F4F6FA] text-[#6B7194]">
                        {tx.paymentMethod === 'Other' && tx.paymentMethodOtherText ? `Other — ${tx.paymentMethodOtherText}` : tx.paymentMethod}
                      </span>
                    </td>
                    <td
                      className={`px-6 py-3.5 text-right font-bold tabular-nums ${
                        isVoided ? 'text-[#9CA3C0] line-through' : isRefund ? 'text-[#F59E0B]' : 'text-[#10B981]'
                      }`}
                    >
                      {isRefund ? '-' : '+'}${parseFloat(tx.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 text-[#6B7194] max-w-xs truncate">{tx.comment}</td>
                    <td className="px-6 py-3.5 text-[#9CA3C0] text-[11.5px]">{tx.recordedBy?.full_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <EmptyState title="No transactions found" description="Payment transactions will appear here when payments are recorded against invoices" />
          )}
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/[0.03]">
            <p className="text-[12.5px] text-[#6B7194]">Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="h-8 px-3 rounded-[8px] border border-black/[0.06] text-[12px] font-medium text-[#6B7194] disabled:opacity-40 hover:bg-[#F4F6FA] transition-colors"
              >
                Prev
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="h-8 px-3 rounded-[8px] border border-black/[0.06] text-[12px] font-medium text-[#6B7194] disabled:opacity-40 hover:bg-[#F4F6FA] transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, sub, accent }) {
  const gradients = {
    green: 'linear-gradient(135deg, #10B981, #059669)',
    amber: 'linear-gradient(135deg, #F59E0B, #D97706)',
    blue:  'linear-gradient(135deg, #6366F1, #3B82F6)',
  };
  const colors = {
    green: '#10B981',
    amber: '#F59E0B',
    blue:  '#1A1D2B',
  };
  return (
    <div className="relative overflow-hidden gc-card gc-card-hover p-6">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[16px]" style={{ background: gradients[accent] }} />
      <p className="text-[12.5px] font-medium text-[#6B7194] mb-2">{label}</p>
      <p className="text-[26px] font-extrabold tracking-[-0.6px] tabular-nums" style={{ color: colors[accent] }}>
        {value}
      </p>
      <p className="text-[12px] text-[#9CA3C0] mt-1">{sub}</p>
    </div>
  );
}
