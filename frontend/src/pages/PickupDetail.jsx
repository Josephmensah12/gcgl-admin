import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import TransactionModal from '../components/TransactionModal';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';
import toast from 'react-hot-toast';

export default function PickupDetail() {
  const { onMenuClick } = useLayout();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromShipment = location.state?.fromShipment;
  const shipmentName = location.state?.shipmentName;
  const [pickup, setPickup] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
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

  // Draft state for discount edits — staged locally, only persisted when
  // the page-level "Save Changes" button is clicked.
  // draftInvoiceDiscount: { discount_type, discount_value } | null
  // draftLineDiscounts: { [lineItemId]: { discount_type, discount_value } }
  const [draftInvoiceDiscount, setDraftInvoiceDiscount] = useState(null);
  const [draftLineDiscounts, setDraftLineDiscounts] = useState({});
  const [savingDrafts, setSavingDrafts] = useState(false);

  const isDirty = draftInvoiceDiscount !== null || Object.keys(draftLineDiscounts).length > 0;

  const discardDrafts = () => {
    setDraftInvoiceDiscount(null);
    setDraftLineDiscounts({});
  };

  const saveDrafts = async () => {
    setSavingDrafts(true);
    try {
      // Apply line-item drafts first, then invoice-level. Each response
      // updates pickup, so the final call leaves us with the freshest state.
      let lastPickup = null;
      for (const [liId, payload] of Object.entries(draftLineDiscounts)) {
        const res = await axios.patch(`/api/v1/pickups/${id}/items/${liId}/discount`, payload);
        lastPickup = res.data.data;
      }
      if (draftInvoiceDiscount) {
        const res = await axios.patch(`/api/v1/pickups/${id}/discount`, draftInvoiceDiscount);
        lastPickup = res.data.data;
      }
      if (lastPickup) setPickup((prev) => ({ ...prev, ...lastPickup }));
      discardDrafts();
    } catch (err) {
      console.error('Save drafts error:', err);
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
      toast.success(`Failed to save changes (HTTP ${status || 'net-err'}): ${msg}`);
    } finally {
      setSavingDrafts(false);
    }
  };

  // Frontend mirror of the backend discount math — used for live preview while
  // drafts are unsaved. Returns { subtotal, totalDiscount, finalTotal, lines }
  // where each line includes its effective pre/disc/final values.
  const computePreview = () => {
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const lines = (pickup.lineItems || []).map((li) => {
      const draft = draftLineDiscounts[li.id];
      const dt = draft?.discount_type ?? li.discountType ?? 'none';
      const dv = parseFloat(draft?.discount_value ?? li.discountValue ?? 0) || 0;
      const qty = parseInt(li.quantity) || 0;
      const unit = parseFloat(li.basePrice) || 0;
      const pre = round2(qty * unit);
      let da = 0;
      if (dt === 'percentage' && dv > 0) da = round2(pre * (dv / 100));
      else if (dt === 'fixed' && dv > 0) da = round2(Math.min(dv, pre));
      return { ...li, _pre: pre, _da: da, _final: round2(pre - da), _dt: dt, _dv: dv };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l._final, 0));
    const lineDiscSum = round2(lines.reduce((s, l) => s + l._da, 0));
    const invDisc = draftInvoiceDiscount ?? { discount_type: pickup.discountType, discount_value: pickup.discountValue };
    const idt = invDisc?.discount_type || 'none';
    const idv = parseFloat(invDisc?.discount_value || 0) || 0;
    let invDiscAmt = 0;
    if (idt === 'percentage' && idv > 0) invDiscAmt = round2(subtotal * (idv / 100));
    else if (idt === 'fixed' && idv > 0) invDiscAmt = round2(Math.min(idv, subtotal));
    const finalTotal = round2(subtotal - invDiscAmt);
    return {
      subtotal,
      totalDiscount: round2(lineDiscSum + invDiscAmt),
      finalTotal,
      lines,
      invDiscAmt,
      invDiscType: idt,
      invDiscValue: idv,
    };
  };

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
      toast.error(err.response?.data?.error?.message || 'Save failed');
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
      toast.error(err.response?.data?.error?.message || 'Void failed');
    }
  };

  const handleCancelInvoice = async () => {
    setCancelling(true);
    try {
      await axios.post(`/api/v1/pickups/${id}/cancel`, { reason: cancelReason.trim() || 'Invoice cancelled' });
      setShowCancelConfirm(false);
      setCancelReason('');
      navigate(fromShipment ? `/shipments/${fromShipment}` : '/pickups');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;

  if (loading) return <LoadingSpinner />;
  if (!pickup) return <p className="text-center py-12 text-gray-500">Invoice not found</p>;

  const preview = computePreview();
  const displaySubtotal = preview.subtotal;
  const displayDiscount = preview.totalDiscount;
  const displayFinal = preview.finalTotal;
  const balanceDue = Math.max(0, displayFinal - (parseFloat(pickup.amountPaid) || 0));
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

      <Link to={fromShipment ? `/shipments/${fromShipment}` : '/pickups'} className="inline-flex items-center text-[13px] text-[#6366F1] hover:text-[#4F46E5] gap-1 mb-4 font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {fromShipment ? `Back to ${shipmentName || 'Shipment'}` : 'Back to Invoices'}
      </Link>

      {/* Sticky dirty banner — appears when drafts exist */}
      {isDirty && (
        <div className="sticky top-4 z-20 mb-4 bg-[#6366F1] text-white rounded-[12px] shadow-[0_8px_24px_rgba(99,102,241,0.35)] px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">Unsaved changes</p>
              <p className="text-[11.5px] text-white/75">
                {Object.keys(draftLineDiscounts).length > 0 && `${Object.keys(draftLineDiscounts).length} line discount${Object.keys(draftLineDiscounts).length === 1 ? '' : 's'}`}
                {Object.keys(draftLineDiscounts).length > 0 && draftInvoiceDiscount && ' · '}
                {draftInvoiceDiscount && 'invoice discount'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={discardDrafts}
              disabled={savingDrafts}
              className="h-9 px-3 rounded-[8px] bg-white/10 hover:bg-white/20 text-[12.5px] font-semibold transition-colors disabled:opacity-50"
            >
              Discard
            </button>
            <button
              onClick={saveDrafts}
              disabled={savingDrafts}
              className="h-9 px-4 rounded-[8px] bg-white text-[#6366F1] text-[12.5px] font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors"
            >
              {savingDrafts ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

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

      {/* Cancel Invoice Confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !cancelling && setShowCancelConfirm(false)}>
          <div className="bg-white rounded-[16px] p-6 w-full max-w-sm mx-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-600 mb-2">Cancel Invoice #{pickup.invoiceNumber}?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will void all active payments, unassign from any shipment, and mark the invoice as cancelled. This cannot be undone.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer withdrew, duplicate entry"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowCancelConfirm(false); setCancelReason(''); }}
                disabled={cancelling}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                Keep Invoice
              </button>
              <button onClick={handleCancelInvoice}
                disabled={cancelling}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
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
                    {pickup.status !== 'cancelled' && (
                      <button onClick={() => setShowCancelConfirm(true)}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                        Cancel Invoice
                      </button>
                    )}
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
                  ${pickup.status === 'cancelled' ? 'bg-red-100 text-red-700'
                    : pickup.paymentStatus === 'paid' ? 'bg-green-100 text-green-700'
                    : pickup.paymentStatus === 'partial' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'}`}>
                  {pickup.status === 'cancelled' ? 'cancelled' : pickup.paymentStatus}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {pickup.warehouseDays}d in warehouse
                </span>
              </div>
            </div>

            {/* Line Items */}
            <h3 className="font-semibold text-gray-900 mb-3">Line Items</h3>
            <div className="space-y-3">
              {preview.lines.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  locked={pickup.paymentStatus === 'paid'}
                  onStage={(payload) => {
                    setDraftLineDiscounts((prev) => ({ ...prev, [item.id]: payload }));
                  }}
                  onClearDraft={() => {
                    setDraftLineDiscounts((prev) => {
                      const next = { ...prev };
                      delete next[item.id];
                      return next;
                    });
                  }}
                  hasDraft={Boolean(draftLineDiscounts[item.id])}
                  onRemove={pickup.paymentStatus !== 'paid' ? async () => {
                    if (!confirm('Remove this item?')) return;
                    try {
                      const res = await axios.delete(`/api/v1/pickups/${id}/items/${item.id}`);
                      setPickup((prev) => ({ ...prev, ...res.data.data }));
                    } catch (err) {
                      toast.error(err.response?.data?.error?.message || 'Failed to remove');
                    }
                  } : null}
                />
              ))}
            </div>

            {/* Add service item */}
            <AddServiceItem
              locked={pickup.paymentStatus === 'paid'}
              onAdd={async (payload) => {
                try {
                  const res = await axios.post(`/api/v1/pickups/${id}/items`, payload);
                  setPickup((prev) => ({ ...prev, ...res.data.data }));
                } catch (err) {
                  toast.error(err.response?.data?.error?.message || 'Failed to add item');
                }
              }}
            />

            {/* Totals (live preview from drafts) */}
            <div className="border-t border-gray-200 mt-4 pt-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums">{fmt(displaySubtotal)}</span>
              </div>
              {displayDiscount > 0.01 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="tabular-nums text-red-600">−{fmt(displayDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
                <span className="text-gray-700 font-medium">Total</span>
                <span className="font-bold text-lg tabular-nums">{fmt(displayFinal)}</span>
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

            {/* Invoice-level discount editor (stages to draft) */}
            <InvoiceDiscountEditor
              pickup={pickup}
              preview={preview}
              draft={draftInvoiceDiscount}
              locked={pickup.paymentStatus === 'paid'}
              onStage={(payload) => setDraftInvoiceDiscount(payload)}
              onClearDraft={() => setDraftInvoiceDiscount(null)}
            />
          </div>

          {/* Payment Actions */}
          <div className="flex gap-3 flex-wrap">
            {balanceDue > 0 && (
              <button onClick={() => setModal('PAYMENT')}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors">
                Receive Payment
              </button>
            )}
            {balanceDue > 0 && (
              <SquarePayButton invoiceId={id} balanceDue={balanceDue} />
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
/*  Square Pay Now button                                      */
/* ─────────────────────────────────────────────────────────── */

function SquarePayButton({ invoiceId, balanceDue }) {
  const [state, setState] = useState('idle'); // idle | amount | loading | done | error
  const [amount, setAmount] = useState(String(balanceDue.toFixed(2)));
  const [link, setLink] = useState(null);
  const [linkAmount, setLinkAmount] = useState(0);
  const [error, setError] = useState(null);

  const generate = async () => {
    const payAmount = parseFloat(amount) || 0;
    if (payAmount <= 0 || payAmount > balanceDue) {
      setError(`Amount must be between $0.01 and $${balanceDue.toFixed(2)}`);
      return;
    }
    setState('loading');
    setError(null);
    try {
      const res = await axios.post(`/api/v1/pickups/${invoiceId}/pay`, { amount: payAmount });
      setLink(res.data.data.url);
      setLinkAmount(res.data.data.amount || payAmount);
      setState('done');
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      const code = err.response?.data?.error?.code;
      if (code === 'SQUARE_NOT_CONFIGURED') {
        setError('Square not configured. Set SQUARE_ACCESS_TOKEN in Railway.');
      } else {
        setError(msg);
      }
      setState('error');
    }
  };

  if (state === 'done' && link) {
    return (
      <div className="flex-1 flex flex-col gap-2">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#1A1D2B] text-white rounded-xl text-sm font-semibold hover:bg-[#2D3142] transition-colors text-center"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.01 2C2.9 2 2 2.9 2 4.01v15.98C2 21.1 2.9 22 4.01 22h15.98C21.1 22 22 21.1 22 19.99V4.01C22 2.9 21.1 2 19.99 2H4.01zm9.61 15.57c-.71.71-1.86.71-2.57 0l-4.62-4.62a1.82 1.82 0 010-2.57l4.62-4.62a1.82 1.82 0 012.57 0l4.62 4.62c.71.71.71 1.86 0 2.57l-4.62 4.62z" />
          </svg>
          Pay ${linkAmount.toFixed(2)} with Square
        </a>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { navigator.clipboard.writeText(link); }}
            className="text-[11px] text-[#6366F1] font-semibold hover:text-[#4F46E5]"
          >
            Copy link
          </button>
          <button
            onClick={() => { setState('amount'); setAmount(String(balanceDue.toFixed(2))); setLink(null); }}
            className="text-[11px] text-[#9CA3C0] font-medium hover:text-[#6B7194]"
          >
            Change amount
          </button>
        </div>
      </div>
    );
  }

  if (state === 'amount' || state === 'error') {
    return (
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-[13px] text-[#9CA3C0]">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              max={balanceDue}
              step="0.01"
              className="w-full h-10 pl-7 pr-3 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] outline-none tabular-nums"
              placeholder={balanceDue.toFixed(2)}
            />
          </div>
          <button
            onClick={generate}
            disabled={state === 'loading'}
            className="h-10 px-4 rounded-[10px] bg-[#1A1D2B] text-white text-[12px] font-semibold hover:bg-[#2D3142] disabled:opacity-50 whitespace-nowrap"
          >
            Generate Link
          </button>
        </div>
        <p className="text-[10px] text-[#9CA3C0] text-center">
          Balance: ${balanceDue.toFixed(2)} · Enter partial or full amount
        </p>
        {error && <p className="text-[11px] text-[#EF4444] text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-1">
      <button
        onClick={() => setState('amount')}
        disabled={state === 'loading'}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#1A1D2B] text-white rounded-xl text-sm font-semibold hover:bg-[#2D3142] disabled:opacity-50 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.01 2C2.9 2 2 2.9 2 4.01v15.98C2 21.1 2.9 22 4.01 22h15.98C21.1 22 22 21.1 22 19.99V4.01C22 2.9 21.1 2 19.99 2H4.01zm9.61 15.57c-.71.71-1.86.71-2.57 0l-4.62-4.62a1.82 1.82 0 010-2.57l4.62-4.62a1.82 1.82 0 012.57 0l4.62 4.62c.71.71.71 1.86 0 2.57l-4.62 4.62z" />
        </svg>
        Pay with Square (${balanceDue.toFixed(2)})
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Line item row with inline discount editor                  */
/* ─────────────────────────────────────────────────────────── */

function AddServiceItem({ locked, onAdd }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  if (locked) return null;

  const submit = async () => {
    if (!desc.trim() || !price) return;
    setSaving(true);
    await onAdd({
      description: desc.trim(),
      quantity: parseInt(qty) || 1,
      base_price: parseFloat(price) || 0,
      type: 'service',
    });
    setSaving(false);
    setOpen(false);
    setDesc('');
    setQty('1');
    setPrice('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#6366F1] hover:text-[#4F46E5]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add service item (packing, handling, etc.)
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 rounded-[10px] bg-[#F4F6FA] border border-black/[0.04]">
      <h4 className="text-[13px] font-bold text-[#1A1D2B] mb-3">Add Service Item</h4>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Description</label>
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Packing service, Handling fee"
            className="gc-input"
            autoFocus
          />
        </div>
        <div className="w-20">
          <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Qty</label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            min="1"
            className="gc-input text-center"
          />
        </div>
        <div className="w-28">
          <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">Price ($)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min="0"
            step="0.01"
            placeholder="0.00"
            className="gc-input"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !desc.trim() || !price}
          className="h-10 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 px-3 rounded-[10px] text-[#9CA3C0] text-[13px] font-medium hover:text-[#1A1D2B]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LineItemRow({ item, onStage, onClearDraft, locked, hasDraft, onRemove }) {
  // `item` here is the preview-augmented line from computePreview(),
  // so it carries _pre/_da/_final/_dt/_dv — these reflect the current
  // draft if any, otherwise the persisted values.
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(item._dt || 'none');
  const [value, setValue] = useState(item._dv != null ? String(item._dv) : '0');

  // Keep local editor state in sync when the underlying item changes
  // (e.g., drafts cleared by the parent Discard button)
  useEffect(() => {
    setType(item._dt || 'none');
    setValue(item._dv != null ? String(item._dv) : '0');
  }, [item._dt, item._dv]);

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;
  const preDiscount = item._pre || 0;
  const discountAmt = item._da || 0;
  const finalPrice = item._final || 0;
  const hasDiscount = discountAmt > 0.01;

  const stage = () => {
    onStage({ discount_type: type, discount_value: parseFloat(value) || 0 });
    setEditing(false);
  };

  const clear = () => {
    setType('none');
    setValue('0');
    onStage({ discount_type: 'none', discount_value: 0 });
    setEditing(false);
  };

  const revert = () => {
    onClearDraft();
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
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={locked}
            onClick={() => setEditing(true)}
            className="text-[11px] font-semibold text-[#6366F1] hover:text-[#4F46E5] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {hasDiscount ? 'Edit discount' : 'Add discount'}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-[11px] font-semibold text-[#EF4444] hover:text-[#DC2626]"
            >
              Remove
            </button>
          )}
          {hasDraft && (
            <>
              <span className="text-[10px] font-semibold text-[#F59E0B] uppercase tracking-wide">· unsaved</span>
              <button
                type="button"
                onClick={revert}
                className="text-[11px] text-[#9CA3C0] hover:text-[#1A1D2B]"
              >
                Revert
              </button>
            </>
          )}
        </div>
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
            onClick={stage}
            className="h-8 px-3 rounded-[8px] bg-[#6366F1] text-white text-[12px] font-semibold hover:bg-[#4F46E5]"
          >
            Apply
          </button>
          {hasDiscount && (
            <button
              type="button"
              onClick={clear}
              className="h-8 px-3 rounded-[8px] bg-[#F4F6FA] text-[#6B7194] text-[12px] font-medium hover:bg-[#E9EBF2]"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setType(item._dt || 'none');
              setValue(item._dv != null ? String(item._dv) : '0');
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

function InvoiceDiscountEditor({ pickup, preview, draft, onStage, onClearDraft, locked }) {
  // Effective (draft-aware) type + value. Draft wins if present.
  const effectiveType = draft?.discount_type ?? (pickup.discountType || 'none');
  const effectiveValue = draft?.discount_value ?? pickup.discountValue ?? 0;

  const [type, setType] = useState(effectiveType);
  const [value, setValue] = useState(effectiveValue != null ? String(effectiveValue) : '0');

  useEffect(() => {
    setType(effectiveType);
    setValue(effectiveValue != null ? String(effectiveValue) : '0');
  }, [effectiveType, effectiveValue]);

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;
  const subtotal = preview.subtotal;
  const hasDraft = draft !== null && draft !== undefined;

  // Live preview of invoice-level discount amount from the current editor state
  const editorPreviewAmount = (() => {
    const v = parseFloat(value) || 0;
    if (type === 'percentage') return (subtotal * v) / 100;
    if (type === 'fixed') return Math.min(v, subtotal);
    return 0;
  })();

  const stage = () => {
    onStage({ discount_type: type, discount_value: parseFloat(value) || 0 });
  };

  const revert = () => {
    onClearDraft();
    setType(pickup.discountType || 'none');
    setValue(pickup.discountValue != null ? String(pickup.discountValue) : '0');
  };

  return (
    <div className="mt-5 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-bold text-[#1A1D2B]">Invoice Discount</h4>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <span className="px-2 py-0.5 rounded-md bg-[rgba(245,158,11,0.12)] text-[#B45309] text-[10px] font-semibold uppercase tracking-wide">
              unsaved
            </span>
          )}
          {parseFloat(pickup.discountPercent) > 0 && !hasDraft && (
            <span className="px-2 py-0.5 rounded-md bg-[rgba(99,102,241,0.08)] text-[#6366F1] text-[11px] font-semibold">
              {parseFloat(pickup.discountPercent).toFixed(2)}% saved
            </span>
          )}
        </div>
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
          onClick={stage}
          disabled={locked}
          className="h-9 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50"
        >
          Apply
        </button>
        {hasDraft && (
          <button
            type="button"
            onClick={revert}
            className="h-9 px-3 rounded-[10px] text-[#9CA3C0] text-[13px] font-medium hover:text-[#1A1D2B]"
          >
            Revert
          </button>
        )}
      </div>
      {type !== 'none' && editorPreviewAmount > 0 && (
        <p className="mt-2 text-[11.5px] text-[#6B7194]">
          Preview: subtotal {fmt(subtotal)} − {fmt(editorPreviewAmount)} = <span className="font-bold text-[#1A1D2B] tabular-nums">{fmt(Math.max(0, subtotal - editorPreviewAmount))}</span>
        </p>
      )}
      {hasDraft && (
        <p className="mt-1 text-[11px] text-[#F59E0B]">
          Staged — click "Save Changes" at the top to commit.
        </p>
      )}
      {locked && (
        <p className="mt-2 text-[11px] text-[#9CA3C0]">Invoice is paid — discounts locked.</p>
      )}
    </div>
  );
}
