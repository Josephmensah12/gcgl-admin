import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';

const STATUS_STYLES = {
  collecting: { bg: 'rgba(59,130,246,0.08)', color: '#3B82F6' },
  ready:      { bg: 'rgba(139,92,246,0.08)', color: '#8B5CF6' },
  shipped:    { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' },
  transit:    { bg: 'rgba(234,179,8,0.08)',  color: '#EAB308' },
  customs:    { bg: 'rgba(249,115,22,0.08)', color: '#F97316' },
  delivered:  { bg: 'rgba(16,185,129,0.08)', color: '#10B981' },
};

function capacityColor(pct) {
  if (pct >= 90) return '#EF4444';
  if (pct >= 70) return '#F59E0B';
  return '#6366F1';
}

export default function Shipments() {
  const { onMenuClick } = useLayout();
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadShipments = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/shipments', {
        params: { page: pagination.page, limit: pagination.limit, search, status: statusFilter },
      });
      setShipments(res.data.data.shipments);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

  useEffect(() => { loadShipments(); }, [loadShipments]);

  if (loading) return <LoadingSpinner text="Loading shipments..." />;

  return (
    <>
      <PageHeader
        title="Shipments"
        subtitle={`${pagination.total} container${pagination.total === 1 ? '' : 's'}`}
        onMenuClick={onMenuClick}
        hideSearch
        actions={
          <button
            onClick={() => navigate('/shipments/new')}
            className="hidden sm:inline-flex items-center gap-2 px-4 h-10 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] shadow-[0_4px_15px_rgba(99,102,241,0.25)] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Shipment
          </button>
        }
      />

      {/* Controls */}
      <div className="gc-card p-5 mb-[18px]">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <svg className="w-4 h-4 absolute left-3 top-3 text-[#9CA3C0] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              placeholder="Search shipments..."
              className="w-full h-10 pl-9 pr-4 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] outline-none"
          >
            <option value="">All Statuses</option>
            <option value="collecting">Collecting</option>
            <option value="ready">Ready</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>

      {/* Shipment grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[18px]">
        {shipments.map((s) => {
          const st = STATUS_STYLES[s.status] || STATUS_STYLES.collecting;
          const bar = capacityColor(s.capacityPercent);
          return (
            <Link
              key={s.id}
              to={`/shipments/${s.id}`}
              className="gc-card gc-card-hover p-6 block"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-bold text-[#1A1D2B] tracking-[-0.2px] truncate" title={shipmentDateRange(s)}>{s.name}</h3>
                <span
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize"
                  style={{ background: st.bg, color: st.color }}
                >
                  {s.status}
                </span>
              </div>

              {/* Capacity bar */}
              <div className="mb-4">
                <div className="flex justify-between text-[11.5px] mb-1.5">
                  <span className="text-[#6B7194] font-medium">${parseFloat(s.totalValue).toLocaleString()}</span>
                  <span className="text-[#9CA3C0]">${(s.maxCapacity || 0).toLocaleString()}</span>
                </div>
                <div className="w-full bg-[#EEF0F6] rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${s.capacityPercent}%`, background: bar }}
                  />
                </div>
                <p className="text-[11px] text-[#9CA3C0] mt-1.5">{s.capacityPercent}% capacity</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-black/[0.03]">
                <div>
                  <p className="text-[18px] font-extrabold text-[#1A1D2B]">{s.stats.invoiceCount}</p>
                  <p className="text-[10px] text-[#9CA3C0] uppercase tracking-wide mt-0.5">Invoices</p>
                </div>
                <div>
                  <p className="text-[18px] font-extrabold text-[#10B981]">${((s.stats.paidValue || 0) / 1000).toFixed(1)}k</p>
                  <p className="text-[10px] text-[#9CA3C0] uppercase tracking-wide mt-0.5">Paid</p>
                </div>
                <div>
                  <p className="text-[18px] font-extrabold text-[#EF4444]">${((s.stats.unpaidValue || 0) / 1000).toFixed(1)}k</p>
                  <p className="text-[10px] text-[#9CA3C0] uppercase tracking-wide mt-0.5">Unpaid</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {shipments.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[#9CA3C0] mb-4">No shipments found</p>
          <button
            onClick={() => navigate('/shipments/new')}
            className="px-4 h-10 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5]"
          >
            Create First Shipment
          </button>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
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
    </>
  );
}
