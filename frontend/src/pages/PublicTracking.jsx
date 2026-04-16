import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_MAP = {
  collecting: { label: 'At Warehouse', color: '#F59E0B', step: 1 },
  ready: { label: 'Ready to Ship', color: '#3B82F6', step: 2 },
  shipped: { label: 'Shipped', color: '#6366F1', step: 3 },
  transit: { label: 'In Transit', color: '#6366F1', step: 3 },
  customs: { label: 'At Customs', color: '#8B5CF6', step: 4 },
  delivered: { label: 'Delivered', color: '#10B981', step: 5 },
};

export default function PublicTracking() {
  const [invoice, setInvoice] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!invoice.trim() || !phone.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/public/track?invoice=${encodeURIComponent(invoice.trim())}&phone=${encodeURIComponent(phone.trim())}`
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Not found. Please check your invoice number and phone number.');
      } else {
        setResult(data.data);
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const shipStatus = result?.shipment ? STATUS_MAP[result.shipment.status] || STATUS_MAP.collecting : null;
  const steps = ['Warehouse', 'Ready', 'Shipped', 'Customs', 'Delivered'];

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0F1629', padding: '24px 20px', textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
          Gold Coast Global Logistics
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: '4px 0 0' }}>Track Your Shipment</p>
      </div>

      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Search Form */}
        <form onSubmit={handleSearch} style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Invoice Number</label>
            <input
              type="text"
              inputMode="numeric"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="e.g. 601"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 346-702-8488"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !invoice.trim() || !phone.trim()}
            style={{
              width: '100%', padding: '13px', background: loading ? '#9CA3AF' : '#0F1629', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Searching...' : 'Track Shipment'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
            <p style={{ color: '#DC2626', fontSize: '13px', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status Card */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Invoice</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: '#1A1D2B', margin: 0 }}>#{result.invoiceNumber}</p>
                </div>
                {shipStatus && (
                  <span style={{
                    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    background: shipStatus.color + '18', color: shipStatus.color,
                  }}>
                    {shipStatus.label}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 2px' }}>Sender</p>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>{result.customerName}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 0 2px' }}>Recipient</p>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>{result.recipientName}</p>
                </div>
              </div>

              {/* Progress Steps */}
              {shipStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginTop: '8px' }}>
                  {steps.map((label, i) => {
                    const stepNum = i + 1;
                    const active = stepNum <= shipStatus.step;
                    const current = stepNum === shipStatus.step;
                    return (
                      <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                        {i > 0 && (
                          <div style={{
                            position: 'absolute', top: '10px', right: '50%', width: '100%', height: '3px',
                            background: active ? shipStatus.color : '#E5E7EB', zIndex: 0,
                          }} />
                        )}
                        <div style={{
                          width: current ? '22px' : '18px', height: current ? '22px' : '18px', borderRadius: '50%',
                          background: active ? shipStatus.color : '#E5E7EB', zIndex: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.3s',
                        }}>
                          {active && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <p style={{ fontSize: '9px', fontWeight: 600, color: active ? shipStatus.color : '#9CA3AF', margin: '4px 0 0', textAlign: 'center' }}>
                          {label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Shipment Details */}
            {result.shipment && (result.shipment.vesselName || result.shipment.trackingNumber || result.shipment.eta) && (
              <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#1A1D2B', margin: '0 0 12px' }}>Shipment Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {result.shipment.vesselName && (
                    <div>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 1px', textTransform: 'uppercase' }}>Vessel</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>{result.shipment.vesselName}</p>
                    </div>
                  )}
                  {result.shipment.voyageNumber && (
                    <div>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 1px', textTransform: 'uppercase' }}>Voyage</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>{result.shipment.voyageNumber}</p>
                    </div>
                  )}
                  {result.shipment.carrier && (
                    <div>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 1px', textTransform: 'uppercase' }}>Carrier</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>{result.shipment.carrier}</p>
                    </div>
                  )}
                  {result.shipment.trackingNumber && (
                    <div>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 1px', textTransform: 'uppercase' }}>Container</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>{result.shipment.trackingNumber}</p>
                    </div>
                  )}
                  {result.shipment.departureDate && (
                    <div>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 1px', textTransform: 'uppercase' }}>Departed</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: 0 }}>
                        {new Date(result.shipment.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {result.shipment.eta && (
                    <div>
                      <p style={{ fontSize: '10px', color: '#9CA3AF', margin: '0 0 1px', textTransform: 'uppercase' }}>ETA</p>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#6366F1', margin: 0 }}>
                        {new Date(result.shipment.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {(() => {
                          const days = Math.ceil((new Date(result.shipment.eta) - new Date()) / 86400000);
                          if (days > 0) return ` (${days} days)`;
                          if (days === 0) return ' (today)';
                          return ` (${Math.abs(days)}d ago)`;
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            {result.items && result.items.length > 0 && (
              <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#1A1D2B', margin: '0 0 12px' }}>
                  Items ({result.itemCount})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {result.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < result.items.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>{item.name}</span>
                      <span style={{ fontSize: '13px', color: '#9CA3AF', fontWeight: 500 }}>x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tracking Events Timeline */}
            {result.events && result.events.length > 0 && (
              <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#1A1D2B', margin: '0 0 16px' }}>Tracking History</p>
                <div style={{ position: 'relative', paddingLeft: '20px' }}>
                  {/* Vertical line */}
                  <div style={{ position: 'absolute', left: '5px', top: '6px', bottom: '6px', width: '2px', background: '#E5E7EB' }} />
                  {result.events.map((evt, i) => (
                    <div key={i} style={{ position: 'relative', paddingBottom: i < result.events.length - 1 ? '16px' : 0 }}>
                      <div style={{
                        position: 'absolute', left: '-18px', top: '4px', width: '10px', height: '10px',
                        borderRadius: '50%', background: i === 0 ? '#6366F1' : '#D1D5DB', border: '2px solid #fff',
                      }} />
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1D2B', margin: '0 0 2px' }}>
                        {evt.description || evt.type.replace(/[._]/g, ' ')}
                      </p>
                      <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>
                        {new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {evt.location && ` — ${evt.location}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#9CA3AF', marginTop: '32px' }}>
          Gold Coast Global Logistics &middot; Door-to-Door Shipping USA to Ghana
        </p>
      </div>
    </div>
  );
}
