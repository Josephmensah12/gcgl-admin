import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';

export default function Pickups() {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, unassigned, assigned
  const [selected, setSelected] = useState(new Set());
  const [shipments, setShipments] = useState([]);
  const [assignShipmentId, setAssignShipmentId] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  const loadPickups = useCallback(async () => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, search };
      if (filter === 'unassigned') params.unassigned = 'true';
      const res = await axios.get('/api/v1/pickups', { params });
      setPickups(res.data.data.pickups);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, filter]);

  useEffect(() => { loadPickups(); }, [loadPickups]);

  useEffect(() => {
    axios.get('/api/v1/shipments/active').then((res) => setShipments(res.data.data)).catch(() => {});
    axios.get('/api/v1/pickups/warehouse-summary').then((res) => setSummary(res.data.data)).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

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

  const getAgingBadge = (days) => {
    if (days <= 3) return 'bg-green-100 text-green-700';
    if (days <= 7) return 'bg-yellow-100 text-yellow-700';
    if (days <= 14) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  if (loading) return <LoadingSpinner text="Loading invoices..." />;

  return (
    <div className="space-y-6">
      {/* Warehouse Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {summary.aging.map((a) => (
            <div key={a.label} className="bg-white rounded-lg border border-gray-100 p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{a.count}</p>
              <p className="text-xs text-gray-500">{a.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={search}
                onChange={handleSearch}
                placeholder="Search by customer, phone, invoice #..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="all">All Invoices</option>
              <option value="unassigned">Unassigned Only</option>
            </select>
            <button onClick={() => navigate('/pickups/new')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 whitespace-nowrap">
              + New Invoice
            </button>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selected.size} selected</span>
              <button
                onClick={() => setShowAssign(true)}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
              >
                Assign to Shipment
              </button>
              <button
                onClick={handleUnassign}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              >
                Unassign
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAssign(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Assign to Shipment</h3>
            <p className="text-sm text-gray-500 mb-4">Assigning {selected.size} pickup(s)</p>
            <select
              value={assignShipmentId}
              onChange={(e) => setAssignShipmentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4"
            >
              <option value="">Select shipment...</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({shipmentDateRange(s)})
                </option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAssign(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
                Cancel
              </button>
              <button onClick={handleAssign} disabled={!assignShipmentId} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selected.size === pickups.length && pickups.length > 0} onChange={selectAll} className="rounded" />
                </th>
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Shipment</th>
                <th className="px-4 py-3 font-medium">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pickups.map((p) => (
                <tr key={p.id} className={`hover:bg-gray-50 ${selected.has(p.id) ? 'bg-primary-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/pickups/${p.id}`} className="font-medium text-primary-600 hover:text-primary-700">
                      #{p.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{p.customerName}</p>
                      <p className="text-xs text-gray-500">{p.customerPhone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.recipientName || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.itemCount}</td>
                  <td className="px-4 py-3 font-medium">${parseFloat(p.finalTotal).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                      ${p.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.Shipment ? (
                      <Link to={`/shipments/${p.Shipment.id}`} className="text-primary-600 hover:text-primary-700 text-xs">
                        {p.Shipment.name}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getAgingBadge(p.warehouseDays)}`}>
                      {p.warehouseDays}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pickups.length === 0 && (
            <p className="text-center py-12 text-gray-400">No invoices found</p>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                Prev
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
