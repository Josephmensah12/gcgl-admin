import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';

/* Deterministic customer avatar gradient */
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

// Compute a {from, to} ISO date range for a named preset.
// 'month' uses the second argument (YYYY-MM).
function computeDateRange(preset, monthYear) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const endOfDay   = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today': {
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'week': {
      // Week starts on Sunday. 0 = Sunday
      const dayOfWeek = now.getDay();
      const start = new Date(y, m, d - dayOfWeek, 0, 0, 0);
      return { from: start.toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'month': {
      const [yy, mm] = (monthYear || `${y}-${String(m + 1).padStart(2, '0')}`).split('-').map(Number);
      const start = new Date(yy, mm - 1, 1, 0, 0, 0);
      const end = new Date(yy, mm, 0, 23, 59, 59, 999); // day 0 of next month = last day of this month
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case 'year': {
      return {
        from: new Date(y, 0, 1, 0, 0, 0).toISOString(),
        to: new Date(y, 11, 31, 23, 59, 59, 999).toISOString(),
      };
    }
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

export default function Pickups() {
  const navigate = useNavigate();
  const { onMenuClick } = useLayout();
  const [searchParams] = useSearchParams();
  const [pickups, setPickups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all');
  const [sortBy, setSortBy] = useState('invoice_number');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [shipments, setShipments] = useState([]);
  const [assignShipmentId, setAssignShipmentId] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  // Date filter state
  const [datePreset, setDatePreset] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'year'
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadPickups = useCallback(async () => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, search, sortBy, sortOrder };
      if (filter === 'unassigned') params.unassigned = 'true';
      const { from, to } = computeDateRange(datePreset, monthYear);
      if (from) params.dateFrom = from;
      if (to) params.dateTo = to;
      const res = await axios.get('/api/v1/pickups', { params });
      setPickups(res.data.data.pickups);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, filter, sortBy, sortOrder, datePreset, monthYear]);

  const selectPreset = (preset) => {
    setDatePreset(preset);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(col);
      setSortOrder('DESC');
    }
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const SortHeader = ({ col, label, className = '' }) => {
    const active = sortBy === col;
    const arrow = active ? (sortOrder === 'ASC' ? '\u2191' : '\u2193') : '\u2195';
    return (
      <th
        className={`px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.8px] cursor-pointer select-none hover:text-[#1A1D2B] transition-colors ${
          active ? 'text-[#6366F1]' : 'text-[#9CA3C0]'
        } ${className}`}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-[10px] ${active ? 'text-[#6366F1]' : 'text-[#C7CDDB]'}`}>{arrow}</span>
        </span>
      </th>
    );
  };

  useEffect(() => { loadPickups(); }, [loadPickups]);

  useEffect(() => {
    axios.get('/api/v1/shipments/active').then((res) => setShipments(res.data.data)).catch(() => {});
    axios.get('/api/v1/pickups/warehouse-summary').then((res) => setSummary(res.data.data)).catch(() => {});
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === pickups.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pickups.map((p) => p.id)));
    }
  };

  const handleAssign = async () => {
    if (!assignShipmentId || selected.size === 0) return;
    try {
      await axios.post('/api/v1/pickups/assign', {
        invoiceIds: [...selected],
        shipmentId: assignShipmentId,
      });
      setSelected(new Set());
      setShowAssign(false);
      setAssignShipmentId('');
      loadPickups();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Assignment failed');
    }
  };

  const handleUnassign = async () => {
    if (selected.size === 0) return;
    try {
      await axios.post('/api/v1/pickups/unassign', { invoiceIds: [...selected] });
      setSelected(new Set());
      loadPickups();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Unassign failed');
    }
  };

  const getAgingTint = (days) => {
    if (days <= 3) return { bg: 'rgba(16,185,129,0.08)', color: '#10B981' };
    if (days <= 7) return { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' };
    if (days <= 14) return { bg: 'rgba(249,115,22,0.08)', color: '#F97316' };
    return { bg: 'rgba(239,68,68,0.07)', color: '#EF4444' };
  };

  if (loading) return <LoadingSpinner text="Loading invoices..." />;

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${pagination.total} total • manage pickups and shipment assignments`}
        onMenuClick={onMenuClick}
        hideSearch
        actions={
          <button
            onClick={() => navigate('/pickups/new')}
            className="hidden sm:inline-flex items-center gap-2 px-4 h-10 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] shadow-[0_4px_15px_rgba(99,102,241,0.25)] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Invoice
          </button>
        }
      />

      {/* Warehouse aging strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-[14px] mb-[18px]">
          {summary.aging.map((a) => (
            <div
              key={a.label}
              className="bg-white rounded-[16px] border border-black/[0.04] px-4 py-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300"
            >
              <p className="text-[22px] font-extrabold text-[#1A1D2B] tracking-[-0.5px]">{a.count}</p>
              <p className="text-[11px] text-[#6B7194] mt-1">{a.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-[16px] border border-black/[0.04] p-5 mb-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="relative flex-1 max-w-md">
            <svg className="w-4 h-4 absolute left-3 top-3 text-[#9CA3C0] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              placeholder="Search by customer, phone, invoice #..."
              className="w-full h-10 pl-9 pr-4 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] outline-none transition-all"
          >
            <option value="all">All Invoices</option>
            <option value="unassigned">Unassigned Only</option>
          </select>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[13px] text-[#6B7194]">{selected.size} selected</span>
              <button
                onClick={() => setShowAssign(true)}
                className="h-10 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] transition-colors"
              >
                Assign to Shipment
              </button>
              <button
                onClick={handleUnassign}
                className="h-10 px-4 rounded-[10px] bg-[#F4F6FA] text-[#1A1D2B] text-[13px] font-medium hover:bg-[#E9EBF2] transition-colors"
              >
                Unassign
              </button>
            </div>
          )}
        </div>

        {/* Date filter row */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-black/[0.04]">
          <span className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px] mr-1">Date</span>
          {[
            { key: 'all',   label: 'All'       },
            { key: 'today', label: 'Today'     },
            { key: 'week',  label: 'This Week' },
            { key: 'month', label: 'Month'     },
            { key: 'year',  label: 'This Year' },
          ].map(({ key, label }) => {
            const active = datePreset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectPreset(key)}
                className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold transition-all ${
                  active
                    ? 'bg-[#6366F1] text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)]'
                    : 'bg-[#F4F6FA] text-[#6B7194] hover:bg-[#E9EBF2]'
                }`}
              >
                {label}
              </button>
            );
          })}
          {datePreset === 'month' && (
            <input
              type="month"
              value={monthYear}
              onChange={(e) => { setMonthYear(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none ml-1"
            />
          )}
        </div>
      </div>

      {/* Assign modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAssign(false)}>
          <div className="bg-white rounded-[16px] p-6 w-full max-w-md mx-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[18px] font-bold text-[#1A1D2B] tracking-[-0.3px] mb-2">Assign to Shipment</h3>
            <p className="text-[13px] text-[#6B7194] mb-4">Assigning {selected.size} invoice{selected.size === 1 ? '' : 's'}</p>
            <select
              value={assignShipmentId}
              onChange={(e) => setAssignShipmentId(e.target.value)}
              className="w-full h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] outline-none mb-4"
            >
              <option value="">Select shipment...</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({shipmentDateRange(s)})
                </option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowAssign(false)}
                className="h-10 px-4 rounded-[10px] text-[#6B7194] hover:bg-[#F4F6FA] text-[13px] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignShipmentId}
                className="h-10 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-[16px] border border-black/[0.04] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-[#F4F6FA]">
                <th className="px-6 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === pickups.length && pickups.length > 0}
                    onChange={selectAll}
                    className="rounded accent-[#6366F1]"
                  />
                </th>
                <SortHeader col="invoice_number" label="Invoice #" />
                <SortHeader col="customer_name" label="Customer" />
                <SortHeader col="recipient_name" label="Recipient" />
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Items</th>
                <SortHeader col="final_total" label="Total" />
                <SortHeader col="payment_status" label="Payment" />
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Shipment</th>
                <SortHeader col="created_at" label="Age" />
              </tr>
            </thead>
            <tbody>
              {pickups.map((p) => {
                const statusColors = p.paymentStatus === 'paid'
                  ? { bg: 'rgba(16,185,129,0.08)', color: '#10B981' }
                  : p.paymentStatus === 'partial'
                  ? { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' }
                  : { bg: 'rgba(239,68,68,0.07)', color: '#EF4444' };
                const aging = getAgingTint(p.warehouseDays);
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-black/[0.03] last:border-0 hover:bg-[rgba(99,102,241,0.02)] transition-colors ${selected.has(p.id) ? 'bg-[rgba(99,102,241,0.04)]' : ''}`}
                  >
                    <td className="px-6 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded accent-[#6366F1]"
                      />
                    </td>
                    <td className="px-6 py-3.5">
                      <Link to={`/pickups/${p.id}`} className="font-bold text-[#6366F1] hover:text-[#4F46E5]">
                        #{p.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-[30px] h-[30px] rounded-[8px] shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                          style={{ background: gradientFor(p.customerName) }}
                        >
                          {initialsOf(p.customerName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[#1A1D2B] truncate">{p.customerName}</p>
                          <p className="text-[11px] text-[#9CA3C0] truncate">{p.customerPhone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-[#6B7194]">{p.recipientName || '—'}</td>
                    <td className="px-6 py-3.5 text-[#6B7194]">{p.itemCount}</td>
                    <td className="px-6 py-3.5 font-bold text-[#1A1D2B] tabular-nums">
                      ${parseFloat(p.finalTotal).toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold capitalize"
                        style={{ background: statusColors.bg, color: statusColors.color }}
                      >
                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'currentColor' }} />
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {p.Shipment ? (
                        <Link to={`/shipments/${p.Shipment.id}`} className="text-[#6366F1] hover:text-[#4F46E5] text-[12px] font-medium">
                          {p.Shipment.name}
                        </Link>
                      ) : (
                        <span className="text-[11px] text-[#9CA3C0]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold"
                        style={{ background: aging.bg, color: aging.color }}
                      >
                        {p.warehouseDays}d
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pickups.length === 0 && (
            <p className="text-center py-12 text-[#9CA3C0]">No invoices found</p>
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
                className="h-8 px-3 rounded-[8px] border border-black/[0.06] text-[12px] font-medium text-[#6B7194] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F4F6FA] transition-colors"
              >
                Prev
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="h-8 px-3 rounded-[8px] border border-black/[0.06] text-[12px] font-medium text-[#6B7194] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F4F6FA] transition-colors"
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
