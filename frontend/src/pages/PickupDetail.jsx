import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import TransactionModal from '../components/TransactionModal';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';

export default function PickupDetail() {
  const { onMenuClick } = useLayout();
  const { id } = useParams();
  const [pickup, setPickup] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txSummary, setTxSummary] = useState(null);
  const [showVoided, setShowVoided] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'PAYMENT' | 'REFUND'
  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [shipments, setShipments] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadPickup = () => axios.get(`/api/v1/pickups/${id}`).then((res) => setPickup(res.data.data));
  const loadTransactions = () => axios.get(`/api/v1/invoices/${id}/transactions`, { params: { includeVoided: 'true' } })
    .then((res) => { setTransactions(res.data.data.transactions); setTxSummary(res.data.data.summary); });

  useEffect(() => {
    Promise.all([loadPickup(), loadTransactions()])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const startEditing = async () => {
    setEditForm({
      customerName: pickup.customerName || '',
      customerEmail: pickup.customerEmail || '',
      customerPhone: pickup.customerPhone || '',
      customerAddress: pickup.customerAddress || '',
      recipientName: pickup.recipientName || '',
      recipientPhone: pickup.recipientPhone || '',
      recipientAddress: pickup.recipientAddress || '',
      shipmentId: pickup.shipmentId || '',
    });
    try {
      const res = await axios.get('/api/v1/shipments');
      setShipments(res.data.data.shipments || res.data.data || []);
    } catch { setShipments([]); }
    setEditing(true);
  };

  const cancelEditing = () => { setEditing(false); setEditForm({}); };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`/api/v1/pickups/${id}`, editForm);
      setPickup(res.data.data);
      setEditing(false);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleTransactionSuccess = (updatedInvoice) => {
    setPickup((prev) => ({ ...prev, ...updatedInvoice }));
    loadTransactions();
    setModal(null);
  };

  const handleVoid = async (txId) => {
    if (!voidReason.trim()) return;
    try {
      const res = await axios.post(`/api/v1/invoices/${id}/transactions/${txId}/void`, { reason: voidReason.trim() });
      setPickup((prev) => ({ ...prev, ...res.data.data.invoice }));
      loadTransactions();
      setVoidingId(null);
      setVoidReason('');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Void failed');
    }
  };

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;

  if (loading) return <LoadingSpinner />;
  if (!pickup) return <p className="text-center py-12 text-gray-500">Invoice not found</p>;

  const balanceDue = Math.max(0, (parseFloat(pickup.finalTotal) || 0) - (parseFloat(pickup.amountPaid) || 0));
  const activeTxns = showVoided ? transactions : transactions.filter((t) => !t.voidedAt);
  const voidedCount = transactions.filter((t) => t.voidedAt).length;

  return (
    <>
      <PageHeader
        title={`Invoice #${pickup.invoiceNumber}`}
        subtitle={pickup.customerName}
        onMenuClick={onMenuClick}
        hideSearch
      />

      <Link to="/pickups" className="inline-flex items-center text-[13px] text-[#6366F1] hover:text-[#4F46E5] gap-1 mb-4 font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Invoices
      </Link>

      <div className="space-y-6">

      {/* Transaction Modal */}
      {modal && (
        <TransactionModal
          invoice={pickup}
          transactionType={modal}
          onClose={() => setModal(null)}
          onSuccess={handleTransactionSuccess}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="gc-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Invoice #{pickup.invoiceNumber}</h2>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <>
                    <Link
                      to={`/pickups/${pickup.id}/packing-list`}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#F4F6FA] text-[#1A1D2B] hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Packing List
                    </Link>
                    <button onClick={startEditing}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors">
                      Edit
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={saveEdits} disabled={saving}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={cancelEditing}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                      Cancel
                    </button>
                  </>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-medium
                  ${pickup.paymentStatus === 'paid' ? 'bg-green-100 text-green-700'
                    : pickup.paymentStatus === 'partial' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'}`}>
                  {pickup.paymentStatus}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {pickup.warehouseDays}d in warehouse
                </span>
              </div>
            </div>

            {/* Line Items */}
            <h3 className="font-semibold text-gray-900 mb-3">Line Items</h3>
            <div className="space-y-3">
              {pickup.lineItems?.map((item) => (
                <div key={item.id} className="flex items-start gap-4 p-3 rounded-lg bg-gray-50">
                  {item.photos?.length > 0 && (
                    <img src={item.photos[0].data} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {item.catalogName || item.description || 'Custom Item'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.type === 'custom' && item.dimensionsL
                        ? `${item.dimensionsL}" x ${item.dimensionsW}" x ${item.dimensionsH}"`
                        : item.type}
                      {' '} &middot; Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">{fmt(item.finalPrice)}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 mt-4 pt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-lg">{fmt(pickup.finalTotal)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Paid</span>
                <span className="font-semibold text-green-600">{fmt(pickup.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Balance Due</span>
                <span className={`font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(balanceDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Actions */}
          <div className="flex gap-3">
            {balanceDue > 0 && (
              <button onClick={() => setModal('PAYMENT')}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors">
                Receive Payment
              </button>
            )}
            {parseFloat(pickup.amountPaid) > 0 && (
              <button onClick={() => setModal('REFUND')}
                className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 transition-colors">
                Record Refund
              </button>
            )}
          </div>

          {/* Transaction History */}
          <div className="gc-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Transaction History</h3>
              {voidedCount > 0 && (
                <button onClick={() => setShowVoided(!showVoided)} className="text-xs text-gray-500 hover:text-gray-700">
                  {showVoided ? 'Hide voided' : `Show ${voidedCount} voided`}
                </button>
              )}
            </div>

            {activeTxns.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">No transactions recorded</p>
            ) : (
              <div className="space-y-3">
                {activeTxns.map((tx) => {
                  const isVoided = !!tx.voidedAt;
                  const isRefund = tx.transactionType === 'REFUND';
                  return (
                    <div key={tx.id} className={`p-3 rounded-lg border ${isVoided ? 'bg-gray-50 opacity-60 border-gray-200' : 'border-gray-100'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium
                            ${isVoided ? 'bg-gray-200 text-gray-500 line-through'
                              : isRefund ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {isRefund ? 'Refund' : 'Payment'}{isVoided ? ' (Voided)' : ''}
                          </span>
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            {tx.paymentMethod === 'Other' && tx.paymentMethodOtherText
                              ? `Other - ${tx.paymentMethodOtherText}` : tx.paymentMethod}
                          </span>
                        </div>
                        <span className={`font-semibold ${isVoided ? 'text-gray-400 line-through' : isRefund ? 'text-orange-600' : 'text-green-600'}`}>
                          {isRefund ? '-' : '+'}{fmt(tx.amount)}
                        </span>
                      </div>
                      <p className={`text-sm mt-1 ${isVoided ? 'line-through text-gray-400' : 'text-gray-600'}`}>{tx.comment}</p>
                      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                        <span>{new Date(tx.paymentDate).toLocaleDateString()} &middot; {tx.recordedBy?.full_name || 'System'}</span>
                        {!isVoided && (
                          voidingId === tx.id ? (
                            <div className="flex items-center gap-2">
                              <input type="text" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="Reason..." className="px-2 py-1 border rounded text-xs w-40" />
                              <button onClick={() => handleVoid(tx.id)} className="text-red-600 font-medium">Confirm</button>
                              <button onClick={() => { setVoidingId(null); setVoidReason(''); }} className="text-gray-500">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setVoidingId(tx.id)} className="text-red-500 hover:text-red-700">Void</button>
                          )
                        )}
                      </div>
                      {isVoided && tx.voidReason && (
                        <p className="text-xs text-red-500 mt-1">Void reason: {tx.voidReason}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="gc-card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
            {editing ? (
              <div className="space-y-2">
                <input value={editForm.customerName} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Name" />
                <input value={editForm.customerEmail} onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Email" />
                <input value={editForm.customerPhone} onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Phone" />
                <input value={editForm.customerAddress} onChange={(e) => setEditForm({ ...editForm, customerAddress: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Address" />
              </div>
            ) : (
              <>
                <p className="font-medium">{pickup.customerName}</p>
                <p className="text-sm text-gray-500">{pickup.customerEmail}</p>
                <p className="text-sm text-gray-500">{pickup.customerPhone}</p>
                <p className="text-sm text-gray-500 mt-1">{pickup.customerAddress}</p>
              </>
            )}
          </div>

          <div className="gc-card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Recipient (Ghana)</h3>
            {editing ? (
              <div className="space-y-2">
                <input value={editForm.recipientName} onChange={(e) => setEditForm({ ...editForm, recipientName: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Name" />
                <input value={editForm.recipientPhone} onChange={(e) => setEditForm({ ...editForm, recipientPhone: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Phone" />
                <input value={editForm.recipientAddress} onChange={(e) => setEditForm({ ...editForm, recipientAddress: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Address" />
              </div>
            ) : pickup.recipientName ? (
              <>
                <p className="font-medium">{pickup.recipientName}</p>
                <p className="text-sm text-gray-500">{pickup.recipientPhone}</p>
                <p className="text-sm text-gray-500">{pickup.recipientAddress}</p>
              </>
            ) : (
              <p className="text-gray-400">No recipient</p>
            )}
          </div>

          <div className="gc-card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Shipment</h3>
            {editing ? (
              <select value={editForm.shipmentId} onChange={(e) => setEditForm({ ...editForm, shipmentId: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-lg text-sm">
                <option value="">Not assigned</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({shipmentDateRange(s)})</option>
                ))}
              </select>
            ) : pickup.Shipment ? (
              <Link to={`/shipments/${pickup.Shipment.id}`} className="text-primary-600 hover:text-primary-700 font-medium" title={shipmentDateRange(pickup.Shipment)}>
                {pickup.Shipment.name}
              </Link>
            ) : (
              <p className="text-gray-400">Not assigned</p>
            )}
          </div>

          <div className="gc-card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{new Date(pickup.createdAt).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Items</span><span>{pickup.originalItemCount}{pickup.addedItemCount > 0 ? `+${pickup.addedItemCount}` : ''}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Last Method</span><span>{pickup.paymentMethod || 'N/A'}</span></div>
            </div>
          </div>

          {/* Payment Summary Card */}
          {txSummary && (
            <div className="gc-card p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Payment Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Invoice Total</span><span className="font-semibold">{fmt(txSummary.totalAmount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Payments</span><span className="text-green-600 font-semibold">{fmt(txSummary.paymentsSum)}</span></div>
                {txSummary.refundsSum > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Refunds</span><span className="text-orange-600 font-semibold">-{fmt(txSummary.refundsSum)}</span></div>
                )}
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-700 font-medium">Balance Due</span>
                  <span className={`font-bold ${txSummary.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(txSummary.balanceDue)}</span>
                </div>
                <p className="text-xs text-gray-400">{txSummary.activeCount} transaction(s)</p>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
