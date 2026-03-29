import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

const METHODS = ['Cash', 'Check', 'Zelle', 'Square', 'Other'];

export default function Payments() {
  const [transactions, setTransactions] = useState([]);
  const [aggregates, setAggregates] = useState({ totalPayments: 0, totalRefunds: 0, netCollected: 0, paymentCount: 0, refundCount: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', transactionType: '', paymentMethod: '', includeVoided: false });
  const [loading, setLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, sortBy: 'payment_date', sortOrder: 'DESC' };
      if (filters.search) params.search = filters.search;
      if (filters.transactionType) params.transactionType = filters.transactionType;
      if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
      if (filters.includeVoided) params.includeVoided = 'true';

      const res = await axios.get('/api/v1/transactions', { params });
      setTransactions(res.data.data.transactions);
      setAggregates(res.data.data.aggregates);
      setPagination((prev) => ({ ...prev, ...res.data.data.pagination }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner text="Loading payments..." />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total Payments</p>
          <p className="text-2xl font-bold text-green-600">{fmt(aggregates.totalPayments)}</p>
          <p className="text-xs text-gray-400">{aggregates.paymentCount} transactions</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total Refunds</p>
          <p className="text-2xl font-bold text-orange-600">{fmt(aggregates.totalRefunds)}</p>
          <p className="text-xs text-gray-400">{aggregates.refundCount} transactions</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Net Collected</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(aggregates.netCollected)}</p>
          <p className="text-xs text-gray-400">{aggregates.transactionCount} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <input type="text" value={filters.search}
              onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
              placeholder="Search by customer or invoice #..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select value={filters.transactionType}
            onChange={(e) => { setFilters((f) => ({ ...f, transactionType: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">All Types</option>
            <option value="PAYMENT">Payments</option>
            <option value="REFUND">Refunds</option>
          </select>
          <select value={filters.paymentMethod}
            onChange={(e) => { setFilters((f) => ({ ...f, paymentMethod: e.target.value })); setPagination((p) => ({ ...p, page: 1 })); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">All Methods</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filters.includeVoided}
              onChange={(e) => { setFilters((f) => ({ ...f, includeVoided: e.target.checked })); setPagination((p) => ({ ...p, page: 1 })); }}
              className="rounded" />
            Show voided
          </label>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                <th className="px-4 py-3 font-medium">By</th>
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
                      <Link to={`/pickups/${tx.invoice?.id}`} className="font-medium text-primary-600 hover:text-primary-700">
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
                    <td className="px-4 py-3 text-gray-500 text-xs">{tx.recordedBy?.full_name || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {transactions.length === 0 && <p className="text-center py-12 text-gray-400">No transactions found</p>}
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
  );
}
