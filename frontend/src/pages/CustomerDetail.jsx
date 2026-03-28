import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    axios.get(`/api/v1/customers/${id}`)
      .then((res) => {
        setCustomer(res.data.data);
        setForm({ fullName: res.data.data.fullName, email: res.data.data.email, phone: res.data.data.phone, address: res.data.data.address });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    try {
      const res = await axios.put(`/api/v1/customers/${id}`, form);
      setCustomer((prev) => ({ ...prev, ...res.data.data }));
      setEditing(false);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Update failed');
    }
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner />;
  if (!customer) return <p className="text-center py-12 text-gray-500">Customer not found</p>;

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700 gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Customers
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Customer Info</h2>
            <button onClick={() => setEditing(!editing)} className="text-sm text-primary-600 hover:text-primary-700">
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editing ? (
            <div className="space-y-3">
              {['fullName', 'email', 'phone', 'address'].map((field) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
                  <input
                    type="text"
                    value={form[field] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              ))}
              <button onClick={handleSave} className="w-full bg-primary-600 text-white py-2 rounded-lg text-sm hover:bg-primary-700">
                Save Changes
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Name</p>
                <p className="font-medium">{customer.fullName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p>{customer.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p>{customer.phone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Address</p>
                <p>{customer.address}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Shipping Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-sm text-gray-500">Total Shipments</span><span className="font-semibold">{customer.stats.totalInvoices}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Total Value</span><span className="font-semibold">{fmt(customer.stats.totalValue)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Paid</span><span className="font-semibold text-green-600">{fmt(customer.stats.paidValue)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Unpaid</span><span className="font-semibold text-red-600">{fmt(customer.stats.unpaidValue)}</span></div>
            </div>
          </div>

          {/* Recipients */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Ghana Recipients ({customer.recipients?.length || 0})</h3>
            <div className="space-y-2">
              {customer.recipients?.map((r) => (
                <div key={r.id} className="p-2 rounded-lg bg-gray-50">
                  <p className="font-medium text-sm">{r.firstName} {r.lastName}</p>
                  <p className="text-xs text-gray-500">{r.phone} &middot; {r.city}, {r.country}</p>
                </div>
              ))}
              {(!customer.recipients || customer.recipients.length === 0) && (
                <p className="text-sm text-gray-400">No recipients</p>
              )}
            </div>
          </div>
        </div>

        {/* Invoice History */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Shipping History</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {customer.invoices?.map((inv) => (
              <Link key={inv.id} to={`/pickups/${inv.id}`} className="block p-3 rounded-lg hover:bg-gray-50 border border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-primary-600">#{inv.invoiceNumber}</span>
                  <span className="font-semibold">${parseFloat(inv.finalTotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {inv.paymentStatus}
                  </span>
                </div>
              </Link>
            ))}
            {(!customer.invoices || customer.invoices.length === 0) && (
              <p className="text-center py-4 text-gray-400 text-sm">No shipping history</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
