import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Payments() {
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadInvoices = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/payments', {
        params: { page: pagination.page, limit: pagination.limit, search, paymentStatus: statusFilter },
      });
      setInvoices(res.data.data.invoices);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  useEffect(() => {
    axios.get('/api/v1/payments/summary').then((res) => setSummary(res.data.data)).catch(() => {});
  }, []);

  const startEdit = (inv) => {
    setEditingId(inv.id);
    setEditForm({
      paymentStatus: inv.paymentStatus,
      paymentMethod: inv.paymentMethod || '',
      amountPaid: parseFloat(inv.amountPaid) || 0,
    });
  };

  const savePayment = async () => {
    try {
      await axios.put(`/api/v1/payments/${editingId}`, editForm);
      setEditingId(null);
      loadInvoices();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Update failed');
    }
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner text="Loading payments..." />;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {summary.byStatus.map((s) => (
            <div key={s.status} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500 capitalize">{s.status}</p>
              <p className="text-xl font-bold text-gray-900">{fmt(s.total)}</p>
              <p className="text-xs text-gray-400">{s.count} invoices</p>
            </div>
          ))}
        </div>
      )}

      {/* Aging */}
      {summary?.aging && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Unpaid Invoice Aging</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summary.aging.map((a) => (
              <div key={a.label} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-900">{fmt(a.total)}</p>
                <p className="text-xs text-gray-500">{a.label} ({a.count})</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text" value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              placeholder="Search by customer or invoice #..."
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
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Shipment</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/pickups/${inv.id}`} className="font-medium text-primary-600">#{inv.invoiceNumber}</Link>
                  </td>
                  <td className="px-4 py-3">{inv.customerName}</td>
                  <td className="px-4 py-3 font-medium">{fmt(inv.finalTotal)}</td>
                  <td className="px-4 py-3">
                    {editingId === inv.id ? (
                      <select value={editForm.paymentStatus} onChange={(e) => setEditForm((f) => ({ ...f, paymentStatus: e.target.value }))}
                        className="px-2 py-1 border rounded text-xs">
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${inv.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {inv.paymentStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === inv.id ? (
                      <select value={editForm.paymentMethod} onChange={(e) => setEditForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                        className="px-2 py-1 border rounded text-xs">
                        <option value="">Select...</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="zelle">Zelle</option>
                        <option value="square">Square</option>
                      </select>
                    ) : (
                      <span className="text-gray-600 capitalize">{inv.paymentMethod || '-'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === inv.id ? (
                      <input type="number" value={editForm.amountPaid} onChange={(e) => setEditForm((f) => ({ ...f, amountPaid: e.target.value }))}
                        className="w-20 px-2 py-1 border rounded text-xs" step="0.01" />
                    ) : (
                      <span>{fmt(inv.amountPaid)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{inv.Shipment?.name || '-'}</td>
                  <td className="px-4 py-3">
                    {editingId === inv.id ? (
                      <div className="flex gap-1">
                        <button onClick={savePayment} className="text-xs text-green-600 hover:text-green-700 font-medium">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(inv)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <p className="text-center py-12 text-gray-400">No invoices found</p>}
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex gap-1">
              <button disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Prev</button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
