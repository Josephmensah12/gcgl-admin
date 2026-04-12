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
  const [emailModal, setEmailModal] = useState(null); // null | { to, cc, message, sending, error, success }
  const [emailConfigured, setEmailConfigured] = useState(null); // null = unknown, bool = known

  const openEmailModal = () => {
    setEmailModal({
      to: pickup.customerEmail && pickup.customerEmail !== 'noemail@gcgl.com' ? pickup.customerEmail : '',
      cc: '',
      message: '',
      sending: false,
      error: null,
      success: null,
    });
    if (emailConfigured === null) {
      axios.get('/api/v1/pickups/email/status')
        .then((res) => setEmailConfigured(!!res.data.data?.configured))
        .catch(() => setEmailConfigured(false));
    }
  };

  const sendEmail = async () => {
    if (!emailModal?.to) return;
    setEmailModal((prev) => ({ ...prev, sending: true, error: null, success: null }));
    try {
      const res = await axios.post(`/api/v1/pickups/${id}/email`, {
        to: emailModal.to,
        cc: emailModal.cc || undefined,
        message: emailModal.message || undefined,
      });
      setEmailModal((prev) => ({ ...prev, sending: false, success: `Sent to ${res.data.data.to}` }));
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to send';
      const code = err.response?.data?.error?.code;
      setEmailModal((prev) => ({ ...prev, sending: false, error: code === 'SMTP_NOT_CONFIGURED' ? `${msg}` : msg }));
    }
  };

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

      {emailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => !emailModal.sending && setEmailModal(null)}
        >
          <div
            className="bg-white rounded-[16px] p-6 w-full max-w-md mx-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-bold text-[#1A1D2B] tracking-[-0.3px] mb-1">Email Invoice</h3>
            <p className="text-[13px] text-[#6B7194] mb-4">
              Send invoice #{pickup.invoiceNumber} ({pickup.customerName}) as a formatted HTML email.
            </p>

            {emailConfigured === false && (
              <div className="mb-4 px-3 py-2.5 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[12px] text-[#92400E]">
                SMTP is not configured. Add <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> to Railway environment variables for the <code>gcgl-admin-backend</code> service.
              </div>
            )}

            <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">To</label>
            <input
              type="email"
              value={emailModal.to}
              onChange={(e) => setEmailModal((p) => ({ ...p, to: e.target.value }))}
              placeholder="customer@example.com"
              className="gc-input mb-3"
            />

            <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Cc (optional)</label>
            <input
              type="text"
              value={emailModal.cc}
              onChange={(e) => setEmailModal((p) => ({ ...p, cc: e.target.value }))}
              placeholder="someone@example.com, another@example.com"
              className="gc-input mb-3"
            />

            <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Message (optional)</label>
            <textarea
              value={emailModal.message}
              onChange={(e) => setEmailModal((p) => ({ ...p, message: e.target.value }))}
              placeholder="Hi, here's your invoice…"
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all mb-4"
            />

            {emailModal.error && (
              <div className="mb-3 px-3 py-2.5 rounded-[10px] bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] text-[#B91C1C] text-[12px]">
                {emailModal.error}
              </div>
            )}
            {emailModal.success && (
              <div className="mb-3 px-3 py-2.5 rounded-[10px] bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] text-[#047857] text-[12px]">
                ✓ {emailModal.success}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setEmailModal(null)}
                disabled={emailModal.sending}
                className="h-10 px-4 rounded-[10px] text-[#6B7194] hover:bg-[#F4F6FA] text-[13px] font-medium transition-colors"
              >
                Close
              </button>
              {!emailModal.success && (
                <button
                  type="button"
                  onClick={sendEmail}
                  disabled={emailModal.sending || !emailModal.to}
                  className="h-10 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {emailModal.sending ? 'Sending…' : 'Send Email'}
                </button>
              )}
            </div>
          </div>
        </div>
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
                      to={`/pickups/${pickup.id}/print`}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors inline-flex items-center gap-1"
                      title="Open printable invoice"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print / PDF
                    </Link>
                    <button
                      onClick={openEmailModal}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#F4F6FA] text-[#1A1D2B] hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-1"
                      title="Email invoice to customer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email
                    </button>
                    <Link
                      to={`/pickups/${pickup.id}/packing-list`}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#F4F6FA] text-[#1A1D2B] hover:bg-[#E9EBF2] transition-colors inline-flex items-center gap-1"
                    >
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
                <LineItemRow
                  key={item.id}
                  item={item}
                  locked={pickup.paymentStatus === 'paid'}
                  onDiscountSave={async (payload) => {
                    try {
                      const res = await axios.patch(`/api/v1/pickups/${id}/items/${item.id}/discount`, payload);
                      // Merge instead of replacing so fields not returned by the discount
                      // endpoint (like lineItem.photos and Customer.Recipients) stay intact
                      setPickup((prev) => ({ ...prev, ...res.data.data }));
                    } catch (err) {
                      console.error('Line discount error:', err);
                      const status = err.response?.status;
                      const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
                      alert(`Failed to apply line discount (HTTP ${status || 'net-err'}): ${msg}`);
                    }
                  }}
                />
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-gray-200 mt-4 pt-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums">{fmt(pickup.subtotal)}</span>
              </div>
              {parseFloat(pickup.totalDiscount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="tabular-nums text-red-600">−{fmt(pickup.totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
                <span className="text-gray-700 font-medium">Total</span>
                <span className="font-bold text-lg tabular-nums">{fmt(pickup.finalTotal)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">Paid</span>
                <span className="font-semibold text-green-600 tabular-nums">{fmt(pickup.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Balance Due</span>
                <span className={`font-bold tabular-nums ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(balanceDue)}
                </span>
              </div>
            </div>

            {/* Invoice-level discount editor */}
            <InvoiceDiscountEditor
              pickup={pickup}
              locked={pickup.paymentStatus === 'paid'}
              onSave={async (payload) => {
                try {
                  const res = await axios.patch(`/api/v1/pickups/${id}/discount`, payload);
                  setPickup((prev) => ({ ...prev, ...res.data.data }));
                } catch (err) {
                  console.error('Invoice discount error:', err);
                  const status = err.response?.status;
                  const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
                  alert(`Failed to apply invoice discount (HTTP ${status || 'net-err'}): ${msg}`);
                }
              }}
            />
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

/* ─────────────────────────────────────────────────────────── */
/*  Line item row with inline discount editor                  */
/* ─────────────────────────────────────────────────────────── */

function LineItemRow({ item, onDiscountSave, locked }) {
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(item.discountType || 'none');
  const [value, setValue] = useState(
    item.discountValue != null ? String(item.discountValue) : '0'
  );
  const [saving, setSaving] = useState(false);

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;
  const preDiscount = parseFloat(item.preDiscountTotal) ||
                      (parseFloat(item.basePrice) || 0) * (parseInt(item.quantity) || 1);
  const discountAmt = parseFloat(item.discountAmount) || 0;
  const finalPrice = parseFloat(item.finalPrice) || 0;
  const hasDiscount = discountAmt > 0.01;

  const save = async () => {
    setSaving(true);
    await onDiscountSave({ discount_type: type, discount_value: parseFloat(value) || 0 });
    setSaving(false);
    setEditing(false);
  };

  const clear = async () => {
    setSaving(true);
    setType('none');
    setValue('0');
    await onDiscountSave({ discount_type: 'none', discount_value: 0 });
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="p-3 rounded-lg bg-gray-50">
      <div className="flex items-start gap-4">
        {item.photos?.length > 0 && (
          <img src={item.photos[0].data} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">
            {item.catalogName || item.description || 'Custom Item'}
          </p>
          <p className="text-xs text-gray-500">
            {item.type === 'custom' && item.dimensionsL
              ? `${item.dimensionsL}" × ${item.dimensionsW}" × ${item.dimensionsH}"`
              : item.type}
            {' · '}Qty: {item.quantity}
            {' · '}@ {fmt(item.basePrice)}
          </p>
        </div>
        <div className="text-right shrink-0">
          {hasDiscount && (
            <p className="text-[11px] text-gray-400 line-through tabular-nums">{fmt(preDiscount)}</p>
          )}
          <p className="font-semibold tabular-nums">{fmt(finalPrice)}</p>
          {hasDiscount && (
            <p className="text-[10px] text-red-500 font-medium">−{fmt(discountAmt)}</p>
          )}
        </div>
      </div>

      {!editing ? (
        <button
          type="button"
          disabled={locked}
          onClick={() => setEditing(true)}
          className="mt-2 text-[11px] font-semibold text-[#6366F1] hover:text-[#4F46E5] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {hasDiscount ? 'Edit discount' : 'Add discount'}
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none"
          >
            <option value="none">No discount</option>
            <option value="percentage">% off</option>
            <option value="fixed">$ off</option>
          </select>
          {type !== 'none' && (
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              min="0"
              step="0.01"
              className="h-8 w-24 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none tabular-nums"
              placeholder={type === 'percentage' ? '%' : '$'}
            />
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-8 px-3 rounded-[8px] bg-[#6366F1] text-white text-[12px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
          >
            {saving ? '...' : 'Save'}
          </button>
          {hasDiscount && (
            <button
              type="button"
              onClick={clear}
              disabled={saving}
              className="h-8 px-3 rounded-[8px] bg-[#F4F6FA] text-[#6B7194] text-[12px] font-medium hover:bg-[#E9EBF2]"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setType(item.discountType || 'none');
              setValue(item.discountValue != null ? String(item.discountValue) : '0');
            }}
            className="h-8 px-3 rounded-[8px] text-[#9CA3C0] text-[12px] font-medium hover:text-[#1A1D2B]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Invoice-level discount editor                              */
/* ─────────────────────────────────────────────────────────── */

function InvoiceDiscountEditor({ pickup, onSave, locked }) {
  const [type, setType] = useState(pickup.discountType || 'none');
  const [value, setValue] = useState(
    pickup.discountValue != null ? String(pickup.discountValue) : '0'
  );
  const [saving, setSaving] = useState(false);

  // Re-sync when parent updates
  useEffect(() => {
    setType(pickup.discountType || 'none');
    setValue(pickup.discountValue != null ? String(pickup.discountValue) : '0');
  }, [pickup.discountType, pickup.discountValue]);

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;
  const appliedPercent = parseFloat(pickup.discountPercent) || 0;
  const subtotal = parseFloat(pickup.subtotal) || 0;
  const hasDiscount = type !== 'none' && parseFloat(value) > 0;

  // Live preview of invoice-level discount amount (not applied until saved)
  const previewAmount = (() => {
    const v = parseFloat(value) || 0;
    if (type === 'percentage') return (subtotal * v) / 100;
    if (type === 'fixed') return Math.min(v, subtotal);
    return 0;
  })();

  const save = async () => {
    setSaving(true);
    await onSave({ discount_type: type, discount_value: parseFloat(value) || 0 });
    setSaving(false);
  };

  return (
    <div className="mt-5 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-bold text-[#1A1D2B]">Invoice Discount</h4>
        {appliedPercent > 0 && (
          <span className="px-2 py-0.5 rounded-md bg-[rgba(99,102,241,0.08)] text-[#6366F1] text-[11px] font-semibold">
            {appliedPercent.toFixed(2)}% effective
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={locked}
          className="h-9 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] outline-none disabled:opacity-50"
        >
          <option value="none">No discount</option>
          <option value="percentage">% off</option>
          <option value="fixed">$ off</option>
        </select>
        {type !== 'none' && (
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min="0"
            step="0.01"
            disabled={locked}
            className="h-9 w-28 px-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] outline-none tabular-nums disabled:opacity-50"
            placeholder={type === 'percentage' ? 'e.g. 10' : 'e.g. 25.00'}
          />
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || locked}
          className="h-9 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Apply'}
        </button>
      </div>
      {hasDiscount && previewAmount > 0 && (
        <p className="mt-2 text-[11.5px] text-[#6B7194]">
          Preview: subtotal {fmt(subtotal)} − {fmt(previewAmount)} = <span className="font-bold text-[#1A1D2B] tabular-nums">{fmt(Math.max(0, subtotal - previewAmount))}</span>
        </p>
      )}
      {locked && (
        <p className="mt-2 text-[11px] text-[#9CA3C0]">Invoice is paid — discounts locked.</p>
      )}
    </div>
  );
}
