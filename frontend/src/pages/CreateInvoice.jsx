import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import { shipmentDateRange } from '../utils/shipmentLabel.jsx';
import toast from 'react-hot-toast';
import LineItemPicker from '../components/LineItemPicker';

export default function CreateInvoice() {
  const { onMenuClick } = useLayout();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=customer, 2=recipient, 3=items, 4=review

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ fullName: '', email: '', phone: '', address: '' });

  // Recipient
  const [recipients, setRecipients] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [showNewRecipient, setShowNewRecipient] = useState(false);
  const [newRecipient, setNewRecipient] = useState({ firstName: '', lastName: '', phone: '', city: '', country: 'Ghana', address: '' });

  // Items
  const [lineItems, setLineItems] = useState([]);

  // Shipment
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  // Load shipments
  useEffect(() => {
    axios.get('/api/v1/shipments/active').then((res) => {
      setShipments(res.data.data);
      // Auto-select only if there's exactly one collecting shipment
      const collecting = res.data.data.filter((s) => s.status === 'collecting');
      if (collecting.length === 1) setSelectedShipment(collecting[0].id);
    }).catch(() => {});
  }, []);

  // Customer search
  const searchCustomers = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomerResults([]); return; }
    try {
      const res = await axios.get('/api/v1/create-invoice/search-customers', { params: { q } });
      setCustomerResults(res.data.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchCustomers(customerSearch), 300);
    return () => clearTimeout(timer);
  }, [customerSearch, searchCustomers]);

  // Load recipients when customer selected
  useEffect(() => {
    if (!selectedCustomer) return;
    axios.get(`/api/v1/create-invoice/customers/${selectedCustomer.id}/recipients`)
      .then((res) => {
        setRecipients(res.data.data);
        const def = res.data.data.find((r) => r.isDefault);
        if (def) setSelectedRecipient(def);
      }).catch(() => {});
  }, [selectedCustomer]);

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearch('');
    setCustomerResults([]);
    setStep(2);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.fullName || !newCustomer.email || !newCustomer.phone || !newCustomer.address) return;
    try {
      const res = await axios.post('/api/v1/create-invoice/customers', newCustomer);
      setSelectedCustomer(res.data.data);
      setShowNewCustomer(false);
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create customer');
    }
  };

  const handleCreateRecipient = async () => {
    if (!newRecipient.firstName || !newRecipient.lastName || !newRecipient.phone || !newRecipient.city || !newRecipient.address) return;
    try {
      const res = await axios.post(`/api/v1/create-invoice/customers/${selectedCustomer.id}/recipients`, { ...newRecipient, isDefault: recipients.length === 0 });
      setSelectedRecipient(res.data.data);
      setRecipients((prev) => [...prev, res.data.data]);
      setShowNewRecipient(false);
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create recipient');
    }
  };

  const updateQty = (id, qty) => {
    const q = Math.max(1, parseInt(qty) || 1);
    setLineItems((prev) => prev.map((li) => li.id === id ? { ...li, quantity: q } : li));
  };

  const removeItem = (id) => setLineItems((prev) => prev.filter((li) => li.id !== id));

  const subtotal = lineItems.reduce((s, li) => s + li.finalPrice * li.quantity, 0);
  const totalItems = lineItems.reduce((s, li) => s + li.quantity, 0);

  // Submit
  const handleSubmit = async () => {
    if (!selectedCustomer || !selectedRecipient || lineItems.length === 0) return;
    setSubmitting(true);
    try {
      const res = await axios.post('/api/v1/create-invoice', {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.fullName,
        customerEmail: selectedCustomer.email,
        customerAddress: selectedCustomer.address,
        customerPhone: selectedCustomer.phone,
        recipientId: selectedRecipient.id,
        recipientName: `${selectedRecipient.firstName} ${selectedRecipient.lastName}`,
        recipientPhone: selectedRecipient.phone,
        recipientAddress: `${selectedRecipient.address}, ${selectedRecipient.city}, ${selectedRecipient.country}`,
        subtotal, totalDiscount: 0, finalTotal: subtotal,
        originalItemCount: totalItems,
        shipmentId: selectedShipment || null,
        lineItems: lineItems.map((li) => ({
          id: li.id, type: li.type, catalogItemId: li.catalogItemId,
          catalogName: li.catalogName,
          description: li.description || null,
          notes: li.notes || null,
          quantity: li.quantity, basePrice: li.basePrice, finalPrice: li.finalPrice,
          dimensions: li.dimensions, discount: null,
          photos: li.photos || [],
        })),
      });
      navigate(`/pickups/${res.data.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n) => `$${(n || 0).toFixed(2)}`;

  return (
    <>
      <PageHeader title="Create Invoice" subtitle="Customer → recipient → items → review" onMenuClick={onMenuClick} hideSearch />
    <div className="max-w-3xl mx-auto space-y-6">
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
      {/* Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {['Customer', 'Recipient', 'Items', 'Review'].map((label, i) => (
            <div key={label} className="flex items-center">
              <button onClick={() => { if (i + 1 < step) setStep(i + 1); }}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                  ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {step > i + 1 ? '\u2713' : i + 1}
              </button>
              <span className={`ml-1 text-xs font-medium ${step === i + 1 ? 'text-primary-600' : 'text-gray-400'}`}>{label}</span>
              {i < 3 && <div className={`w-8 h-0.5 mx-1 ${step > i + 1 ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <button onClick={() => navigate('/pickups')}
          className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium">
          Cancel
        </button>
      </div>

      {/* Step 1: Customer */}
      {step === 1 && (
        <div className="gc-card p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Select Customer</h2>

          <div className="relative mb-4">
            <input type="text" value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            {customerResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {customerResults.map((c) => (
                  <button key={c.id} onClick={() => selectCustomer(c)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50">
                    <p className="font-medium text-gray-900">{c.fullName}</p>
                    <p className="text-xs text-gray-500">{c.phone} &middot; {c.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="text-center text-sm text-gray-400 mb-4">or</div>

          {!showNewCustomer ? (
            <button onClick={() => setShowNewCustomer(true)}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600">
              + Create New Customer
            </button>
          ) : (
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-sm">New Customer</h3>
              {['fullName', 'email', 'phone', 'address'].map((f) => (
                <input key={f} type="text" placeholder={f === 'fullName' ? 'Full Name' : f.charAt(0).toUpperCase() + f.slice(1)}
                  value={newCustomer[f]} onChange={(e) => setNewCustomer((p) => ({ ...p, [f]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              ))}
              <div className="flex gap-2">
                <button onClick={() => setShowNewCustomer(false)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button onClick={handleCreateCustomer} className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Create & Continue</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Recipient */}
      {step === 2 && (
        <div className="gc-card p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Select Recipient</h2>
          <p className="text-sm text-gray-500 mb-4">Ghana delivery address for {selectedCustomer?.fullName}</p>

          {recipients.length > 0 && (
            <div className="space-y-2 mb-4">
              {recipients.map((r) => (
                <button key={r.id} onClick={() => { setSelectedRecipient(r); setStep(3); }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors
                    ${selectedRecipient?.id === r.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="font-medium">{r.firstName} {r.lastName} {r.isDefault && <span className="text-xs text-primary-600">(Default)</span>}</p>
                  <p className="text-sm text-gray-500">{r.phone} &middot; {r.city}, {r.country}</p>
                  <p className="text-xs text-gray-400">{r.address}</p>
                </button>
              ))}
            </div>
          )}

          {!showNewRecipient ? (
            <button onClick={() => setShowNewRecipient(true)}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600">
              + Add New Recipient
            </button>
          ) : (
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-sm">New Ghana Recipient</h3>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="First Name" value={newRecipient.firstName}
                  onChange={(e) => setNewRecipient((p) => ({ ...p, firstName: e.target.value }))}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                <input type="text" placeholder="Last Name" value={newRecipient.lastName}
                  onChange={(e) => setNewRecipient((p) => ({ ...p, lastName: e.target.value }))}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <input type="text" placeholder="Phone" value={newRecipient.phone}
                onChange={(e) => setNewRecipient((p) => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="City" value={newRecipient.city}
                  onChange={(e) => setNewRecipient((p) => ({ ...p, city: e.target.value }))}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                <input type="text" placeholder="Country" value={newRecipient.country}
                  onChange={(e) => setNewRecipient((p) => ({ ...p, country: e.target.value }))}
                  className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <input type="text" placeholder="Address" value={newRecipient.address}
                onChange={(e) => setNewRecipient((p) => ({ ...p, address: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              <div className="flex gap-2">
                <button onClick={() => setShowNewRecipient(false)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button onClick={handleCreateRecipient} className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Add & Continue</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Items */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="gc-card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add Items</h2>
            <LineItemPicker
              onAdd={(item) => {
                // Match the existing local lineItems shape used by handleSubmit
                const local = {
                  id: crypto.randomUUID(),
                  type: item.type,
                  catalogItemId: item.catalogItemId || null,
                  catalogName: item.catalogName || null,
                  description: item.description || '',
                  notes: item.notes || '',
                  quantity: item.quantity,
                  basePrice: item.base_price,
                  finalPrice: item.base_price,
                  dimensions: item.dimensions || null,
                  photos: item.photos || [],
                };
                // Catalog items merge by catalogItemId (matches old addCatalogItem behavior)
                if (local.catalogItemId) {
                  const idx = lineItems.findIndex((li) => li.catalogItemId === local.catalogItemId);
                  if (idx !== -1) {
                    setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, quantity: li.quantity + 1 } : li));
                    return;
                  }
                }
                setLineItems((prev) => [...prev, local]);
              }}
            />
          </div>

          {/* Added items */}
          {lineItems.length > 0 && (
            <div className="gc-card p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Added Items ({lineItems.length})</h3>
              <div className="space-y-2">
                {lineItems.map((li) => (
                  <div key={li.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{li.catalogName || li.description || 'Custom Item'}</p>
                        <p className="text-xs text-gray-500">
                          Qty: {li.quantity} x {fmt(li.finalPrice)} = {fmt(li.finalPrice * li.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(li.id, li.quantity - 1)} className="w-7 h-7 rounded bg-gray-200 text-sm font-bold">-</button>
                        <span className="w-8 text-center text-sm font-semibold">{li.quantity}</span>
                        <button onClick={() => updateQty(li.id, li.quantity + 1)} className="w-7 h-7 rounded bg-gray-200 text-sm font-bold">+</button>
                      </div>
                      <button onClick={() => removeItem(li.id)} className="w-7 h-7 rounded-full bg-red-100 text-red-500 text-sm">x</button>
                    </div>
                    {/* Notes */}
                    <input type="text" placeholder="Add notes..."
                      value={li.notes || ''}
                      onChange={(e) => setLineItems((prev) => prev.map((item) => item.id === li.id ? { ...item, notes: e.target.value } : item))}
                      className="w-full mt-2 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 placeholder-gray-400 focus:ring-1 focus:ring-primary-400 outline-none" />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                <span className="font-semibold text-gray-900">Total ({totalItems} items)</span>
                <span className="text-xl font-bold text-green-600">{fmt(subtotal)}</span>
              </div>
              <button onClick={() => setStep(4)}
                className="w-full mt-4 px-4 py-3 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700">
                Review Invoice
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="gc-card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Review Invoice</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Customer</p>
                <p className="font-semibold">{selectedCustomer?.fullName}</p>
                <p className="text-sm text-gray-500">{selectedCustomer?.phone}</p>
                <p className="text-sm text-gray-500">{selectedCustomer?.email}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Recipient (Ghana)</p>
                <p className="font-semibold">{selectedRecipient?.firstName} {selectedRecipient?.lastName}</p>
                <p className="text-sm text-gray-500">{selectedRecipient?.phone}</p>
                <p className="text-sm text-gray-500">{selectedRecipient?.city}, {selectedRecipient?.country}</p>
              </div>
            </div>

            <h3 className="font-semibold text-gray-900 mb-2">Items</h3>
            <div className="space-y-2 mb-4">
              {lineItems.map((li) => (
                <div key={li.id} className="py-2 border-b border-gray-100">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-sm">{li.catalogName || li.description}</span>
                      <span className="text-xs text-gray-500 ml-2">x{li.quantity}</span>
                    </div>
                    <span className="font-semibold">{fmt(li.finalPrice * li.quantity)}</span>
                  </div>
                  {li.notes && <p className="text-xs text-gray-500 mt-0.5">{li.notes}</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className="text-green-600">{fmt(subtotal)}</span>
            </div>
          </div>

          {/* Shipment */}
          {shipments.length > 0 && (
            <div className="gc-card p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Shipment</label>
              <select value={selectedShipment} onChange={(e) => setSelectedShipment(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm">
                <option value="">-- Unassigned --</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({shipmentDateRange(s)}) — {s.status}
                  </option>
                ))}
              </select>
              {!selectedShipment && shipments.filter((s) => s.status === 'collecting').length > 1 && (
                <p className="text-xs text-amber-600 mt-1">Multiple shipments are collecting — please select one.</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Back to Items
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
