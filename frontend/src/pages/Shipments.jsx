import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { shipmentDateRange } from '../utils/shipmentLabel';

export default function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  const getStatusBadge = (status) => {
    const styles = {
      collecting: 'bg-blue-100 text-blue-700',
      ready: 'bg-purple-100 text-purple-700',
      shipped: 'bg-amber-100 text-amber-700',
      transit: 'bg-yellow-100 text-yellow-700',
      customs: 'bg-orange-100 text-orange-700',
      delivered: 'bg-green-100 text-green-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  const getCapacityColor = (pct) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-primary-500';
  };

  if (loading) return <LoadingSpinner text="Loading shipments..." />;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <input
                type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                placeholder="Search shipments..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Statuses</option>
              <option value="collecting">Collecting</option>
              <option value="ready">Ready</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
          <button
            onClick={() => navigate('/shipments/new')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
          >
            + New Shipment
          </button>
        </div>
      </div>

      {/* Shipment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shipments.map((s) => (
          <Link key={s.id} to={`/shipments/${s.id}`} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900" title={shipmentDateRange(s)}>{s.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(s.status)}`}>
                {s.status}
              </span>
            </div>

            {/* Capacity bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">${parseFloat(s.totalValue).toLocaleString()}</span>
                <span className="text-gray-500">${s.maxCapacity.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${getCapacityColor(s.capacityPercent)}`}
                  style={{ width: `${s.capacityPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{s.capacityPercent}% capacity</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-gray-900">{s.stats.invoiceCount}</p>
                <p className="text-xs text-gray-500">Invoices</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600">${((s.stats.paidValue || 0) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-gray-500">Paid</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-600">${((s.stats.unpaidValue || 0) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-gray-500">Unpaid</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {shipments.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">No shipments found</p>
          <button onClick={() => navigate('/shipments/new')} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
            Create First Shipment
          </button>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</p>
          <div className="flex gap-1">
            <button disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Prev</button>
            <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
