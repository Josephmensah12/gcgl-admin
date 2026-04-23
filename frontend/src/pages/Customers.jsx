import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { SkeletonPage } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { exportCSV } from '../utils/csvExport';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';

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
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

export default function Customers() {
  const { onMenuClick } = useLayout();
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/customers', {
        params: { page: pagination.page, limit: pagination.limit, search },
      });
      setCustomers(res.data.data.customers);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <><PageHeader title="Customers" subtitle="Loading..." onMenuClick={onMenuClick} hideSearch /><SkeletonPage kpiCards={0} tableRows={8} tableCols={6} /></>;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${pagination.total} customer${pagination.total === 1 ? '' : 's'}`}
        onMenuClick={onMenuClick}
        hideSearch
      />

      {/* Search + Export */}
      <div className="gc-card p-5 mb-[18px]">
        <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <svg className="w-4 h-4 absolute left-3 top-3 text-[#9CA3C0] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            placeholder="Search customers by name, email, phone..."
            className="w-full h-10 pl-9 pr-4 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all"
          />
        </div>
        <button
          onClick={() => exportCSV(customers, [
            { key: r => r.fullName || r.name, label: 'Customer' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: r => r._recipientCount ?? '', label: 'Recipients' },
            { key: r => r._totalValue ?? '', label: 'Total Value' },
            { key: r => r._unpaid ?? '', label: 'Unpaid' },
          ], 'customers')}
          className="h-10 px-4 rounded-[10px] bg-[#F4F6FA] text-[#6B7194] text-[12px] font-semibold hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
        </div>
      </div>

      {/* Table */}
      <div className="gc-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-[#F4F6FA]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Customer</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Contact</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Recipients</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Shipments</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Total Value</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-black/[0.03] last:border-0 hover:bg-[rgba(99,102,241,0.02)] transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-[30px] h-[30px] rounded-[8px] shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                        style={{ background: gradientFor(c.fullName) }}
                      >
                        {initialsOf(c.fullName)}
                      </div>
                      <Link to={`/customers/${c.id}`} className="font-semibold text-[#6366F1] hover:text-[#4F46E5]">
                        {c.fullName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <p className="text-[#6B7194]">{c.phone}</p>
                    <p className="text-[11px] text-[#9CA3C0]">{c.email}</p>
                  </td>
                  <td className="px-6 py-3.5 text-[#6B7194]">{c.recipients?.length || 0}</td>
                  <td className="px-6 py-3.5 text-[#6B7194]">{c.stats.totalInvoices}</td>
                  <td className="px-6 py-3.5 font-bold text-[#1A1D2B] tabular-nums">{fmt(c.stats.totalValue)}</td>
                  <td className="px-6 py-3.5">
                    {c.stats.unpaidValue > 0 ? (
                      <span className="font-semibold text-[#EF4444] tabular-nums">{fmt(c.stats.unpaidValue)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold bg-[rgba(16,185,129,0.08)] text-[#10B981]">
                        <span className="w-[5px] h-[5px] rounded-full bg-current" /> Paid
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && (
            <EmptyState title="No customers found" description={search ? 'Try a different search term' : 'Customers appear here when invoices are created in the pickup app'} />
          )}
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/[0.03]">
            <p className="text-[12.5px] text-[#6B7194]">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
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
