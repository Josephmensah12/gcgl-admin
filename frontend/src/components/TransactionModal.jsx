import { useState } from 'react';
import axios from 'axios';

const METHODS = ['Cash', 'Check', 'Zelle', 'Square', 'Other'];

export default function TransactionModal({ invoice, transactionType = 'PAYMENT', onClose, onSuccess }) {
  const isRefund = transactionType === 'REFUND';
  const maxAmount = isRefund
    ? parseFloat(invoice.amountPaid) || 0
    : Math.max(0, (parseFloat(invoice.finalTotal) || 0) - (parseFloat(invoice.amountPaid) || 0));

  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [method, setMethod] = useState('Cash');
  const [otherText, setOtherText] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) { setError('Comment is required'); return; }
    if (method === 'Other' && !otherText.trim()) { setError('Please specify the payment method'); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`/api/v1/invoices/${invoice.id}/transactions`, {
        transaction_type: transactionType,
        amount: parseFloat(amount),
        payment_method: method,
        payment_method_other_text: method === 'Other' ? otherText.trim() : null,
        comment: comment.trim(),
        payment_date: date,
      });
      onSuccess(res.data.data.invoice);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to record transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 gc-backdrop-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 gc-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className={`px-6 py-4 border-b rounded-t-xl ${isRefund ? 'bg-orange-50' : 'bg-green-50'}`}>
          <h2 className="text-lg font-semibold">{isRefund ? 'Record Refund' : 'Receive Payment'}</h2>
          <p className="text-sm text-gray-500">
            Invoice #{invoice.invoiceNumber} &middot; {isRefund ? 'Paid' : 'Balance'}: ${maxAmount.toFixed(2)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500 text-sm">$</span>
              <input type="number" step="0.01" min="0.01" max={maxAmount} value={amount}
                onChange={(e) => setAmount(e.target.value)} required
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none">
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {method === 'Other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specify Method *</label>
              <input type="text" value={otherText} onChange={(e) => setOtherText(e.target.value)}
                placeholder="e.g., PayPal, Wire Transfer"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment *</label>
            <input type="text" value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={isRefund ? 'Reason for refund...' : 'e.g., Zelle to 346-XXX-XXXX'} required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            <p className="mt-1 text-xs text-gray-400">Describe how {isRefund ? 'refund was given' : 'payment was received'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className={`flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50
                ${isRefund ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'}`}>
              {loading ? 'Recording...' : isRefund ? 'Record Refund' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
