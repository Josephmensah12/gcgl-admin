import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { SkeletonPage } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import SearchInput from '../components/SearchInput';
import { ReceiptArt } from '../components/illustrations/LogisticsArt';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';
import toast from 'react-hot-toast';
import { exportCSV } from '../utils/csvExport';

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
    is_fixed_cost: expense?.is_fixed_cost || false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category_id || !form.description || !form.amount) { setError('Date, category, description, and amount are required'); return; }
    setLoading(true);
    setError(null);
    const isFixed = categories.find((c) => String(c.id) === String(form.category_id))?.is_fixed_cost || false;
    const payload = { ...form, is_fixed_cost: isFixed };
    try {
      if (isEdit) {
        await axios.put(`/api/v1/expenses/${expense.id}`, payload);
      } else {
        await axios.post('/api/v1/expenses', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 gc-backdrop-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto gc-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Expense' : 'Add Expense'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Date *</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
                className="gc-input" required />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Amount ($) *</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="gc-input" required />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Category *</label>
            <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="gc-input" required>
              <option value="">Select category...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Description *</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What was this expense for?" className="gc-input" required />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Vendor / Payee</label>
            <input type="text" value={form.vendor_or_payee} onChange={(e) => setForm((f) => ({ ...f, vendor_or_payee: e.target.value }))}
              placeholder="Who was paid?" className="gc-input" />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Shipment</label>
            <select value={form.shipment_id} onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value }))}
              className="gc-input">
              <option value="">-- Auto-assign by date --</option>
              {shipments.map((s) => <option key={s.id} value={s.id} title={shipmentDateRange(s)}>{s.name} ({shipmentDateRange(s)})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#6B7194] mb-1.5 uppercase tracking-[0.04em]">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="gc-input h-auto py-2" rows={2} placeholder="Additional details..." />
          </div>

          {form.category_id && (
            <p className="text-xs text-gray-500">
              Cost type: <span className={`font-medium ${categories.find((c) => String(c.id) === String(form.category_id))?.is_fixed_cost ? 'text-purple-700' : 'text-gray-700'}`}>
                {categories.find((c) => String(c.id) === String(form.category_id))?.is_fixed_cost ? 'Fixed (set by category)' : 'Variable (set by category)'}
              </span>
            </p>
          )}

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
  const { onMenuClick } = useLayout();
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
  const [sortBy, setSortBy] = useState('expense_date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [selectedShipmentFilter, setSelectedShipmentFilter] = useState(null); // for line graph -> category filter
  const [filteredCategoryData, setFilteredCategoryData] = useState(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatFixed, setNewCatFixed] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatFixed, setEditCatFixed] = useState(false);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => o === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder(field === 'amount' ? 'DESC' : 'ASC');
    }
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const SortHeader = ({ field, children, className = '' }) => (
    <th className={`px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none ${className}`} onClick={() => toggleSort(field)}>
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {children}
        {sortBy === field ? (
          <span className="text-primary-600">{sortOrder === 'ASC' ? '\u2191' : '\u2193'}</span>
        ) : (
          <span className="text-gray-300">\u2195</span>
        )}
      </div>
    </th>
  );

  const loadExpenses = useCallback(async () => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, sortBy, sortOrder, ...filters };
      const res = await axios.get('/api/v1/expenses', { params });
      setExpenses(res.data.data.expenses);
      setTotals(res.data.data.totals);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [pagination.page, pagination.limit, filters, sortBy, sortOrder]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const loadCategories = () => axios.get('/api/v1/expenses/categories').then((res) => setCategories(res.data.data)).catch(() => {});

  useEffect(() => {
    loadCategories();
    axios.get('/api/v1/shipments/active').then((res) => setShipments(res.data.data)).catch(() => {});
    axios.get('/api/v1/expenses/analytics').then((res) => setAnalytics(res.data.data)).catch(() => {});
  }, []);

  const handleSaved = () => { setModal(null); loadExpenses(); axios.get('/api/v1/expenses/analytics').then((r) => setAnalytics(r.data.data)).catch(() => {}); };

  const handleShipmentClick = async (shipmentId) => {
    if (selectedShipmentFilter === shipmentId) {
      setSelectedShipmentFilter(null);
      setFilteredCategoryData(null);
      return;
    }
    setSelectedShipmentFilter(shipmentId);
    try {
      const res = await axios.get('/api/v1/expenses/analytics', { params: { shipment_id: shipmentId } });
      setFilteredCategoryData(res.data.data.byCategory);
    } catch (err) { console.error(err); }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await axios.post('/api/v1/expenses/categories', { name: newCatName.trim() });
      if (newCatFixed) {
        await axios.post(`/api/v1/fixed-costs/categories/${res.data.data.id}/toggle-fixed`);
      }
      setNewCatName('');
      setNewCatFixed(false);
      loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create category');
    }
  };

  const handleUpdateCategory = async (id) => {
    if (!editCatName.trim()) return;
    try {
      const cat = categories.find((c) => c.id === id);
      await axios.put(`/api/v1/expenses/categories/${id}`, { name: editCatName.trim() });
      // Toggle fixed if changed
      if ((cat?.is_fixed_cost || false) !== editCatFixed) {
        await axios.post(`/api/v1/fixed-costs/categories/${id}/toggle-fixed`);
      }
      setEditingCat(null);
      setEditCatName('');
      setEditCatFixed(false);
      loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Deactivate this category?')) return;
    try {
      await axios.delete(`/api/v1/expenses/categories/${id}`);
      loadCategories();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete category');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try { await axios.delete(`/api/v1/expenses/${id}`); loadExpenses(); } catch (err) { toast.error('Delete failed'); }
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <><PageHeader title="Expenses" subtitle="Loading..." onMenuClick={onMenuClick} hideSearch /><SkeletonPage kpiCards={3} tableRows={8} tableCols={7} /></>;

  return (
    <>
      <PageHeader title="Expenses" subtitle="Manual expense tracking and categories" onMenuClick={onMenuClick} hideSearch />
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 gc-stagger">
        <StatCard
          label="Total Expenses"
          value={fmt(totals.total)}
          subtext={`${totals.count} entries`}
          accent="red"
          icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
        />
        <StatCard
          label="Fixed Expenses"
          value={fmt(expenses.filter((e) => e.is_fixed_cost).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}
          subtext={`${expenses.filter((e) => e.is_fixed_cost).length} fixed entries`}
          accent="purple"
          icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <StatCard
          label="Largest"
          value={fmt(analytics?.summary?.max)}
          subtext="single expense"
          accent="gold"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
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
          <div className="gc-card p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <SearchInput
                className="flex-1 max-w-md"
                value={filters.search}
                onChange={(v) => { setFilters((f) => ({ ...f, search: v })); setPagination((p) => ({ ...p, page: 1 })); }}
                placeholder="Search description or vendor..."
              />
              <select value={filters.category_id}
                onChange={(e) => { setFilters((f) => ({ ...f, category_id: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
                className="gc-input w-auto min-w-[160px]">
                <option value="">All Categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={filters.shipment_id}
                onChange={(e) => { setFilters((f) => ({ ...f, shipment_id: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
                className="gc-input w-auto min-w-[160px]">
                <option value="">All Shipments</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.name} ({shipmentDateRange(s)})</option>)}
              </select>
              <button
                onClick={() => exportCSV(expenses, [
                  { key: 'expense_date', label: 'Date' },
                  { key: r => r.category?.name || '', label: 'Category' },
                  { key: 'description', label: 'Description' },
                  { key: 'vendor_or_payee', label: 'Vendor' },
                  { key: r => r.is_fixed_cost ? 'Fixed' : 'Variable', label: 'Type' },
                  { key: 'amount', label: 'Amount' },
                ], 'expenses')}
                className="h-10 px-4 rounded-[10px] bg-[#F4F6FA] text-[#6B7194] text-[12px] font-semibold hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="gc-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="gc-thead-accent text-left text-gray-500">
                    <SortHeader field="expense_date">Date</SortHeader>
                    <SortHeader field="category_id">Category</SortHeader>
                    <SortHeader field="description">Description</SortHeader>
                    <SortHeader field="vendor_or_payee">Vendor</SortHeader>
                    <SortHeader field="is_fixed_cost">Type</SortHeader>
                    <th className="px-4 py-3 font-medium">Shipment</th>
                    <SortHeader field="amount" className="text-right">Amount</SortHeader>
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
                      <td className="px-4 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${exp.is_fixed_cost ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                          {exp.is_fixed_cost ? 'Fixed' : 'Variable'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={exp.shipment_id || ''}
                          onChange={async (e) => {
                            const newShipment = shipments.find(s => s.id === e.target.value);
                            const label = newShipment ? newShipment.name : 'Unassigned';
                            if (!confirm(`Reassign this expense to "${label}"?`)) return;
                            try {
                              await axios.put(`/api/v1/expenses/${exp.id}`, { shipment_id: e.target.value || null });
                              loadExpenses();
                            } catch (err) { toast.error('Failed to reassign'); }
                          }}
                          className="px-1.5 py-1 border border-gray-200 rounded text-xs bg-transparent hover:border-primary-400 cursor-pointer max-w-[140px]"
                        >
                          <option value="">Unassigned</option>
                          {shipments.map((s) => <option key={s.id} value={s.id}>{s.name} ({shipmentDateRange(s)})</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right font-display-tabular font-bold text-[14.5px] text-red-600">{fmt(exp.amount)}</td>
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
              {expenses.length === 0 && <EmptyState illustration={<ReceiptArt />} title="No expenses found" description="Track shipping costs, fuel, customs duties, and other operating expenses against shipments." actionLabel="Add Expense" onAction={() => setModal('new')} />}
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
      {activeTab === 'analytics' && analytics && (() => {
        const shipmentData = analytics.byShipment || [];
        const maxShipVal = Math.max(...shipmentData.map((s) => s.total), 1);
        const monthData = analytics.monthlyTrend || [];
        const maxMonthVal = Math.max(...monthData.map((m) => m.total), 1);
        const categoryData = filteredCategoryData || analytics.byCategory;
        const categoryTotal = categoryData.reduce((s, c) => s + c.total, 0);
        const selectedLabel = selectedShipmentFilter ? shipmentData.find((s) => s.shipment_id === selectedShipmentFilter)?.shipment?.name : null;

        return (
        <div className="space-y-6">
          {/* Two graphs side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trend */}
            <div className="gc-card p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-5">Monthly Expense Trend</h3>
              <div className="flex items-end gap-2 h-64">
                {monthData.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    {m.total > 0 && (
                      <span className="text-xs text-gray-600 font-semibold">
                        {m.total >= 1000 ? `$${(m.total / 1000).toFixed(1)}k` : `$${m.total.toFixed(0)}`}
                      </span>
                    )}
                    <div className="w-full bg-red-400 rounded-t-md min-h-[3px] transition-all"
                      style={{ height: `${Math.max((m.total / maxMonthVal) * 200, m.total > 0 ? 6 : 3)}px` }} />
                    <span className="text-[10px] text-gray-500 font-medium -rotate-45 origin-top-left whitespace-nowrap">{m.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses by Shipment - Line Graph */}
            <div className="gc-card p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Expenses by Shipment</h3>
                {selectedShipmentFilter && (
                  <button onClick={() => { setSelectedShipmentFilter(null); setFilteredCategoryData(null); }}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium">Clear filter</button>
                )}
              </div>
              <p className="text-sm text-gray-400 mb-4">Click a point to filter categories</p>
              {shipmentData.length > 0 ? (
                <svg viewBox={`0 0 ${Math.max(shipmentData.length * 120, 350)} 260`} className="w-full h-64">
                  {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                    <g key={pct}>
                      <line x1="45" y1={210 - pct * 170} x2={Math.max(shipmentData.length * 120, 350) - 10} y2={210 - pct * 170} stroke="#f1f5f9" strokeWidth="1" />
                      <text x="0" y={214 - pct * 170} className="text-[10px] fill-gray-400">
                        {maxShipVal >= 1000 ? `$${(maxShipVal * pct / 1000).toFixed(0)}k` : `$${(maxShipVal * pct).toFixed(0)}`}
                      </text>
                    </g>
                  ))}
                  {shipmentData.length > 1 && (
                    <>
                      <polyline fill="none" stroke="#ef4444" strokeWidth="3" strokeLinejoin="round"
                        points={shipmentData.map((s, i) => `${i * 120 + 60},${210 - (s.total / maxShipVal) * 170}`).join(' ')} />
                      <polygon fill="url(#shipGrad)" opacity="0.12"
                        points={`60,210 ${shipmentData.map((s, i) => `${i * 120 + 60},${210 - (s.total / maxShipVal) * 170}`).join(' ')} ${(shipmentData.length - 1) * 120 + 60},210`} />
                    </>
                  )}
                  <defs>
                    <linearGradient id="shipGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" /><stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {shipmentData.map((s, i) => {
                    const x = i * 120 + 60;
                    const y = 210 - (s.total / maxShipVal) * 170;
                    const isSelected = selectedShipmentFilter === s.shipment_id;
                    const isActive = s.shipment?.status === 'collecting';
                    return (
                      <g key={s.shipment_id || i} onClick={() => handleShipmentClick(s.shipment_id)} className="cursor-pointer">
                        <circle cx={x} cy={y} r={isSelected ? 9 : 6}
                          fill={isSelected ? '#dc2626' : isActive ? '#22c55e' : s.total > 0 ? '#ef4444' : '#d1d5db'}
                          stroke="white" strokeWidth="2.5" />
                        <text x={x} y={y - 14} textAnchor="middle" className="text-[12px] fill-gray-700 font-bold">
                          {s.total >= 1000 ? `$${(s.total / 1000).toFixed(1)}k` : `$${s.total.toFixed(0)}`}
                        </text>
                        <text x={x} y={230} textAnchor="middle" className="text-[11px] fill-gray-600 font-medium">
                          {(s.shipment?.name || 'N/A').substring(0, 14)}
                        </text>
                        <text x={x} y={245} textAnchor="middle" className={`text-[10px] ${isActive ? 'fill-green-600 font-semibold' : 'fill-gray-400'}`}>
                          {s.shipment?.status || ''}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No data</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Category (filtered by selected shipment) */}
            <div className="gc-card p-5">
              <h3 className="font-semibold text-gray-900 mb-1">By Category</h3>
              {selectedLabel && (
                <p className="text-xs text-primary-600 font-medium mb-3">Filtered: {selectedLabel}</p>
              )}
              {!selectedLabel && <p className="text-xs text-gray-400 mb-3">All shipments</p>}
              <div className="space-y-3">
                {categoryData.map((c) => {
                  const pct = categoryTotal > 0 ? (c.total / categoryTotal * 100) : 0;
                  return (
                    <div key={c.category_id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{c.category?.name || 'Unknown'}</span>
                        <span className="font-semibold">{fmt(c.total)} ({c.count})</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {categoryData.length === 0 && <p className="text-sm text-gray-400">No data</p>}
              </div>
            </div>

            {/* By Shipment */}
            <div className="gc-card p-5">
              <h3 className="font-semibold text-gray-900 mb-4">By Shipment</h3>
              <div className="space-y-2">
                {analytics.byShipment.map((s) => {
                  const isActive = s.shipment?.status === 'collecting';
                  return (
                    <div key={s.shipment_id || 'none'} className={`flex justify-between items-center py-2 px-2 rounded-lg border-b border-gray-50 ${isActive ? 'bg-green-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700" title={s.shipment ? shipmentDateRange(s.shipment) : ''}>{s.shipment?.name || 'Unassigned'}</span>
                        {s.shipment?.status && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                            ${s.shipment.status === 'collecting' ? 'bg-green-100 text-green-700'
                              : s.shipment.status === 'shipped' ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-500'}`}>
                            {s.shipment.status}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-sm text-red-600">{fmt(s.total)}</span>
                    </div>
                  );
                })}
                {analytics.byShipment.length === 0 && <p className="text-sm text-gray-400">No data</p>}
              </div>
            </div>
          </div>

          {/* Top Vendors */}
          <div className="gc-card p-5">
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
        );
      })()}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Add new category */}
          <div className="gc-card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Add New Category</h3>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Enter category name..."
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); }}
                  className="gc-input" />
                <div className="flex gap-3 mt-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" checked={!newCatFixed} onChange={() => setNewCatFixed(false)} /> Variable
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" checked={newCatFixed} onChange={() => setNewCatFixed(true)} /> Fixed
                  </label>
                </div>
              </div>
              <button onClick={handleCreateCategory} disabled={!newCatName.trim()}
                className="px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          {/* Category list */}
          <div className="gc-card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Expense Categories ({categories.length})</h3>
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                  {editingCat === cat.id ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="text" value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(cat.id); if (e.key === 'Escape') setEditingCat(null); }}
                          className="gc-input flex-1" autoFocus />
                        <button onClick={() => handleUpdateCategory(cat.id)} className="text-xs text-green-600 font-medium">Save</button>
                        <button onClick={() => setEditingCat(null)} className="text-xs text-gray-500">Cancel</button>
                      </div>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="radio" checked={!editCatFixed} onChange={() => setEditCatFixed(false)} /> Variable
                        </label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="radio" checked={editCatFixed} onChange={() => setEditCatFixed(true)} /> Fixed
                        </label>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-purple-400" />
                        <span className="font-medium text-gray-900 text-sm">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${cat.is_fixed_cost ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                          {cat.is_fixed_cost ? 'Fixed' : 'Variable'}
                        </span>
                        <button onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); setEditCatFixed(cat.is_fixed_cost || false); }}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
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
    </>
  );
}
