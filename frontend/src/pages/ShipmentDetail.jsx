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
            <p className="text-sm text-gray-500">Created {new Date(shipment.createdAt).toLocaleDateString()}</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Collected</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</p>
          <p className="text-xs text-gray-400">{paidCount} paid, {unpaidCount} unpaid</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map((inv) => {
                  const balance = Math.max(0, (parseFloat(inv.finalTotal) || 0) - (parseFloat(inv.amountPaid) || 0));
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
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
          {/* Expense category breakdown */}
          {expenses.length > 0 && (() => {
            const byCat = {};
            expenses.forEach((exp) => {
              const cat = exp.category?.name || 'Uncategorized';
              if (!byCat[cat]) byCat[cat] = { total: 0, count: 0, fixed: exp.is_fixed_cost };
              byCat[cat].total += parseFloat(exp.amount) || 0;
              byCat[cat].count++;
            });
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).map(([cat, data]) => (
                  <div key={cat} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-sm text-gray-500 truncate">{cat}</p>
                      <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${data.fixed ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                        {data.fixed ? 'F' : 'V'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-red-600">{fmt(data.total)}</p>
                    <p className="text-xs text-gray-400">{data.count} entries</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Expense list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
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
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(exp.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenses.length === 0 && (
                <p className="text-center py-8 text-gray-400">No expenses assigned to this shipment</p>
              )}
            </div>

            {expenses.length > 0 && (
              <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">Total Expenses ({expenseTotals.count})</span>
                <span className="text-lg font-bold text-red-600">{fmt(expenseTotals.total)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
