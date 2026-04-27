import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';
import toast from 'react-hot-toast';

function EditExpenseModal({ expense, categories, shipments, onClose, onSaved }) {
  const [form, setForm] = useState({
    expense_date: expense.expense_date || '',
    category_id: expense.category_id || '',
    description: expense.description || '',
    vendor_or_payee: expense.vendor_or_payee || '',
    amount: expense.amount || '',
    shipment_id: expense.shipment_id || '',
    notes: expense.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await axios.put(`/api/v1/expenses/${expense.id}`, form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save');
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this expense?')) return;
    try {
      await axios.delete(`/api/v1/expenses/${expense.id}`);
      onSaved();
    } catch (err) { toast.error('Delete failed'); }
  };

  const handleRevertPersonal = async () => {
    if (!confirm('Mark as personal? This will remove the expense and mark the linked bank transaction as rejected.')) return;
    try {
      await axios.post(`/api/v1/expenses/${expense.id}/revert-personal`);
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 gc-backdrop-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto gc-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Edit Expense</h2>
            {expense.expense_number && <span className="text-xs font-mono text-gray-400">{expense.expense_number}</span>}
          </div>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
              <option value="">Select...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <input type="text" value={form.vendor_or_payee} onChange={(e) => setForm((f) => ({ ...f, vendor_or_payee: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipment</label>
            <select value={form.shipment_id} onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Unassigned</option>
              {shipments.map((s) => <option key={s.id} value={s.id}>{s.name} ({shipmentDateRange(s)})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleDelete} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Delete</button>
            <button type="button" onClick={handleRevertPersonal} className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200">Personal</button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ShipmentDetail() {
  const { onMenuClick } = useLayout();
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txAggregates, setTxAggregates] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseTotals, setExpenseTotals] = useState({ total: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'payments' | 'expenses'
  const [tileFilter, setTileFilter] = useState(null); // null | 'collected' | 'pending' | 'expenses'
  const [expCatFilter, setExpCatFilter] = useState(null); // filter expense table by category
  const [editingExp, setEditingExp] = useState(null);
  const [expCategories, setExpCategories] = useState([]);
  const [allShipments, setAllShipments] = useState([]);
  const [expSortBy, setExpSortBy] = useState('expense_date');
  const [expSortOrder, setExpSortOrder] = useState('ASC');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyPreview, setNotifyPreview] = useState(null);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifySending, setNotifySending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [notifyLoading, setNotifyLoading] = useState(false);

  const toggleExpSort = (field) => {
    if (expSortBy === field) { setExpSortOrder((o) => o === 'ASC' ? 'DESC' : 'ASC'); }
    else { setExpSortBy(field); setExpSortOrder(field === 'amount' ? 'DESC' : 'ASC'); }
  };

  const ExpSortHeader = ({ field, children, className = '' }) => (
    <th className={`px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none ${className}`} onClick={() => toggleExpSort(field)}>
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {children}
        {expSortBy === field ? <span className="text-primary-600">{expSortOrder === 'ASC' ? '\u2191' : '\u2193'}</span> : <span className="text-gray-300">\u2195</span>}
      </div>
    </th>
  );
  const [invSortBy, setInvSortBy] = useState('createdAt');
  const [invSortOrder, setInvSortOrder] = useState('DESC');

  const toggleInvSort = (field) => {
    if (invSortBy === field) {
      setInvSortOrder((o) => o === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setInvSortBy(field);
      setInvSortOrder(field === 'finalTotal' || field === 'amountPaid' ? 'DESC' : 'ASC');
    }
  };

  const InvSortHeader = ({ field, children, className = '' }) => (
    <th className={`px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none ${className}`} onClick={() => toggleInvSort(field)}>
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {children}
        {invSortBy === field ? (
          <span className="text-primary-600">{invSortOrder === 'ASC' ? '\u2191' : '\u2193'}</span>
        ) : (
          <span className="text-gray-300">\u2195</span>
        )}
      </div>
    </th>
  );

  const loadExpenses = () => axios.get('/api/v1/expenses', { params: { shipment_id: id, limit: 200 } })
    .then((res) => { setExpenses(res.data.data.expenses); setExpenseTotals(res.data.data.totals); });

  useEffect(() => {
    Promise.all([
      axios.get(`/api/v1/shipments/${id}`),
      axios.get('/api/v1/transactions', { params: { shipmentId: id, limit: 200 } }),
      axios.get('/api/v1/expenses', { params: { shipment_id: id, limit: 200 } }),
      axios.get('/api/v1/expenses/categories'),
      axios.get('/api/v1/shipments/active'),
    ])
      .then(([shipRes, txRes, expRes, catRes, shipRes2]) => {
        setShipment(shipRes.data.data);
        setTransactions(txRes.data.data.transactions);
        setTxAggregates(txRes.data.data.aggregates);
        setExpenses(expRes.data.data.expenses);
        setExpenseTotals(expRes.data.data.totals);
        setExpCategories(catRes.data.data);
        setAllShipments(shipRes2.data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleTileClick = (filter) => {
    if (tileFilter === filter) {
      setTileFilter(null);
      setActiveTab('invoices');
    } else {
      setTileFilter(filter);
      if (filter === 'collected') setActiveTab('payments');
      else if (filter === 'pending') setActiveTab('invoices');
      else if (filter === 'expenses') setActiveTab('expenses');
    }
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      const res = await axios.put(`/api/v1/shipments/${id}`, { status: newStatus });
      setShipment((prev) => ({ ...prev, ...res.data.data }));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const statusPipeline = ['collecting', 'ready', 'shipped', 'transit', 'customs', 'delivery', 'delivered'];

  const getCapacityColor = (pct) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-primary-500';
  };

  if (loading) return <LoadingSpinner />;
  if (!shipment) return <p className="text-center py-12 text-gray-500">Shipment not found</p>;

  const fmt = (n) => `$${(parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const currentIndex = statusPipeline.indexOf(shipment.status);

  // Compute payment stats from invoices
  const invoices = shipment.invoices || [];
  const totalValue = invoices.reduce((s, inv) => s + (parseFloat(inv.finalTotal) || 0), 0);
  const totalPaid = invoices.reduce((s, inv) => s + (parseFloat(inv.amountPaid) || 0), 0);
  const totalUnpaid = totalValue - totalPaid;
  const paidCount = invoices.filter((inv) => inv.paymentStatus === 'paid').length;
  const unpaidCount = invoices.filter((inv) => inv.paymentStatus !== 'paid').length;

  return (
    <>
      <PageHeader title={shipment?.name || 'Shipment'} subtitle="Container details, invoices, and costs" onMenuClick={onMenuClick} hideSearch />
    <div className="space-y-6">
      <Link to="/shipments" className="inline-flex items-center text-[13px] text-[#6366F1] hover:text-[#4F46E5] gap-1 font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Shipments
      </Link>

      {/* Tracking card */}
      <TrackingCard shipment={shipment} onUpdated={(s) => setShipment((prev) => ({ ...prev, ...s }))} />

      {/* Volume analysis card */}
      <VolumeCard shipmentId={id} />

      {/* Header */}
      <div className="gc-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{shipment.name}</h2>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
              <span>Start: <strong className="text-gray-700">{shipment.start_date ? new Date(shipment.start_date + 'T12:00:00').toLocaleDateString() : 'Not set'}</strong></span>
              <span>End: <strong className="text-gray-700">{shipment.end_date ? new Date(shipment.end_date + 'T12:00:00').toLocaleDateString() : 'Active'}</strong></span>
              {shipment.shippedAt && <span>Shipped: <strong className="text-gray-700">{new Date(shipment.shippedAt).toLocaleDateString()}</strong></span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/shipments/${shipment.id}/packing-lists`}
              className="px-4 py-2 rounded-[10px] bg-[#F4F6FA] text-[#1A1D2B] text-[13px] font-semibold hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Packing Lists
            </Link>
            <button
              onClick={async () => {
                setNotifyOpen(true);
                setNotifyResult(null);
                setNotifyLoading(true);
                try {
                  const res = await axios.get(`/api/v1/shipments/${id}/notify/preview`);
                  setNotifyPreview(res.data.data);
                  setNotifyMessage(res.data.data.defaultMessage);
                } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to load preview'); setNotifyOpen(false); }
                finally { setNotifyLoading(false); }
              }}
              className="px-4 py-2 rounded-[10px] bg-[#F4F6FA] text-[#1A1D2B] text-[13px] font-semibold hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Notify Customers
            </button>
            {currentIndex < statusPipeline.length - 1 && (
              <button
                onClick={() => updateStatus(statusPipeline[currentIndex + 1])}
                disabled={updating}
                className="px-4 py-2 bg-[#6366F1] text-white rounded-[10px] text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
              >
                Move to {statusPipeline[currentIndex + 1]}
              </button>
            )}
          </div>
        </div>

        {/* Status Pipeline */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {statusPipeline.map((status, i) => (
            <div key={status} className="flex items-center">
              <div className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap
                ${i <= currentIndex ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {status}
              </div>
              {i < statusPipeline.length - 1 && (
                <div className={`w-8 h-0.5 ${i < currentIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500 mb-1">Capacity</p>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div className={`h-2 rounded-full ${getCapacityColor(shipment.capacityPercent)}`} style={{ width: `${shipment.capacityPercent}%` }} />
          </div>
          <p className="text-sm font-semibold">{fmt(shipment.weightedValue != null ? shipment.weightedValue : shipment.totalValue)} / {fmt(shipment.maxCapacity)}</p>
          <p className="text-xs text-gray-400">{shipment.capacityPercent}%{shipment.weightedValue != null && Math.abs(shipment.totalValue - shipment.weightedValue) > 0.01 ? ` (retail ${fmt(shipment.totalValue)})` : ''}</p>
        </div>
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalValue)}</p>
          <p className="text-xs text-gray-400">{invoices.length} invoices</p>
        </div>
        <div onClick={() => handleTileClick('collected')}
          className={`rounded-xl shadow-sm border p-5 cursor-pointer transition-all ${tileFilter === 'collected' ? 'bg-green-50 border-green-300 ring-2 ring-green-200' : 'bg-white border-gray-100 hover:border-green-200'}`}>
          <p className="text-sm text-gray-500">Collected</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</p>
          <p className="text-xs text-gray-400">{paidCount} paid</p>
        </div>
        <div onClick={() => handleTileClick('pending')}
          className={`rounded-xl shadow-sm border p-5 cursor-pointer transition-all ${tileFilter === 'pending' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200' : 'bg-white border-gray-100 hover:border-amber-200'}`}>
          <p className="text-sm text-gray-500">Pending Payments</p>
          <p className={`text-2xl font-bold ${totalUnpaid > 0 ? 'text-amber-600' : 'text-green-600'}`}>{fmt(totalUnpaid)}</p>
          <p className="text-xs text-gray-400">{unpaidCount} unpaid</p>
        </div>
        <div onClick={() => handleTileClick('expenses')}
          className={`rounded-xl shadow-sm border p-5 cursor-pointer transition-all ${tileFilter === 'expenses' ? 'bg-red-50 border-red-300 ring-2 ring-red-200' : 'bg-white border-gray-100 hover:border-red-200'}`}>
          <p className="text-sm text-gray-500">Expenses</p>
          <p className="text-2xl font-bold text-red-600">{fmt(expenseTotals.total)}</p>
          <p className="text-xs text-gray-400">{expenseTotals.count} entries</p>
        </div>
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500">Net Profit</p>
          <p className={`text-2xl font-bold ${totalValue - expenseTotals.total > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(totalValue - expenseTotals.total)}
          </p>
          <p className="text-xs text-gray-400">{totalValue > 0 ? Math.round(((totalValue - expenseTotals.total) / totalValue) * 100) : 0}% margin</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${activeTab === 'invoices' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Invoices ({invoices.length})
        </button>
        <button onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${activeTab === 'payments' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Payments ({txAggregates?.transactionCount || 0})
        </button>
        <button onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${activeTab === 'expenses' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Expenses ({expenseTotals.count})
        </button>
      </div>

      {/* Edit Expense Modal */}
      {editingExp && (
        <EditExpenseModal
          expense={editingExp}
          categories={expCategories}
          shipments={allShipments}
          onClose={() => setEditingExp(null)}
          onSaved={() => { setEditingExp(null); loadExpenses(); }}
        />
      )}

      {/* Notify Customers Modal */}
      {notifyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 gc-backdrop-in" onClick={() => !notifySending && setNotifyOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto gc-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Notify Customers</h2>
              <p className="text-sm text-gray-500 mt-0.5">Send shipment update emails to all customers in this shipment</p>
            </div>
            <div className="p-6 space-y-4">
              {notifyLoading ? (
                <div className="text-center py-8 text-gray-400">Loading customer list...</div>
              ) : notifyResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-2xl">✉️</span>
                    <div>
                      <p className="font-semibold text-green-800">{notifyResult.sent} email{notifyResult.sent !== 1 ? 's' : ''} sent</p>
                      {notifyResult.skipped > 0 && <p className="text-sm text-gray-500">{notifyResult.skipped} skipped (no email)</p>}
                      {notifyResult.failed > 0 && <p className="text-sm text-red-600">{notifyResult.failed} failed</p>}
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {notifyResult.details.map((d, i) => (
                          <tr key={i}>
                            <td className="py-2 font-medium">#{d.invoiceNumber}</td>
                            <td className="py-2 text-gray-500">{d.email || '—'}</td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                d.status === 'sent' ? 'bg-green-100 text-green-700' :
                                d.status === 'skipped' ? 'bg-gray-100 text-gray-500' :
                                'bg-red-100 text-red-700'}`}>{d.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => setNotifyOpen(false)} className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                    Done
                  </button>
                </div>
              ) : notifyPreview && (
                <>
                  <div className="flex gap-3 text-sm">
                    <div className="flex-1 p-3 bg-blue-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-700">{notifyPreview.withEmail}</p>
                      <p className="text-blue-600 text-xs">Will receive email</p>
                    </div>
                    {notifyPreview.withoutEmail > 0 && (
                      <div className="flex-1 p-3 bg-gray-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-gray-400">{notifyPreview.withoutEmail}</p>
                        <p className="text-gray-400 text-xs">No email on file</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <textarea
                      value={notifyMessage}
                      onChange={(e) => setNotifyMessage(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-primary-500 outline-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">This message will appear in the email body. Each customer gets their invoice number and balance.</p>
                  </div>

                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-500">
                          <th className="px-3 py-2">Invoice</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {notifyPreview.customers.map((c) => (
                          <tr key={c.invoiceNumber} className={!c.hasEmail ? 'opacity-40' : ''}>
                            <td className="px-3 py-2 font-medium">#{c.invoiceNumber}</td>
                            <td className="px-3 py-2">{c.customerName}</td>
                            <td className="px-3 py-2 text-gray-500">{c.email || '—'}</td>
                            <td className={`px-3 py-2 text-right font-medium ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              ${(c.balance).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setNotifyOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
                      Cancel
                    </button>
                    <button
                      disabled={notifySending || notifyPreview.withEmail === 0}
                      onClick={async () => {
                        setNotifySending(true);
                        try {
                          const res = await axios.post(`/api/v1/shipments/${id}/notify`, {
                            message: notifyMessage || undefined,
                          });
                          setNotifyResult(res.data.data);
                        } catch (err) {
                          toast.error(err.response?.data?.error?.message || 'Send failed');
                        } finally { setNotifySending(false); }
                      }}
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                    >
                      {notifySending ? 'Sending...' : `Send to ${notifyPreview.withEmail} customer${notifyPreview.withEmail !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="gc-card p-5">
          {tileFilter === 'pending' && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-amber-700 font-medium">Showing unpaid invoices only</p>
              <button onClick={() => setTileFilter(null)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Show all</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-gray-500">
                  <InvSortHeader field="createdAt">Date</InvSortHeader>
                  <InvSortHeader field="invoiceNumber">Invoice #</InvSortHeader>
                  <InvSortHeader field="customerName">Customer</InvSortHeader>
                  <InvSortHeader field="items">Items</InvSortHeader>
                  <InvSortHeader field="finalTotal">Total</InvSortHeader>
                  <InvSortHeader field="amountPaid">Paid</InvSortHeader>
                  <InvSortHeader field="balance">Balance</InvSortHeader>
                  <InvSortHeader field="paymentStatus">Status</InvSortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...(tileFilter === 'pending' ? invoices.filter((inv) => inv.paymentStatus !== 'paid') : invoices)].sort((a, b) => {
                  let aVal, bVal;
                  switch (invSortBy) {
                    case 'createdAt': aVal = new Date(a.createdAt); bVal = new Date(b.createdAt); break;
                    case 'invoiceNumber': aVal = a.invoiceNumber; bVal = b.invoiceNumber; break;
                    case 'customerName': aVal = (a.Customer?.fullName || a.customerName || '').toLowerCase(); bVal = (b.Customer?.fullName || b.customerName || '').toLowerCase(); break;
                    case 'items': aVal = a.lineItems?.length || 0; bVal = b.lineItems?.length || 0; break;
                    case 'finalTotal': aVal = parseFloat(a.finalTotal) || 0; bVal = parseFloat(b.finalTotal) || 0; break;
                    case 'amountPaid': aVal = parseFloat(a.amountPaid) || 0; bVal = parseFloat(b.amountPaid) || 0; break;
                    case 'balance': aVal = (parseFloat(a.finalTotal)||0) - (parseFloat(a.amountPaid)||0); bVal = (parseFloat(b.finalTotal)||0) - (parseFloat(b.amountPaid)||0); break;
                    case 'paymentStatus': aVal = a.paymentStatus || ''; bVal = b.paymentStatus || ''; break;
                    default: aVal = 0; bVal = 0;
                  }
                  if (aVal < bVal) return invSortOrder === 'ASC' ? -1 : 1;
                  if (aVal > bVal) return invSortOrder === 'ASC' ? 1 : -1;
                  return 0;
                }).map((inv) => {
                  const balance = Math.max(0, (parseFloat(inv.finalTotal) || 0) - (parseFloat(inv.amountPaid) || 0));
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inv.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <Link to={`/pickups/${inv.id}`} state={{ fromShipment: shipment.id, shipmentName: shipment.name }} className="font-medium text-primary-600 hover:text-primary-700">
                          #{inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{inv.Customer?.fullName || inv.customerName}</td>
                      <td className="px-4 py-3">{inv.lineItems?.length || 0}</td>
                      <td className="px-4 py-3 font-medium">{fmt(inv.finalTotal)}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{fmt(inv.amountPaid)}</td>
                      <td className={`px-4 py-3 font-medium ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(balance)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${inv.paymentStatus === 'paid' ? 'bg-green-100 text-green-700'
                            : inv.paymentStatus === 'partial' ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'}`}>
                          {inv.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {invoices.length === 0 && (
              <p className="text-center py-8 text-gray-400">No invoices assigned to this shipment</p>
            )}
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Payment method breakdown */}
          {txAggregates && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="gc-card p-4">
                <p className="text-sm text-gray-500">Total Payments</p>
                <p className="text-xl font-bold text-green-600">{fmt(txAggregates.totalPayments)}</p>
              </div>
              <div className="gc-card p-4">
                <p className="text-sm text-gray-500">Total Refunds</p>
                <p className="text-xl font-bold text-orange-600">{fmt(txAggregates.totalRefunds)}</p>
              </div>
              <div className="gc-card p-4">
                <p className="text-sm text-gray-500">Net Collected</p>
                <p className="text-xl font-bold text-gray-900">{fmt(txAggregates.netCollected)}</p>
              </div>
            </div>
          )}

          {/* Transaction list */}
          <div className="gc-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => {
                    const isVoided = !!tx.voidedAt;
                    const isRefund = tx.transactionType === 'REFUND';
                    return (
                      <tr key={tx.id} className={`hover:bg-gray-50 ${isVoided ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 text-gray-600">{new Date(tx.paymentDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <Link to={`/pickups/${tx.invoice?.id}`} state={{ fromShipment: shipment.id, shipmentName: shipment.name }} className="font-medium text-primary-600">
                            #{tx.invoice?.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{tx.invoice?.customerName}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium
                            ${isVoided ? 'bg-gray-200 text-gray-500 line-through'
                              : isRefund ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {isRefund ? 'Refund' : 'Payment'}{isVoided ? ' (Voided)' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            {tx.paymentMethod === 'Other' && tx.paymentMethodOtherText
                              ? `Other - ${tx.paymentMethodOtherText}` : tx.paymentMethod}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold
                          ${isVoided ? 'text-gray-400 line-through' : isRefund ? 'text-orange-600' : 'text-green-600'}`}>
                          {isRefund ? '-' : '+'}${parseFloat(tx.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{tx.comment}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {transactions.length === 0 && (
                <p className="text-center py-8 text-gray-400">No payments recorded for this shipment</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {/* Treemap */}
          {expenses.length > 0 && (() => {
            const byCat = {};
            expenses.forEach((exp) => {
              const cat = exp.category?.name || 'Uncategorized';
              if (!byCat[cat]) byCat[cat] = { total: 0, count: 0, fixed: exp.is_fixed_cost };
              byCat[cat].total += parseFloat(exp.amount) || 0;
              byCat[cat].count++;
            });
            const sorted = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total);
            const grandTotal = sorted.reduce((s, [, d]) => s + d.total, 0);
            const maxVal = sorted.length > 0 ? sorted[0][1].total : 1;

            const donutColors = ['#2563eb','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488'];

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart */}
                <div className="gc-card p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">Expense Breakdown</h3>
                    {expCatFilter && (
                      <button onClick={() => setExpCatFilter(null)} className="text-sm text-primary-600 font-medium">Clear filter</button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mb-5">Click a bar to filter</p>

                  <div className="flex items-end gap-3" style={{ height: '220px' }}>
                    {sorted.map(([cat, data], i) => {
                      const pct = maxVal > 0 ? (data.total / maxVal) * 100 : 0;
                      const isSelected = expCatFilter === cat;
                      const label = data.total >= 10000 ? `$${(data.total / 1000).toFixed(0)}k`
                        : data.total >= 1000 ? `$${(data.total / 1000).toFixed(1)}k`
                        : `$${data.total.toFixed(0)}`;
                      const barHeight = Math.max(pct, 6);
                      return (
                        <div key={cat} className="flex-1 flex flex-col items-center gap-1 min-w-0"
                          onClick={() => setExpCatFilter(expCatFilter === cat ? null : cat)} style={{ cursor: 'pointer' }}>
                          <div className="w-full flex justify-center" style={{ height: '180px' }}>
                            <div className="relative w-full max-w-[52px]" style={{ height: `${barHeight}%`, alignSelf: 'flex-end' }}>
                              <div
                                className={`w-full h-full rounded-t-md transition-all ${isSelected ? 'ring-2 ring-offset-1 ring-gray-800' : 'hover:brightness-110'}`}
                                style={{ backgroundColor: isSelected ? '#1e3a5f' : '#4a90d9' }}
                              />
                              {barHeight >= 15 ? (
                                <span className="absolute inset-x-0 top-2 text-center text-[10px] font-bold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                                  {label}
                                </span>
                              ) : (
                                <span className="absolute inset-x-0 -top-4 text-center text-[10px] font-bold text-gray-700 whitespace-nowrap">
                                  {label}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[9px] text-gray-500 text-center leading-tight truncate w-full px-0.5" title={cat}>
                            {cat.length > 12 ? cat.substring(0, 10) + '..' : cat}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Donut Chart - Top 5 */}
                <div className="gc-card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Top 5 Expenses</h3>
                  <p className="text-xs text-gray-400 mb-4">Click a segment to filter</p>

                  <div className="flex items-center gap-6">
                    {/* SVG Donut */}
                    <div className="relative" style={{ width: '180px', height: '180px', flexShrink: 0 }}>
                      <svg viewBox="0 0 200 200" className="w-full h-full">
                        {(() => {
                          const top5 = sorted.slice(0, 5);
                          const top5Total = top5.reduce((s, [, d]) => s + d.total, 0);
                          const otherTotal = grandTotal - top5Total;
                          const segments = [...top5.map(([cat, data]) => ({ cat, total: data.total }))];
                          if (otherTotal > 0) segments.push({ cat: 'Other', total: otherTotal });
                          const segTotal = segments.reduce((s, d) => s + d.total, 0);

                          let cumAngle = -90;
                          return segments.map((seg, i) => {
                            const angle = segTotal > 0 ? (seg.total / segTotal) * 360 : 0;
                            const startAngle = cumAngle;
                            cumAngle += angle;
                            const endAngle = cumAngle;

                            const startRad = (startAngle * Math.PI) / 180;
                            const endRad = (endAngle * Math.PI) / 180;
                            const x1 = 100 + 80 * Math.cos(startRad);
                            const y1 = 100 + 80 * Math.sin(startRad);
                            const x2 = 100 + 80 * Math.cos(endRad);
                            const y2 = 100 + 80 * Math.sin(endRad);
                            const largeArc = angle > 180 ? 1 : 0;

                            const isSelected = expCatFilter === seg.cat;
                            const color = donutColors[i % donutColors.length];

                            if (angle <= 0) return null;
                            if (angle >= 359.9) {
                              return (
                                <circle key={seg.cat} cx="100" cy="100" r="80" fill="none"
                                  stroke={color} strokeWidth={isSelected ? 40 : 35}
                                  opacity={expCatFilter && !isSelected ? 0.3 : 1}
                                  onClick={() => setExpCatFilter(expCatFilter === seg.cat ? null : seg.cat)}
                                  className="cursor-pointer transition-all" />
                              );
                            }

                            return (
                              <path key={seg.cat}
                                d={`M ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2}`}
                                fill="none" stroke={color} strokeWidth={isSelected ? 40 : 35}
                                opacity={expCatFilter && !isSelected ? 0.3 : 1}
                                onClick={() => setExpCatFilter(expCatFilter === seg.cat ? null : seg.cat)}
                                className="cursor-pointer transition-all hover:opacity-90"
                                strokeLinecap="butt" />
                            );
                          });
                        })()}
                        {/* Center text */}
                        <text x="100" y="95" textAnchor="middle" className="text-[14px] font-bold fill-gray-800">
                          {fmt(grandTotal)}
                        </text>
                        <text x="100" y="112" textAnchor="middle" className="text-[10px] fill-gray-400">
                          Total
                        </text>
                      </svg>
                    </div>

                    {/* Legend */}
                    <div className="flex-1 space-y-2">
                      {sorted.slice(0, 5).map(([cat, data], i) => {
                        const pct = grandTotal > 0 ? (data.total / grandTotal) * 100 : 0;
                        const isSelected = expCatFilter === cat;
                        return (
                          <div key={cat} onClick={() => setExpCatFilter(expCatFilter === cat ? null : cat)}
                            className={`flex items-center gap-2 cursor-pointer rounded-md px-2 py-1 transition-colors ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: donutColors[i % donutColors.length] }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">{cat}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-gray-800">{fmt(data.total)}</p>
                              <p className="text-[9px] text-gray-400">{pct.toFixed(1)}%</p>
                            </div>
                          </div>
                        );
                      })}
                      {sorted.length > 5 && (() => {
                        const otherTotal = sorted.slice(5).reduce((s, [, d]) => s + d.total, 0);
                        const otherPct = grandTotal > 0 ? (otherTotal / grandTotal) * 100 : 0;
                        return (
                          <div className="flex items-center gap-2 px-2 py-1">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: donutColors[5] }} />
                            <p className="text-xs text-gray-500 flex-1">Other ({sorted.length - 5})</p>
                            <div className="text-right">
                              <p className="text-xs font-bold text-gray-600">{fmt(otherTotal)}</p>
                              <p className="text-[9px] text-gray-400">{otherPct.toFixed(1)}%</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Expense list */}
          <div className="gc-card overflow-hidden">
            {expCatFilter && (
              <div className="flex items-center justify-between px-4 py-2 bg-primary-50 border-b border-primary-100">
                <p className="text-sm text-primary-700 font-medium">Filtered: {expCatFilter}</p>
                <button onClick={() => setExpCatFilter(null)} className="text-xs text-primary-600 font-medium">Show all</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">ID</th>
                    <ExpSortHeader field="expense_date">Date</ExpSortHeader>
                    <ExpSortHeader field="category">Category</ExpSortHeader>
                    <ExpSortHeader field="description">Description</ExpSortHeader>
                    <ExpSortHeader field="vendor">Vendor</ExpSortHeader>
                    <ExpSortHeader field="type">Type</ExpSortHeader>
                    <ExpSortHeader field="amount" className="text-right">Amount</ExpSortHeader>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...(expCatFilter ? expenses.filter((e) => (e.category?.name || 'Uncategorized') === expCatFilter) : expenses)].sort((a, b) => {
                    let aVal, bVal;
                    switch (expSortBy) {
                      case 'expense_date': aVal = a.expense_date; bVal = b.expense_date; break;
                      case 'category': aVal = (a.category?.name || '').toLowerCase(); bVal = (b.category?.name || '').toLowerCase(); break;
                      case 'description': aVal = (a.description || '').toLowerCase(); bVal = (b.description || '').toLowerCase(); break;
                      case 'vendor': aVal = (a.vendor_or_payee || '').toLowerCase(); bVal = (b.vendor_or_payee || '').toLowerCase(); break;
                      case 'type': aVal = a.is_fixed_cost ? 1 : 0; bVal = b.is_fixed_cost ? 1 : 0; break;
                      case 'amount': aVal = parseFloat(a.amount) || 0; bVal = parseFloat(b.amount) || 0; break;
                      default: aVal = 0; bVal = 0;
                    }
                    if (aVal < bVal) return expSortOrder === 'ASC' ? -1 : 1;
                    if (aVal > bVal) return expSortOrder === 'ASC' ? 1 : -1;
                    return 0;
                  }).map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-mono text-gray-400">{exp.expense_number || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{new Date(exp.expense_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">{exp.category?.name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{exp.description}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.vendor_or_payee || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${exp.is_fixed_cost ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                          {exp.is_fixed_cost ? 'Fixed' : 'Variable'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(exp.amount)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setEditingExp(exp)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenses.length === 0 && (
                <p className="text-center py-8 text-gray-400">No expenses assigned to this shipment</p>
              )}
            </div>

            {expenses.length > 0 && (() => {
              const filtered = expCatFilter ? expenses.filter((e) => (e.category?.name || 'Uncategorized') === expCatFilter) : expenses;
              const filteredTotal = filtered.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
              return (
              <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">{expCatFilter ? `${expCatFilter} (${filtered.length})` : `Total Expenses (${expenseTotals.count})`}</span>
                <span className="text-lg font-bold text-red-600">{fmt(expCatFilter ? filteredTotal : expenseTotals.total)}</span>
              </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Tracking card with container # input + event timeline      */
/* ─────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────── */
/*  Volume analysis card                                       */
/* ─────────────────────────────────────────────────────────── */

function VolumeCard({ shipmentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [container, setContainer] = useState('40hc');
  const [efficiency, setEfficiency] = useState(0.75);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(null);

  const loadVolume = async (ct, eff) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/shipments/${shipmentId}/volume?container=${ct || container}&efficiency=${eff || efficiency}`);
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load volume analysis');
    } finally { setLoading(false); }
  };

  const getBarColor = (pct) => {
    if (pct >= 90) return '#EF4444';
    if (pct >= 70) return '#F59E0B';
    return '#6366F1';
  };

  const fmt = (n) => n?.toLocaleString('en-US') || '0';

  return (
    <div className="gc-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3 className="text-[15px] font-bold text-[#1A1D2B]">Container Volume</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={container}
            onChange={(e) => { setContainer(e.target.value); if (data) loadVolume(e.target.value); }}
            className="h-8 px-2 rounded-lg border border-black/[0.06] bg-white text-[12px]"
          >
            <option value="20ft">20' Standard</option>
            <option value="40ft">40' Standard</option>
            <option value="40hc">40' High Cube</option>
          </select>
          <select
            value={efficiency}
            onChange={(e) => { const v = parseFloat(e.target.value); setEfficiency(v); if (data) loadVolume(null, v); }}
            className="h-8 px-2 rounded-lg border border-black/[0.06] bg-white text-[12px]"
            title="Packing efficiency — accounts for dead space from irregular items"
          >
            <option value="0.90">90% tight pack</option>
            <option value="0.80">80% good pack</option>
            <option value="0.75">75% mixed cargo</option>
            <option value="0.70">70% irregular</option>
            <option value="0.65">65% bulky items</option>
          </select>
          <button
            onClick={() => loadVolume()}
            disabled={loading}
            className="h-8 px-3 rounded-lg bg-[#6366F1] text-white text-[12px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : data ? 'Refresh' : 'Calculate Volume'}
          </button>
        </div>
      </div>

      {error && <p className="text-[12px] text-[#EF4444] mb-3">{error}</p>}

      {!data && !loading && (
        <div className="px-4 py-8 rounded-[10px] bg-[#F4F6FA] text-center">
          <p className="text-[13px] text-[#6B7194]">Click "Calculate Volume" to analyze container space usage.</p>
          <p className="text-[11px] text-[#9CA3C0] mt-1">Uses item dimensions, description parsing, catalog defaults, and AI estimation.</p>
        </div>
      )}

      {loading && !data && (
        <div className="px-4 py-8 rounded-[10px] bg-[#F4F6FA] text-center">
          <p className="text-[13px] text-[#6B7194]">Analyzing volumes — estimating unknown dimensions with AI...</p>
        </div>
      )}

      {data && (
        <div>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-[#1A1D2B]">
                {data.summary.totalCuFt} / {data.usableCuFt} cu.ft.
                <span className="text-[10.5px] font-normal text-[#9CA3C0] ml-1">
                  ({data.containerCuFt} × {Math.round(data.packingEfficiency * 100)}% packing)
                </span>
              </span>
              <span className="text-[13px] font-bold" style={{ color: getBarColor(data.summary.usedPct) }}>
                {data.summary.usedPct}%
              </span>
            </div>
            <div className="w-full h-4 bg-[#F4F6FA] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(data.summary.usedPct, 100)}%`,
                  background: getBarColor(data.summary.usedPct),
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10.5px] text-[#9CA3C0]">{data.containerLabel}</span>
              <span className="text-[10.5px] text-[#9CA3C0]">{data.summary.totalQty} items</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#F4F6FA] rounded-lg p-3 text-center">
              <p className="text-[18px] font-bold text-[#1A1D2B]">{data.summary.remainingCuFt}</p>
              <p className="text-[10.5px] text-[#6B7194]">cu.ft. remaining</p>
            </div>
            <div className="bg-[#F4F6FA] rounded-lg p-3 text-center">
              <p className="text-[18px] font-bold text-[#10B981]">${fmt(data.summary.remainingRevenue)}</p>
              <p className="text-[10.5px] text-[#6B7194]">revenue capacity</p>
            </div>
            <div className="bg-[#F4F6FA] rounded-lg p-3 text-center">
              <p className="text-[18px] font-bold text-[#1A1D2B]">{data.summary.unmeasuredQty}</p>
              <p className="text-[10.5px] text-[#6B7194]">unmeasured items</p>
            </div>
          </div>

          {/* Source breakdown */}
          <div className="flex flex-wrap gap-3 mb-3">
            {data.breakdown.measured.qty > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#6366F1]" />
                Measured: {data.breakdown.measured.cuFt} cu.ft. ({data.breakdown.measured.qty} items)
              </span>
            )}
            {data.breakdown.parsed.qty > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0EA5E9]" />
                Parsed: {data.breakdown.parsed.cuFt} cu.ft. ({data.breakdown.parsed.qty} items)
              </span>
            )}
            {data.breakdown.catalog.qty > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" />
                Catalog: {data.breakdown.catalog.cuFt} cu.ft. ({data.breakdown.catalog.qty} items)
              </span>
            )}
            {data.breakdown.llm.qty > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" />
                AI Estimated: {data.breakdown.llm.cuFt} cu.ft. ({data.breakdown.llm.qty} items)
              </span>
            )}
          </div>

          {/* Expandable detail */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <svg
              className={`w-4 h-4 text-[#6B7194] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[12.5px] font-semibold text-[#1A1D2B] group-hover:text-[#6366F1] transition-colors">
              Item Details
            </span>
          </button>

          {expanded && (
            <div className="mt-3 max-h-64 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-[#F4F6FA] sticky top-0">
                  <tr className="text-left text-[#6B7194]">
                    <th className="px-2 py-1.5 font-medium">Inv</th>
                    <th className="px-2 py-1.5 font-medium">Item</th>
                    <th className="px-2 py-1.5 font-medium text-center">Qty</th>
                    <th className="px-2 py-1.5 font-medium">Dims</th>
                    <th className="px-2 py-1.5 font-medium text-right">Volume</th>
                    <th className="px-2 py-1.5 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F6FA]">
                  {data.items.map((it, i) => {
                    const sourceColors = {
                      measured: 'bg-[#6366F1] text-white',
                      parsed: 'bg-[#0EA5E9] text-white',
                      catalog: 'bg-[#10B981] text-white',
                      llm: 'bg-[#F59E0B] text-white',
                      'llm-cached': 'bg-[#F59E0B] text-white',
                      unmeasured: 'bg-[#EF4444] text-white',
                    };
                    return (
                      <tr key={i} className={it.source === 'unmeasured' ? 'bg-red-50/50' : ''}>
                        <td className="px-2 py-1.5 text-[#6B7194]">#{it.invoiceNumber}</td>
                        <td className="px-2 py-1.5 text-[#1A1D2B] max-w-[180px] truncate" title={it.name}>{it.name}</td>
                        <td className="px-2 py-1.5 text-center">{it.quantity}</td>
                        <td className="px-2 py-1.5 text-[#6B7194] font-mono">
                          {it.dims ? `${it.dims.l}×${it.dims.w}×${it.dims.h}` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {it.volumeCuIn > 0 ? `${fmt(Math.round(it.volumeCuIn / 1728 * 10) / 10)} ft³` : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sourceColors[it.source] || 'bg-gray-200 text-gray-600'}`}>
                            {it.source === 'llm-cached' ? 'AI' : it.source}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrackingCard({ shipment, onUpdated }) {
  const [trackingInput, setTrackingInput] = useState(shipment.trackingNumber || '');
  const [carrierInput, setCarrierInput] = useState(shipment.carrier || 'MSC');
  const [numberType, setNumberType] = useState('booking');
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState(null);
  const [editingTracking, setEditingTracking] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    if (shipment.trackingNumber) loadEvents();
  }, [shipment.id, shipment.trackingNumber]);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await axios.get(`/api/v1/shipments/${shipment.id}/events`);
      setEvents(res.data.data.events || []);
    } catch {} finally {
      setLoadingEvents(false);
    }
  };

  const saveTracking = async () => {
    if (!trackingInput.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(`/api/v1/shipments/${shipment.id}/track`, {
        tracking_number: trackingInput.trim(),
        carrier: carrierInput,
        number_type: numberType,
      });
      onUpdated({
        trackingNumber: trackingInput.trim(),
        carrier: carrierInput,
        terminal49TrackerId: res.data.data.trackerId,
      });

      // Immediately sync tracking data from Shipsgo
      try {
        const syncRes = await axios.post(`/api/v1/shipments/${shipment.id}/sync-tracking`);
        if (syncRes.data.data?.updates?.length > 0) {
          const freshRes = await axios.get(`/api/v1/shipments/${shipment.id}`);
          onUpdated(freshRes.data.data);
        }
      } catch {}
      loadEvents();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasTracking = Boolean(shipment.trackingNumber);

  // ETA countdown
  let etaLabel = null;
  if (shipment.eta) {
    const days = Math.ceil((new Date(shipment.eta) - new Date()) / 86400000);
    if (days > 0) etaLabel = `${days} day${days === 1 ? '' : 's'} away`;
    else if (days === 0) etaLabel = 'Arriving today';
    else etaLabel = `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  }

  const eventIcon = (type) => {
    if (type.includes('departed') || type.includes('loaded')) return '🚢';
    if (type.includes('arrived') || type.includes('discharged')) return '⚓';
    if (type.includes('transit')) return '🌊';
    if (type.includes('customs') || type.includes('gate')) return '📦';
    if (type.includes('delivered') || type.includes('out')) return '✅';
    return '📍';
  };

  // Carriers (Shipsgo) keep stale future-dated ETA rows in their event stream
  // even after the actual events land. Hide an estimated event if a confirmed
  // event with the same (eventType, location) pair already exists.
  const now = Date.now();
  const confirmedKeys = new Set(
    events
      .filter((e) => new Date(e.eventDate).getTime() <= now)
      .map((e) => `${e.eventType}|${(e.location || '').toLowerCase()}`)
  );
  const visibleEvents = events.filter((e) => {
    const isFuture = new Date(e.eventDate).getTime() > now;
    if (!isFuture) return true;
    return !confirmedKeys.has(`${e.eventType}|${(e.location || '').toLowerCase()}`);
  });

  return (
    <div className="gc-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <h3 className="text-[15px] font-bold text-[#1A1D2B]">Container Tracking</h3>
        </div>
        {hasTracking && (
          <span className="px-2.5 py-1 rounded-md bg-[rgba(16,185,129,0.08)] text-[#10B981] text-[11px] font-semibold">
            Active
          </span>
        )}
      </div>

      {!hasTracking ? (
        <div>
          <p className="text-[13px] text-[#6B7194] mb-3">
            Enter a container or booking number to start tracking this shipment.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={numberType}
              onChange={(e) => setNumberType(e.target.value)}
              className="h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px]"
            >
              <option value="booking">Booking #</option>
              <option value="container">Container #</option>
            </select>
            <input
              type="text"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              placeholder={numberType === 'container' ? 'e.g. MSCU1234567' : 'e.g. 123456789'}
              className="h-10 flex-1 min-w-[180px] px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] outline-none"
            />
            <select
              value={carrierInput}
              onChange={(e) => setCarrierInput(e.target.value)}
              className="h-10 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px]"
            >
              <option value="MSC">MSC</option>
              <option value="MAERSK">Maersk</option>
              <option value="CMA CGM">CMA CGM</option>
              <option value="HAPAG-LLOYD">Hapag-Lloyd</option>
              <option value="COSCO">COSCO</option>
              <option value="EVERGREEN">Evergreen</option>
              <option value="ONE">ONE</option>
              <option value="ZIM">ZIM</option>
            </select>
            <button
              onClick={saveTracking}
              disabled={saving || !trackingInput.trim()}
              className="h-10 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
            >
              {saving ? 'Activating...' : 'Start Tracking'}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-[#EF4444]">{error}</p>}
        </div>
      ) : editingTracking ? (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Container #</label>
              <input type="text" value={editForm.trackingNumber || ''} onChange={(e) => setEditForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                className="gc-input" />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Carrier</label>
              <select value={editForm.carrier || 'MSC'} onChange={(e) => setEditForm((f) => ({ ...f, carrier: e.target.value }))}
                className="gc-input">
                <option value="MSC">MSC</option><option value="MAERSK">Maersk</option><option value="CMA CGM">CMA CGM</option>
                <option value="HAPAG-LLOYD">Hapag-Lloyd</option><option value="COSCO">COSCO</option><option value="EVERGREEN">Evergreen</option>
                <option value="ONE">ONE</option><option value="ZIM">ZIM</option>
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Vessel</label>
              <input type="text" value={editForm.vesselName || ''} onChange={(e) => setEditForm((f) => ({ ...f, vesselName: e.target.value }))}
                placeholder="Vessel name" className="gc-input" />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Voyage #</label>
              <input type="text" value={editForm.voyageNumber || ''} onChange={(e) => setEditForm((f) => ({ ...f, voyageNumber: e.target.value }))}
                placeholder="Voyage number" className="gc-input" />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Departure Date</label>
              <input type="date" value={editForm.departureDate || ''} onChange={(e) => setEditForm((f) => ({ ...f, departureDate: e.target.value }))}
                className="gc-input" />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">ETA</label>
              <input type="date" value={editForm.eta || ''} onChange={(e) => setEditForm((f) => ({ ...f, eta: e.target.value }))}
                className="gc-input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await axios.put(`/api/v1/shipments/${shipment.id}`, editForm);
                onUpdated(editForm);

                // Re-create tracker if tracking number changed, then sync fresh data
                if (editForm.trackingNumber && editForm.trackingNumber !== shipment.trackingNumber) {
                  try {
                    await axios.post(`/api/v1/shipments/${shipment.id}/track`, {
                      tracking_number: editForm.trackingNumber,
                      carrier: editForm.carrier || 'MSCU',
                    });
                  } catch {}
                }

                // Always fetch fresh tracking data after any edit
                if (editForm.trackingNumber) {
                  try {
                    const syncRes = await axios.post(`/api/v1/shipments/${shipment.id}/sync-tracking`);
                    if (syncRes.data.data?.updates?.length > 0) {
                      // Reload shipment to get updated vessel/eta/status
                      const freshRes = await axios.get(`/api/v1/shipments/${shipment.id}`);
                      onUpdated(freshRes.data.data);
                    }
                  } catch {}
                  loadEvents();
                }

                setEditingTracking(false);
              } catch (err) { setError(err.response?.data?.error?.message || 'Save failed'); }
              finally { setSaving(false); }
            }}
              className="h-9 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50">
              {saving ? 'Saving...' : 'Save & Sync'}
            </button>
            <button type="button" onClick={() => setEditingTracking(false)}
              className="h-9 px-4 rounded-[10px] text-[#6B7194] text-[13px] font-medium hover:bg-[#F4F6FA]">
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-[#EF4444]">{error}</p>}
        </div>
      ) : (
        <div>
          {/* Tracking summary */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div>
              <p className="text-[10px] font-semibold text-[#9CA3C0] uppercase tracking-wide">Container</p>
              <p className="text-[15px] font-bold text-[#1A1D2B] tracking-wide">{shipment.trackingNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#9CA3C0] uppercase tracking-wide">Carrier</p>
              <p className="text-[13px] font-semibold text-[#1A1D2B]">{shipment.carrier || 'MSC'}</p>
            </div>
            {shipment.vesselName && (
              <div>
                <p className="text-[10px] font-semibold text-[#9CA3C0] uppercase tracking-wide">Vessel</p>
                <p className="text-[13px] font-semibold text-[#1A1D2B]">{shipment.vesselName}{shipment.voyageNumber ? ` · ${shipment.voyageNumber}` : ''}</p>
              </div>
            )}
            {shipment.eta && (
              <div className="ml-auto text-right">
                <p className="text-[10px] font-semibold text-[#9CA3C0] uppercase tracking-wide">ETA</p>
                <p className="text-[15px] font-bold text-[#6366F1]">
                  {new Date(shipment.eta + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {etaLabel && <p className="text-[11px] text-[#6B7194]">{etaLabel}</p>}
              </div>
            )}
            <button type="button" onClick={() => {
              setEditForm({
                trackingNumber: shipment.trackingNumber || '',
                carrier: shipment.carrier || 'MSC',
                vesselName: shipment.vesselName || '',
                voyageNumber: shipment.voyageNumber || '',
                departureDate: shipment.departureDate || '',
                eta: shipment.eta || '',
              });
              setEditingTracking(true);
            }}
              className="text-[11px] font-semibold text-[#6366F1] hover:text-[#4F46E5]">
              Edit
            </button>
          </div>

          {/* Event timeline with collapsible caret */}
          {loadingEvents ? (
            <p className="text-[13px] text-[#9CA3C0]">Loading events...</p>
          ) : events.length === 0 ? (
            <div className="px-4 py-6 rounded-[10px] bg-[#F4F6FA] text-center">
              <p className="text-[13px] text-[#6B7194]">No tracking events yet.</p>
              <p className="text-[11px] text-[#9CA3C0] mt-1">Events will appear automatically as Shipsgo receives updates from {shipment.carrier || 'the carrier'}.</p>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setTimelineOpen((o) => !o)}
                className="flex items-center gap-2 w-full text-left mb-3 group"
              >
                <svg
                  className={`w-4 h-4 text-[#6B7194] transition-transform duration-200 ${timelineOpen ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-[12.5px] font-semibold text-[#1A1D2B] group-hover:text-[#6366F1] transition-colors">
                  Tracking Events
                </span>
                <span className="text-[10.5px] font-medium text-[#9CA3C0]">
                  ({visibleEvents.filter(e => new Date(e.eventDate) <= new Date()).length} confirmed, {visibleEvents.filter(e => new Date(e.eventDate) > new Date()).length} estimated)
                </span>
              </button>
              {timelineOpen && (
                <div className="relative pl-6 border-l-2 border-[#EEF0F6] space-y-4">
                  {visibleEvents.map((ev) => {
                    const isFuture = new Date(ev.eventDate) > new Date();
                    return (
                      <div key={ev.id} className={`relative ${isFuture ? 'opacity-40' : ''}`}>
                        <div className={`absolute -left-[25px] w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center text-[8px] ${isFuture ? 'border-[#C7CDDB]' : 'border-[#6366F1]'}`}>
                          {eventIcon(ev.eventType)}
                        </div>
                        <div className="pl-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isFuture && (
                              <span className="px-1.5 py-0.5 rounded bg-[#F4F6FA] text-[9px] font-bold text-[#9CA3C0] uppercase tracking-wide">
                                Estimated
                              </span>
                            )}
                            <span className={`text-[12.5px] font-semibold ${isFuture ? 'text-[#9CA3C0]' : 'text-[#1A1D2B]'}`}>
                              {ev.description || ev.eventType.replace(/\./g, ' → ')}
                            </span>
                            <span className="text-[10.5px] text-[#9CA3C0]">
                              {isFuture ? 'ETA ' : ''}{new Date(ev.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          {ev.location && <p className={`text-[11.5px] mt-0.5 ${isFuture ? 'text-[#C7CDDB]' : 'text-[#6B7194]'}`}>📍 {ev.location}</p>}
                          {ev.vessel && <p className={`text-[11px] ${isFuture ? 'text-[#C7CDDB]' : 'text-[#9CA3C0]'}`}>🚢 {ev.vessel}{ev.voyage ? ` · ${ev.voyage}` : ''}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
