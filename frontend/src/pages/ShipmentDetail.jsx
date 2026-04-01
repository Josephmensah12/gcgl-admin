import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ShipmentDetail() {
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
  const [expSortBy, setExpSortBy] = useState('expense_date');
  const [expSortOrder, setExpSortOrder] = useState('ASC');

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

  useEffect(() => {
    Promise.all([
      axios.get(`/api/v1/shipments/${id}`),
      axios.get('/api/v1/transactions', { params: { shipmentId: id, limit: 200 } }),
      axios.get('/api/v1/expenses', { params: { shipment_id: id, limit: 200 } }),
    ])
      .then(([shipRes, txRes, expRes]) => {
        setShipment(shipRes.data.data);
        setTransactions(txRes.data.data.transactions);
        setTxAggregates(txRes.data.data.aggregates);
        setExpenses(expRes.data.data.expenses);
        setExpenseTotals(expRes.data.data.totals);
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
      alert(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const statusPipeline = ['collecting', 'ready', 'shipped', 'transit', 'customs', 'delivered'];

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
    <div className="space-y-6">
      <Link to="/shipments" className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700 gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Shipments
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
            {currentIndex < statusPipeline.length - 1 && (
              <button
                onClick={() => updateStatus(statusPipeline[currentIndex + 1])}
                disabled={updating}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500 mb-1">Capacity</p>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div className={`h-2 rounded-full ${getCapacityColor(shipment.capacityPercent)}`} style={{ width: `${shipment.capacityPercent}%` }} />
          </div>
          <p className="text-sm font-semibold">{fmt(shipment.totalValue)} / {fmt(shipment.maxCapacity)}</p>
          <p className="text-xs text-gray-400">{shipment.capacityPercent}%</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
                        <Link to={`/pickups/${inv.id}`} className="font-medium text-primary-600 hover:text-primary-700">
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Total Payments</p>
                <p className="text-xl font-bold text-green-600">{fmt(txAggregates.totalPayments)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Total Refunds</p>
                <p className="text-xl font-bold text-orange-600">{fmt(txAggregates.totalRefunds)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-sm text-gray-500">Net Collected</p>
                <p className="text-xl font-bold text-gray-900">{fmt(txAggregates.netCollected)}</p>
              </div>
            </div>
          )}

          {/* Transaction list */}
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
                          <Link to={`/pickups/${tx.invoice?.id}`} className="font-medium text-primary-600">
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

            return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">Expense Breakdown</h3>
                  {expCatFilter && (
                    <button onClick={() => setExpCatFilter(null)} className="text-sm text-primary-600 font-medium">Clear filter</button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-5">Click a bar to filter the table below</p>

                <div className="flex items-end gap-3" style={{ height: '220px' }}>
                  {sorted.map(([cat, data], i) => {
                    const pct = maxVal > 0 ? (data.total / maxVal) * 100 : 0;
                    const isSelected = expCatFilter === cat;
                    return (
                      <div key={cat} className="flex-1 flex flex-col items-center gap-1 min-w-0"
                        onClick={() => setExpCatFilter(expCatFilter === cat ? null : cat)} style={{ cursor: 'pointer' }}>
                        <span className="text-[10px] font-semibold text-gray-600 whitespace-nowrap">
                          {data.total >= 1000 ? `$${(data.total / 1000).toFixed(1)}k` : `$${data.total.toFixed(0)}`}
                        </span>
                        <div className="w-full flex justify-center" style={{ height: '170px' }}>
                          <div
                            className={`w-full max-w-[48px] rounded-t transition-all ${isSelected ? 'ring-2 ring-offset-1 ring-gray-800' : 'hover:opacity-80'}`}
                            style={{
                              height: `${Math.max(pct, 3)}%`,
                              backgroundColor: isSelected ? '#1e3a5f' : '#4a90d9',
                              alignSelf: 'flex-end',
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-500 text-center leading-tight truncate w-full px-0.5" title={cat}>
                          {cat.length > 12 ? cat.substring(0, 10) + '..' : cat}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            );
          })()}

          {/* Expense list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                    <ExpSortHeader field="expense_date">Date</ExpSortHeader>
                    <ExpSortHeader field="category">Category</ExpSortHeader>
                    <ExpSortHeader field="description">Description</ExpSortHeader>
                    <ExpSortHeader field="vendor">Vendor</ExpSortHeader>
                    <ExpSortHeader field="type">Type</ExpSortHeader>
                    <ExpSortHeader field="amount" className="text-right">Amount</ExpSortHeader>
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
  );
}
