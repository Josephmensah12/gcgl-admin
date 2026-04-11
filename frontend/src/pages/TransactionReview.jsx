import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';

function ReviewModal({ transaction, categories, shipments, onClose, onReviewed }) {
  const [category, setCategory] = useState(transaction.trainingData?.suggested_category || '');
  const [shipmentId, setShipmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [isBusiness, setIsBusiness] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startTime] = useState(Date.now());

  const suggestion = transaction.trainingData;

  const handleAction = async (action) => {
    if (action === 'approve' && !category) { setError('Select a category'); return; }
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/v1/bank/transactions/${transaction.id}/review`, {
        action,
        category: action === 'approve' ? category : null,
        shipmentId: shipmentId || null,
        notes,
        isBusinessExpense: action === 'approve' ? isBusiness : false,
        isFixedCost: action === 'approve' ? (categories.find((c) => c.name === category)?.is_fixed_cost || false) : false,
        _reviewStartTime: startTime,
      });
      onReviewed();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Review failed');
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = {
    keyword_match: 'bg-green-100 text-green-700',
    amount_pattern: 'bg-amber-100 text-amber-700',
    no_match: 'bg-red-100 text-red-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Review Transaction</h2>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          {/* Transaction Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-2xl font-bold text-gray-900">${parseFloat(transaction.amount).toFixed(2)}</span>
              <span className="text-sm text-gray-500">{new Date(transaction.transaction_date).toLocaleDateString()}</span>
            </div>
            <p className="font-medium text-gray-800">{transaction.merchant_name}</p>
            <p className="text-sm text-gray-500 mt-1">{transaction.description}</p>
            <p className="text-xs text-gray-400 mt-2">
              {transaction.bankConnection?.account_nickname} &middot; Plaid: {transaction.plaid_category || 'N/A'}
            </p>
          </div>

          {/* AI Suggestion */}
          {suggestion && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-blue-800">System Suggestion</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${confidenceColor[suggestion.suggestion_confidence] || 'bg-gray-100'}`}>
                  {suggestion.suggestion_confidence?.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-blue-700">Category: <strong>{suggestion.suggested_category}</strong></p>
              <p className="text-xs text-blue-600 mt-1">{suggestion.suggestion_reasoning}</p>
            </div>
          )}

          {/* Review Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                <option value="">Select category...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Shipment</label>
              <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                <option value="">-- Auto-assign by date --</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.name} ({shipmentDateRange(s)})</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Leave empty to auto-assign based on transaction date</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..." rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expense Type *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={isBusiness} onChange={() => setIsBusiness(true)} /> Business Expense
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={!isBusiness} onChange={() => setIsBusiness(false)} /> Personal
                </label>
              </div>
            </div>

            {isBusiness && category && (
              <p className="text-xs text-gray-500">
                Cost type: <span className={`font-medium ${categories.find((c) => c.name === category)?.is_fixed_cost ? 'text-purple-700' : 'text-gray-700'}`}>
                  {categories.find((c) => c.name === category)?.is_fixed_cost ? 'Fixed (set by category)' : 'Variable (set by category)'}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t space-y-2">
          <div className="flex gap-3">
            <button onClick={() => handleAction('approve')} disabled={loading || !category}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Approve & Categorize
            </button>
            <button onClick={() => handleAction('reject')} disabled={loading}
              className="px-4 py-2.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200">
              Personal
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleAction('uncategorized')} disabled={loading}
              className="flex-1 px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100">
              Mark Uncategorized
            </button>
            <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TransactionReview() {
  const { onMenuClick } = useLayout();
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({});
  const [categories, setCategories] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkShipment, setBulkShipment] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const [sortBy, setSortBy] = useState('transaction_date');
  const [sortOrder, setSortOrder] = useState('ASC');

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => o === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder(field === 'amount' ? 'DESC' : 'ASC');
    }
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const SortHeader = ({ field, children }) => (
    <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        {sortBy === field ? (
          <span className="text-primary-600">{sortOrder === 'ASC' ? '\u2191' : '\u2193'}</span>
        ) : (
          <span className="text-gray-300">\u2195</span>
        )}
      </div>
    </th>
  );

  const loadData = useCallback(async () => {
    try {
      const [txRes, statsRes] = await Promise.all([
        axios.get('/api/v1/bank/transactions', { params: { status: statusFilter, page: pagination.page, limit: pagination.limit, sortBy, sortOrder } }),
        axios.get('/api/v1/bank/stats'),
      ]);
      setTransactions(txRes.data.data.transactions);
      setPagination((p) => ({ ...p, ...txRes.data.data.pagination }));
      setStats(statsRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [statusFilter, pagination.page, pagination.limit, sortBy, sortOrder]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    axios.get('/api/v1/expenses/categories').then((r) => setCategories(r.data.data)).catch(() => {});
    axios.get('/api/v1/shipments/active').then((r) => setShipments(r.data.data)).catch(() => {});
  }, []);

  const handleReviewed = () => { setReviewModal(null); setSelected(new Set()); loadData(); };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    try {
      await axios.post('/api/v1/bank/transactions/bulk-review', {
        transactionIds: [...selected], action: 'approve',
        category: bulkCategory || null, // null = use each transaction's AI suggestion
        shipmentId: bulkShipment || null,
        useSuggestions: !bulkCategory, // flag to use AI suggestions
      });
      setSelected(new Set()); setBulkCategory(''); setBulkShipment(''); loadData();
    } catch (err) { alert(err.response?.data?.error?.message || 'Bulk review failed'); }
  };

  const handleBulkReject = async () => {
    if (selected.size === 0) return;
    try {
      await axios.post('/api/v1/bank/transactions/bulk-review', { transactionIds: [...selected], action: 'reject' });
      setSelected(new Set()); loadData();
    } catch (err) { alert('Bulk reject failed'); }
  };

  const toggleSelect = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map((t) => t.id)));
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const confidenceBadge = { keyword_match: 'bg-green-100 text-green-700', amount_pattern: 'bg-amber-100 text-amber-700', no_match: 'bg-red-100 text-red-700' };

  if (loading) return <LoadingSpinner text="Loading transactions..." />;

  return (
    <>
      <PageHeader title="Bank Transactions" subtitle="Review and categorize imported bank activity" onMenuClick={onMenuClick} hideSearch />
    <div className="space-y-6">
      {/* Alert Banner */}
      {stats.pendingCount > 0 && (
        <div className={`p-4 rounded-xl text-sm font-medium ${stats.oldestPendingDays > 2 ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
          {stats.pendingCount} transaction{stats.pendingCount !== 1 ? 's' : ''} need review ({fmt(stats.pendingAmount)})
          {stats.oldestPendingDays > 0 && ` — oldest: ${stats.oldestPendingDays} days ago`}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500">Pending Review</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pendingCount || 0}</p>
          <p className="text-xs text-gray-400">{fmt(stats.pendingAmount)}</p>
        </div>
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500">This Week</p>
          <p className="text-2xl font-bold text-gray-900">{stats.weeklyImports || 0}</p>
          <p className="text-xs text-gray-400">{stats.weeklyReviewed || 0} reviewed</p>
        </div>
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500">Suggestion Accuracy</p>
          <p className="text-2xl font-bold text-primary-600">{stats.suggestionAccuracy || 0}%</p>
          <p className="text-xs text-gray-400">AI learning</p>
        </div>
        <div className="gc-card p-5">
          <p className="text-sm text-gray-500">Business Expenses</p>
          <p className="text-2xl font-bold text-green-600">{fmt(stats.totalBusinessExpenses)}</p>
          <p className="text-xs text-gray-400">{stats.totalApproved || 0} approved</p>
        </div>
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <ReviewModal transaction={reviewModal} categories={categories} shipments={shipments}
          onClose={() => setReviewModal(null)} onReviewed={handleReviewed} />
      )}

      {/* Filters & Bulk Actions */}
      <div className="gc-card p-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-3 items-center">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="uncategorized">Uncategorized</option>
              <option value="rejected">Rejected</option>
              <option value="deferred">Deferred</option>
            </select>
            <label className={`px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 cursor-pointer whitespace-nowrap ${csvUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {csvUploading ? 'Loading...' : 'Load CSV'}
              <input type="file" accept=".csv,.txt" className="hidden" disabled={csvUploading} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setCsvUploading(true);
                try {
                  const text = await file.text();
                  const res = await axios.post('/api/v1/bank/import-csv', { csvData: text, accountLabel: 'Bank of America' });
                  alert(`${res.data.data.imported} transactions loaded, ${res.data.data.skipped} duplicates skipped`);
                  loadData();
                } catch (err) {
                  alert(err.response?.data?.error?.message || 'Import failed');
                } finally {
                  setCsvUploading(false);
                  e.target.value = '';
                }
              }} />
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={async () => {
              if (!confirm(`Clear all ${statusFilter === 'pending_review' ? 'pending' : statusFilter} transactions?`)) return;
              const clearExpenses = confirm('Also clear linked expenses?\n\nOK = clear both transactions and expenses\nCancel = keep expenses, only clear bank transactions');
              try {
                const res = await axios.post('/api/v1/bank/clear-transactions', { status: statusFilter, clearExpenses });
                alert(`${res.data.data.deleted} transactions cleared${clearExpenses ? `, ${res.data.data.expensesDeleted} expenses removed` : ''}`);
                loadData();
              } catch (err) { alert('Failed to clear'); }
            }} className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">
              Clear {statusFilter === 'pending_review' ? 'Pending' : statusFilter}
            </button>
            <button onClick={async () => {
              if (!confirm('Clear ALL bank transactions (all statuses)?')) return;
              const clearExpenses = confirm('Also clear linked expenses?\n\nOK = clear both transactions and expenses\nCancel = keep expenses, only clear bank transactions');
              try {
                const res = await axios.post('/api/v1/bank/clear-transactions', { clearExpenses });
                alert(`${res.data.data.deleted} transactions cleared${clearExpenses ? `, ${res.data.data.expensesDeleted} expenses removed` : ''}`);
                loadData();
              } catch (err) { alert('Failed to clear'); }
            }} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">
              Clear All
            </button>
          </div>

          {selected.size > 0 && statusFilter === 'pending_review' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">{selected.size} selected</span>
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="px-2 py-1.5 border rounded text-xs">
                <option value="">Category...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <select value={bulkShipment} onChange={(e) => setBulkShipment(e.target.value)} className="px-2 py-1.5 border rounded text-xs">
                <option value="">Shipment...</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.name} ({shipmentDateRange(s)})</option>)}
              </select>
              <button onClick={handleBulkApprove}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                {bulkCategory ? `Approve ${selected.size} Selected` : `Approve ${selected.size} (use suggestions)`}
              </button>
              <button onClick={handleBulkReject}
                className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-xs font-medium">Reject {selected.size}</button>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Table */}
      <div className="gc-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                {statusFilter === 'pending_review' && (
                  <th className="px-4 py-3"><input type="checkbox" checked={selected.size === transactions.length && transactions.length > 0} onChange={selectAll} /></th>
                )}
                <SortHeader field="transaction_date">Date</SortHeader>
                <SortHeader field="amount">Amount</SortHeader>
                <SortHeader field="merchant_name">Merchant</SortHeader>
                <th className="px-4 py-3 font-medium">Account</th>
                <SortHeader field="suggested_category">Suggestion</SortHeader>
                {statusFilter !== 'pending_review' && <SortHeader field="gcgl_category">Category</SortHeader>}
                {statusFilter !== 'pending_review' && <th className="px-4 py-3 font-medium">Cost Type</th>}
                {statusFilter !== 'pending_review' && <th className="px-4 py-3 font-medium">Shipment</th>}
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <tr key={tx.id} className={`hover:bg-gray-50 ${selected.has(tx.id) ? 'bg-primary-50' : ''}`}>
                  {statusFilter === 'pending_review' && (
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} /></td>
                  )}
                  <td className="px-4 py-3 text-gray-600">{new Date(tx.transaction_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">${parseFloat(tx.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{tx.merchant_name}</p>
                    <p className="text-xs text-gray-400 truncate max-w-xs">{tx.description}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{tx.bankConnection?.account_nickname}</td>
                  <td className="px-4 py-3">
                    {tx.trainingData && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${confidenceBadge[tx.trainingData.suggestion_confidence] || 'bg-gray-100'}`}>
                        {tx.trainingData.suggested_category}
                      </span>
                    )}
                  </td>
                  {statusFilter !== 'pending_review' && <td className="px-4 py-3 text-sm">{tx.gcgl_category || '-'}</td>}
                  {statusFilter !== 'pending_review' && (
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${tx.is_fixed_cost ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                        {tx.is_fixed_cost ? 'Fixed' : 'Variable'}
                      </span>
                    </td>
                  )}
                  {statusFilter !== 'pending_review' && <td className="px-4 py-3 text-xs">{tx.shipment?.name || '-'}</td>}
                  <td className="px-4 py-3">
                    {tx.status === 'pending_review' || tx.status === 'uncategorized' ? (
                      <button onClick={() => setReviewModal(tx)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tx.status === 'uncategorized' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                        {tx.status === 'uncategorized' ? 'Categorize' : 'Review'}
                      </button>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${tx.status === 'approved' ? 'bg-green-100 text-green-700' : tx.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                        {tx.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <p className="text-center py-12 text-gray-400">
              {statusFilter === 'pending_review' ? 'No transactions pending review' : 'No transactions found'}
            </p>
          )}
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
    </div>
    </>
  );
}
