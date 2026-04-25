import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_MAP = {
  collecting: { label: 'At Warehouse', color: '#F59E0B', step: 1 },
  ready:      { label: 'Ready to Ship', color: '#3B82F6', step: 2 },
  shipped:    { label: 'Shipped',       color: '#6366F1', step: 3 },
  transit:    { label: 'In Transit',    color: '#6366F1', step: 3 },
  customs:    { label: 'At Customs',    color: '#8B5CF6', step: 4 },
  delivered:  { label: 'Delivered',     color: '#10B981', step: 5 },
};

const FONT_BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_DISPLAY = "'Fraunces', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";

const card = {
  background: '#fff',
  borderRadius: '16px',
  border: '1px solid rgba(15, 22, 41, 0.04)',
  boxShadow: '0 1px 3px rgba(15, 22, 41, 0.04), 0 1px 2px rgba(15, 22, 41, 0.02)',
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

  const etaDays = result?.shipment?.eta
    ? Math.ceil((new Date(result.shipment.eta) - new Date()) / 86400000)
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F4F6FA',
      backgroundImage: `
        linear-gradient(to right,  rgba(99, 102, 241, 0.045) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(99, 102, 241, 0.045) 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      backgroundAttachment: 'fixed',
      fontFamily: FONT_BODY,
      color: '#1A1D2B',
    }}>
      {/* Hero — Houston→Tema gradient with subtle horizon */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(135deg, #0F1629 0%, #1B2442 45%, #312E81 100%)',
        padding: '40px 20px 56px',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        {/* Decorative compass/route arc */}
        <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18, pointerEvents: 'none' }}
          aria-hidden="true">
          <defs>
            <linearGradient id="hero-route" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#6366F1" />
            </linearGradient>
          </defs>
          <path d="M 80 150 Q 400 30, 720 130" stroke="url(#hero-route)" strokeWidth="2"
            strokeDasharray="6 6" fill="none" />
          <circle cx="80"  cy="150" r="6" fill="#F59E0B" />
          <circle cx="720" cy="130" r="6" fill="#6366F1" />
          {/* faint stars */}
          {[[120,40],[200,80],[340,28],[470,55],[600,38],[680,72],[760,40]].map(([x,y],i)=>(
            <circle key={i} cx={x} cy={y} r="1" fill="#fff" opacity="0.6" />
          ))}
        </svg>
        <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto' }}>
          <p style={{
            color: '#F59E0B', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.22em', textTransform: 'uppercase', margin: 0,
          }}>
            USA &nbsp;→&nbsp; Ghana
          </p>
          <h1 style={{
            color: '#fff', fontFamily: FONT_DISPLAY, fontSize: '38px', fontWeight: 700,
            margin: '8px 0 4px', letterSpacing: '-0.02em', lineHeight: 1.05,
          }}>
            Gold Coast Global Logistics
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', margin: 0 }}>
            Track your shipment, every step of the way.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '640px', margin: '-32px auto 0', padding: '0 16px 60px', position: 'relative' }}>

        {/* Search Form */}
        <form onSubmit={handleSearch} style={{ ...card, padding: '24px', marginBottom: '20px' }}>
          <h2 style={{
            fontFamily: FONT_DISPLAY, fontSize: '22px', fontWeight: 700,
            margin: '0 0 4px', letterSpacing: '-0.01em',
          }}>
            Find your shipment
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7194', margin: '0 0 18px' }}>
            Enter your invoice number and phone number to get a live update.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Invoice Number</label>
              <input
                type="text" inputMode="numeric"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="e.g. 601"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 346-702-8488"
                style={inputStyle}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !invoice.trim() || !phone.trim()}
            style={{
              width: '100%', padding: '14px',
              background: loading
                ? '#9CA3C0'
                : 'linear-gradient(135deg, #6366F1, #4F46E5)',
              color: '#fff', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em',
              cursor: loading ? 'default' : 'pointer',
              boxShadow: loading ? 'none' : '0 6px 18px rgba(99, 102, 241, 0.32)',
              transition: 'transform 0.15s ease, box-shadow 0.2s ease',
            }}
            onMouseDown={(e) => !loading && (e.currentTarget.style.transform = 'translateY(1px)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {loading ? 'Searching…' : 'Track Shipment'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px',
            padding: '16px 18px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ color: '#991B1B', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Hero Status Card */}
            <div style={{ ...card, padding: '24px', position: 'relative', overflow: 'hidden' }}>
              {shipStatus && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                  background: `linear-gradient(90deg, ${shipStatus.color}, ${shipStatus.color}cc)`,
                }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: '20px' }}>
                <div>
                  <p style={overlineStyle}>Invoice</p>
                  <p style={{
                    fontFamily: FONT_DISPLAY, fontSize: '40px', fontWeight: 700, color: '#1A1D2B',
                    margin: '4px 0 0', letterSpacing: '-0.02em', lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}>
                    #{result.invoiceNumber}
                  </p>
                </div>
                {shipStatus && (
                  <span style={{
                    padding: '8px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                    background: shipStatus.color + '1f', color: shipStatus.color,
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    border: `1px solid ${shipStatus.color}33`,
                    flexShrink: 0,
                  }}>
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: shipStatus.color, boxShadow: `0 0 0 4px ${shipStatus.color}22`,
                      animation: 'gc-pulse-dot 2s ease-in-out infinite',
                    }} />
                    {shipStatus.label}
                  </span>
                )}
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px',
                paddingBottom: '20px', borderBottom: '1px solid rgba(15, 22, 41, 0.06)',
              }}>
                <div>
                  <p style={overlineStyle}>Sender</p>
                  <p style={fieldStyle}>{result.customerName}</p>
                </div>
                <div>
                  <p style={overlineStyle}>Recipient</p>
                  <p style={fieldStyle}>{result.recipientName}</p>
                </div>
              </div>

              {/* Progress Steps */}
              {shipStatus && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: '20px' }}>
                  {steps.map((label, i) => {
                    const stepNum = i + 1;
                    const active = stepNum <= shipStatus.step;
                    const current = stepNum === shipStatus.step;
                    return (
                      <div key={label} style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', position: 'relative',
                      }}>
                        {i > 0 && (
                          <div style={{
                            position: 'absolute', top: '13px', right: '50%', width: '100%', height: '3px',
                            background: active ? shipStatus.color : '#E5E7EB',
                            zIndex: 0, borderRadius: '2px',
                          }} />
                        )}
                        <div style={{
                          width: current ? '28px' : '22px', height: current ? '28px' : '22px',
                          borderRadius: '50%',
                          background: active ? shipStatus.color : '#E5E7EB',
                          boxShadow: current ? `0 0 0 6px ${shipStatus.color}1f` : 'none',
                          zIndex: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.3s',
                        }}>
                          {active && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff"
                              strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <p style={{
                          fontSize: '10px', fontWeight: current ? 700 : 600,
                          color: active ? shipStatus.color : '#9CA3C0',
                          margin: '8px 0 0', textAlign: 'center',
                          letterSpacing: '0.04em',
                        }}>
                          {label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ETA highlight card */}
            {result.shipment?.eta && (
              <div style={{
                ...card,
                padding: '20px 24px',
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                color: '#fff',
                border: 'none',
                boxShadow: '0 10px 40px rgba(99, 102, 241, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              }}>
                <div>
                  <p style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em',
                    textTransform: 'uppercase', margin: 0,
                    color: 'rgba(255,255,255,0.75)',
                  }}>
                    Estimated Arrival
                  </p>
                  <p style={{
                    fontFamily: FONT_DISPLAY, fontSize: '24px', fontWeight: 700,
                    margin: '4px 0 0', letterSpacing: '-0.01em',
                  }}>
                    {new Date(result.shipment.eta).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{
                    fontFamily: FONT_DISPLAY, fontSize: '40px', fontWeight: 700,
                    margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}>
                    {etaDays > 0 ? etaDays : etaDays === 0 ? '0' : Math.abs(etaDays)}
                  </p>
                  <p style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', margin: '2px 0 0',
                    color: 'rgba(255,255,255,0.85)',
                  }}>
                    {etaDays > 0 ? 'days to go' : etaDays === 0 ? 'arrives today' : 'days ago'}
                  </p>
                </div>
              </div>
            )}

            {/* Shipment Details */}
            {result.shipment && (result.shipment.vesselName || result.shipment.trackingNumber || result.shipment.departureDate) && (
              <div style={{ ...card, padding: '20px 24px' }}>
                <p style={sectionTitleStyle}>Shipment Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {result.shipment.vesselName && <DetailField label="Vessel" value={result.shipment.vesselName} />}
                  {result.shipment.voyageNumber && <DetailField label="Voyage" value={result.shipment.voyageNumber} />}
                  {result.shipment.carrier && <DetailField label="Carrier" value={result.shipment.carrier} />}
                  {result.shipment.trackingNumber && <DetailField label="Container" value={result.shipment.trackingNumber} mono />}
                  {result.shipment.departureDate && (
                    <DetailField
                      label="Departed"
                      value={new Date(result.shipment.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            {result.items && result.items.length > 0 && (
              <div style={{ ...card, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
                  <p style={{ ...sectionTitleStyle, marginBottom: 0 }}>Items in Your Shipment</p>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                    color: '#6B7194', textTransform: 'uppercase',
                  }}>
                    {result.itemCount} total
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {result.items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: i < result.items.length - 1 ? '1px solid rgba(15, 22, 41, 0.05)' : 'none',
                    }}>
                      <span style={{ fontSize: '13.5px', color: '#1A1D2B', fontWeight: 500 }}>{item.name}</span>
                      <span style={{
                        fontFamily: FONT_DISPLAY, fontSize: '15px', color: '#6366F1', fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums lining-nums',
                      }}>
                        ×{item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tracking Events Timeline */}
            {result.events && result.events.length > 0 && (
              <div style={{ ...card, padding: '20px 24px' }}>
                <p style={sectionTitleStyle}>Tracking History</p>
                <div style={{ position: 'relative', paddingLeft: '24px' }}>
                  <div style={{ position: 'absolute', left: '6px', top: '8px', bottom: '8px', width: '2px', background: '#E5E7EB' }} />
                  {result.events.map((evt, i) => {
                    const isLatest = i === 0;
                    return (
                      <div key={i} style={{ position: 'relative', paddingBottom: i < result.events.length - 1 ? '18px' : 0 }}>
                        <div style={{
                          position: 'absolute', left: '-22px', top: '4px',
                          width: '12px', height: '12px', borderRadius: '50%',
                          background: isLatest ? '#6366F1' : '#D1D5DB',
                          border: '2px solid #fff',
                          boxShadow: isLatest ? '0 0 0 4px rgba(99, 102, 241, 0.18)' : 'none',
                        }} />
                        <p style={{
                          fontSize: '13.5px', fontWeight: 600,
                          color: isLatest ? '#1A1D2B' : '#374151',
                          margin: '0 0 3px',
                        }}>
                          {evt.description || evt.type.replace(/[._]/g, ' ')}
                        </p>
                        <p style={{ fontSize: '11.5px', color: '#9CA3C0', margin: 0 }}>
                          {new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {evt.location && <> &middot; <span style={{ color: '#6B7194', fontWeight: 500 }}>{evt.location}</span></>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p style={{
          textAlign: 'center', fontSize: '11px', color: '#9CA3C0', marginTop: '40px',
          letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          Gold Coast Global Logistics &nbsp;·&nbsp; Door-to-Door Shipping USA → Ghana
        </p>
      </div>

      <style>{`
        @keyframes gc-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: '#6B7194',
  marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em',
};

const inputStyle = {
  width: '100%', padding: '12px 14px',
  border: '1px solid rgba(15, 22, 41, 0.08)',
  borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box',
  fontFamily: FONT_BODY, color: '#1A1D2B',
  background: '#FAFBFD',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
};

const overlineStyle = {
  fontSize: '10.5px', color: '#9CA3C0', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0,
};

const fieldStyle = {
  fontSize: '14px', fontWeight: 600, color: '#1A1D2B', margin: '4px 0 0',
};

const sectionTitleStyle = {
  fontFamily: FONT_DISPLAY, fontSize: '18px', fontWeight: 700,
  color: '#1A1D2B', margin: '0 0 14px', letterSpacing: '-0.01em',
};

function DetailField({ label, value, mono }) {
  return (
    <div>
      <p style={overlineStyle}>{label}</p>
      <p style={{
        fontSize: '13.5px', fontWeight: 600, color: '#1A1D2B',
        margin: '4px 0 0',
        fontFamily: mono ? "ui-monospace, SF Mono, Menlo, Consolas, monospace" : FONT_BODY,
        letterSpacing: mono ? '-0.01em' : 'normal',
      }}>
        {value}
      </p>
    </div>
  );
}
