import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';
import toast from 'react-hot-toast';

function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export default function CustomerDetail() {
  const { onMenuClick } = useLayout();
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
      toast.error(err.response?.data?.error?.message || 'Update failed');
    }
  };

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner />;
  if (!customer) return <p className="text-center py-12 text-[#9CA3C0]">Customer not found</p>;

  return (
    <>
      <PageHeader title={customer.fullName} subtitle="Customer details & shipping history" onMenuClick={onMenuClick} hideSearch />

      <Link to="/customers" className="inline-flex items-center text-[13px] text-[#6366F1] hover:text-[#4F46E5] gap-1 mb-4 font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Customers
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">
        {/* Customer Info */}
        <div className="gc-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="gc-card-title">Customer Info</h2>
            <button
              onClick={() => setEditing(!editing)}
              className="text-[12.5px] font-semibold text-[#6366F1] hover:text-[#4F46E5]"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-[52px] h-[52px] rounded-[12px] flex items-center justify-center text-white text-[16px] font-bold"
              style={{ background: 'linear-gradient(135deg, #6366F1, #3B82F6)' }}
            >
              {initialsOf(customer.fullName)}
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#1A1D2B]">{customer.fullName}</p>
              <p className="text-[11px] text-[#9CA3C0] uppercase tracking-wide mt-0.5">Customer</p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              {['fullName', 'email', 'phone', 'address'].map((field) => (
                <div key={field}>
                  <label className="block text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide mb-1">{field.replace(/([A-Z])/g, ' $1').trim()}</label>
                  <input
                    type="text"
                    value={form[field] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="gc-input"
                  />
                </div>
              ))}
              <button
                onClick={handleSave}
                className="w-full h-10 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5]"
              >
                Save Changes
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {[['Email', customer.email], ['Phone', customer.phone], ['Address', customer.address]].map(([k, v]) => (
                <div key={k} className="px-4 py-3 rounded-[10px] bg-[#F4F6FA]">
                  <p className="text-[10.5px] font-semibold text-[#9CA3C0] uppercase tracking-wide">{k}</p>
                  <p className="text-[13px] text-[#1A1D2B] mt-0.5 break-all">{v || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats + Recipients */}
        <div className="space-y-[18px]">
          <div className="gc-card p-6">
            <h3 className="gc-card-title mb-4">Shipping Stats</h3>
            <div className="space-y-2.5">
              {[
                ['Total Shipments', customer.stats.totalInvoices, '#1A1D2B'],
                ['Total Value', fmt(customer.stats.totalValue), '#1A1D2B'],
                ['Paid', fmt(customer.stats.paidValue), '#10B981'],
                ['Unpaid', fmt(customer.stats.unpaidValue), '#EF4444'],
              ].map(([label, val, color]) => (
                <div key={label} className="flex justify-between items-center px-4 py-3 rounded-[10px] bg-[#F4F6FA]">
                  <span className="text-[12px] font-medium text-[#6B7194]">{label}</span>
                  <span className="text-[14px] font-bold tabular-nums" style={{ color }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="gc-card p-6">
            <h3 className="gc-card-title mb-4">Ghana Recipients ({customer.recipients?.length || 0})</h3>
            <div className="space-y-2">
              {customer.recipients?.map((r) => (
                <div key={r.id} className="px-4 py-3 rounded-[10px] bg-[#F4F6FA]">
                  <p className="font-semibold text-[13px] text-[#1A1D2B]">{r.firstName} {r.lastName}</p>
                  <p className="text-[11px] text-[#9CA3C0] mt-0.5">{r.phone} · {r.city}, {r.country}</p>
                </div>
              ))}
              {(!customer.recipients || customer.recipients.length === 0) && (
                <p className="text-[13px] text-[#9CA3C0]">No recipients</p>
              )}
            </div>
          </div>
        </div>

        {/* Invoice history */}
        <div className="gc-card p-6">
          <h3 className="gc-card-title mb-4">Shipping History</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {customer.invoices?.map((inv) => {
              const status = inv.paymentStatus;
              const statusColors = status === 'paid'
                ? { bg: 'rgba(16,185,129,0.08)', color: '#10B981' }
                : status === 'partial'
                ? { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' }
                : { bg: 'rgba(239,68,68,0.07)', color: '#EF4444' };
              return (
                <Link
                  key={inv.id}
                  to={`/pickups/${inv.id}`}
                  className="block px-4 py-3 rounded-[10px] hover:bg-[rgba(99,102,241,0.04)] border border-black/[0.03] transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[#6366F1] text-[13px]">#{inv.invoiceNumber}</span>
                    <span className="font-bold text-[13px] text-[#1A1D2B] tabular-nums">${parseFloat(inv.finalTotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[11px] text-[#9CA3C0]">{new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-semibold capitalize"
                      style={{ background: statusColors.bg, color: statusColors.color }}
                    >
                      <span className="w-[4px] h-[4px] rounded-full bg-current" />
                      {status}
                    </span>
                  </div>
                </Link>
              );
            })}
            {(!customer.invoices || customer.invoices.length === 0) && (
              <p className="text-center py-6 text-[#9CA3C0] text-[13px]">No shipping history</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
