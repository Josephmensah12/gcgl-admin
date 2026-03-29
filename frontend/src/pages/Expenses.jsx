import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

function ExpenseModal({ expense, categories, shipments, onClose, onSaved }) {
  const isEdit = !!expense;
  const [form, setForm] = useState({
    expense_date: expense?.expense_date || new Date().toISOString().split('T')[0],
    category_id: expense?.category_id || '',
    description: expense?.description || '',
    vendor_or_payee: expense?.vendor_or_payee || '',
    amount: expense?.amount || '',
    shipment_id: expense?.shipment_id || '',
    notes: expense?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category_id || !form.description || !form.amount) { setError('Date, category, description, and amount are required'); return; }
    setLoading(true);
    setError(null);
    try {
      if (isEdit) {
        await axios.put(`/api/v1/expenses/${expense.id}`, form);
      } else {
        await axios.post('/api/v1/expenses', form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Expense' : 'Add Expense'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($) *</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" required>
              <option value="">Select category...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What was this expense for?" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor / Payee</label>
            <input type="text" value={form.vendor_or_payee} onChange={(e) => setForm((f) => ({ ...f, vendor_or_payee: e.target.value }))}
              placeholder="Who was paid?" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipment</label>
            <select value={form.shipment_id} onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
              <option value="">-- Not tied to a shipment --</option>
              {shipments.map((s) => <option key={s.id} value={s.id}>{s.name} [{s.status}]</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" rows={2} placeholder="Additional details..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [totals, setTotals] = useState({ total: 0, count: 0 });
  const [filters, setFilters] = useState({ search: '', category_id: '', shipment_id: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | expense object
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'analytics' | 'categories'
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');

  const loadExpenses = useCallback(async () => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, sortBy: 'expense_date', sortOrder: 'DESC', ...filters };
      const res = await axios.get('/api/v1/expenses', { params });
      setExpenses(res.data.data.expenses);
      setTotals(res.data.data.totals);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const loadCategories = () => axios.get('/api/v1/expenses/categories').then((res) => setCategories(res.data.data)).catch(() => {});

  useEffect(() => {
    loadCategories();
    axios.get('/api/v1/shipments/active').then((res) => setShipments(res.data.data)).catch(() => {});
    axios.get('/api/v1/expenses/analytics').then((res) => setAnalytics(res.data.data)).catch(() => {});
  }, []);

  const handleSaved = () => { setModal(null); loadExpenses(); axios.get('/api/v1/expenses/analytics').then((r) => setAnalytics(r.data.data)).catch(() => {}); };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await axios.post('/api/v1/expenses/categories', { name: newCatName.trim() });
      setNewCatName('');
      loadCategories();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create category');
    }
  };

  const handleUpdateCategory = async (id) => {
    if (!editCatName.trim()) return;
    try {
      await axios.put(`/api/v1/expenses/categories/${id}`, { name: editCatName.trim() });
      setEditingCat(null);
      setEditCatName('');
      loadCategories();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Deactivate this category?')) return;
    try {
      await axios.delete(`/api/v1/expenses/categories/${id}`);
      loadCategories();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete category');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try { await axios.delete(`/api/v1/expenses/${id}`); loadExpenses(); } catch (err) { alert('Delete failed'); }
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner text="Loading expenses..." />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">{fmt(analytics?.summary?.total)}</p>
          <p className="text-xs text-gray-400">{analytics?.summary?.count || 0} entries</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Average</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(analytics?.summary?.avg)}</p>
          <p className="text-xs text-gray-400">per expense</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Largest</p>
          <p className="text-2xl font-bold text-amber-600">{fmt(analytics?.summary?.max)}</p>
          <p className="text-xs text-gray-400">single expense</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Filtered Total</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.total)}</p>
          <p className="text-xs text-gray-400">{totals.count} shown</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            Expenses
          </button>
          <button onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'analytics' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            Analytics
          </button>
          <button onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'categories' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            Categories ({categories.length})
          </button>
        </div>
        <button onClick={() => setModal('new')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          + Add Expense
        </button>
      </div>

      {/* Modal */}
      {modal && (
        <ExpenseModal
          expense={modal === 'new' ? null : modal}
          categories={categories}
          shipments={shipments}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input type="text" value={filters.search}
                onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
                placeholder="Search description or vendor..."
                className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm" />
              <select value={filters.category_id}
                onChange={(e) => { setFilters((f) => ({ ...f, category_id: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All Categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={filters.shipment_id}
                onChange={(e) => { setFilters((f) => ({ ...f, shipment_id: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All Shipments</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Shipment</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{new Date(exp.expense_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">{exp.category?.name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{exp.description}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.vendor_or_payee || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{exp.shipment?.name || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(exp.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setModal(exp)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
                          <button onClick={() => handleDelete(exp.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenses.length === 0 && <p className="text-center py-12 text-gray-400">No expenses found</p>}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</p>
                <div className="flex gap-1">
                  <button disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Prev</button>
                  <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-6">
          {/* Monthly Trend */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Monthly Expense Trend</h3>
            <div className="flex items-end gap-2 h-40">
              {analytics.monthlyTrend.map((m, i) => {
                const maxVal = Math.max(...analytics.monthlyTrend.map((d) => d.total), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 font-medium">
                      {m.total >= 1000 ? `$${(m.total / 1000).toFixed(1)}k` : `$${m.total.toFixed(0)}`}
                    </span>
                    <div className="w-full bg-red-400 rounded-t-md min-h-[4px] transition-all" style={{ height: `${(m.total / maxVal) * 120}px` }} />
                    <span className="text-xs text-gray-400">{m.month.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Category */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">By Category</h3>
              <div className="space-y-3">
                {analytics.byCategory.map((c) => {
                  const pct = analytics.summary.total > 0 ? (c.total / analytics.summary.total * 100) : 0;
                  return (
                    <div key={c.category_id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{c.category?.name || 'Unknown'}</span>
                        <span className="font-semibold">{fmt(c.total)} ({c.count})</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {analytics.byCategory.length === 0 && <p className="text-sm text-gray-400">No data</p>}
              </div>
            </div>

            {/* By Shipment */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">By Shipment</h3>
              <div className="space-y-3">
                {analytics.byShipment.map((s) => (
                  <div key={s.shipment_id || 'none'} className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-700">{s.shipment?.name || 'Unassigned'}</span>
                    <span className="font-semibold text-sm text-red-600">{fmt(s.total)} ({s.count})</span>
                  </div>
                ))}
                {analytics.byShipment.length === 0 && <p className="text-sm text-gray-400">No data</p>}
              </div>
            </div>

            {/* Top Vendors */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Top Vendors</h3>
              <div className="space-y-2">
                {analytics.topVendors.map((v, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-700">{v.vendor_or_payee}</span>
                    <span className="font-semibold text-sm">{fmt(v.total)} ({v.count})</span>
                  </div>
                ))}
                {analytics.topVendors.length === 0 && <p className="text-sm text-gray-400">No vendor data</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Add new category */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Add New Category</h3>
            <div className="flex gap-3">
              <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Enter category name..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); }}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              <button onClick={handleCreateCategory} disabled={!newCatName.trim()}
                className="px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          {/* Category list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Expense Categories ({categories.length})</h3>
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                  {editingCat === cat.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="text" value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(cat.id); if (e.key === 'Escape') setEditingCat(null); }}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm" autoFocus />
                      <button onClick={() => handleUpdateCategory(cat.id)} className="text-xs text-green-600 font-medium">Save</button>
                      <button onClick={() => setEditingCat(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-purple-400" />
                        <span className="font-medium text-gray-900 text-sm">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={async () => {
                          try { await axios.post(`/api/v1/fixed-costs/categories/${cat.id}/toggle-fixed`); loadCategories(); }
                          catch (e) { alert('Failed'); }
                        }}
                          className={`text-xs font-medium px-2 py-0.5 rounded ${cat.is_fixed_cost ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                          {cat.is_fixed_cost ? 'Fixed' : 'Variable'}
                        </button>
                        <button onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); }}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium">Rename</button>
                        <button onClick={() => handleDeleteCategory(cat.id)}
                          className="text-xs text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-center py-6 text-gray-400 text-sm">No categories yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
