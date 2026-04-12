import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';

/* ─────────────────────────────────────────────────────────── */
/*  Helpers                                                    */
/* ─────────────────────────────────────────────────────────── */

const fmtCurrency = (n) =>
  (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SplitCurrency({ value }) {
  const n = Number(value) || 0;
  const [whole, dec] = n
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split('.');
  return (
    <span className="tabular-nums">
      <span>${whole}</span>
      <span className="text-[18px] text-[#9CA3C0]">.{dec}</span>
    </span>
  );
}

function initialsOf(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

// Deterministic gradient per customer name
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366F1, #3B82F6)',
  'linear-gradient(135deg, #10B981, #059669)',
  'linear-gradient(135deg, #F59E0B, #D97706)',
  'linear-gradient(135deg, #EF4444, #DC2626)',
  'linear-gradient(135deg, #8B5CF6, #6366F1)',
  'linear-gradient(135deg, #EC4899, #DB2777)',
];
function gradientFor(name) {
  const hash = (name || '').split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

/* ─────────────────────────────────────────────────────────── */
/*  KPI Card                                                   */
/* ─────────────────────────────────────────────────────────── */

function KpiCard({ label, value, subtext, trend, accent, icon }) {
  const accents = {
    gold:  { gradient: 'linear-gradient(135deg, #F59E0B, #D97706)', iconBg: 'rgba(245,158,11,0.08)', iconColor: '#F59E0B' },
    blue:  { gradient: 'linear-gradient(135deg, #6366F1, #3B82F6)', iconBg: 'rgba(59,130,246,0.08)', iconColor: '#3B82F6' },
    green: { gradient: 'linear-gradient(135deg, #10B981, #059669)', iconBg: 'rgba(16,185,129,0.08)', iconColor: '#10B981' },
    red:   { gradient: 'linear-gradient(135deg, #EF4444, #DC2626)', iconBg: 'rgba(239,68,68,0.07)',  iconColor: '#EF4444' },
  };
  const a = accents[accent] || accents.blue;

  return (
    <div className="relative overflow-hidden bg-white rounded-[16px] p-6 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300">
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[16px]"
        style={{ background: a.gradient }}
      />
      <div className="flex items-start justify-between mb-3">
        <p className="text-[12.5px] font-medium text-[#6B7194]">{label}</p>
        <div
          className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center"
          style={{ background: a.iconBg, color: a.iconColor }}
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
      <div className="text-[28px] font-extrabold text-[#1A1D2B] tracking-[-0.8px] leading-none mb-2">
        {value}
      </div>
      <div className="flex items-center justify-between gap-3">
        {subtext && <span className="text-[12px] text-[#9CA3C0] truncate">{subtext}</span>}
        {trend && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-semibold ${
              trend.variant === 'positive'
                ? 'bg-[rgba(16,185,129,0.08)] text-[#10B981]'
                : trend.variant === 'negative'
                ? 'bg-[rgba(239,68,68,0.07)] text-[#EF4444]'
                : 'bg-[rgba(99,102,241,0.08)] text-[#6366F1]'
            }`}
          >
            {trend.arrow && <span>{trend.arrow}</span>}
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Shipment Tracker Tile                                      */
/* ─────────────────────────────────────────────────────────── */

function ShipmentTrackerTile({ shipments }) {
  const navigate = useNavigate();
  const active = shipments.filter(s => s.trackingNumber);

  if (active.length === 0) {
    return (
      <div className="relative overflow-hidden bg-white rounded-[16px] p-6 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
        <p className="text-[15px] font-bold text-[#1A1D2B] mb-3">Shipments at Sea</p>
        <div className="flex items-center justify-center py-8">
          <p className="text-[13px] text-[#9CA3C0]">No tracked shipments — add a tracking number to see it here</p>
        </div>
      </div>
    );
  }

  // Show the primary (first) shipment on the map, others listed below
  const primary = active[0];
  const pct = primary.transitPercent || 0;
  // Derive arrived from tracking data (last event), not the shipment status field
  // — status can be stale when a container is reused across shipments
  const lastEvtType = primary.lastEvent?.type || '';
  const lastEvtLoc = (primary.lastEvent?.location || '').toLowerCase();
  const arrived = pct >= 97 || lastEvtType === 'EMRT' || lastEvtType === 'GTOT' ||
    (lastEvtType === 'DISC' && (lastEvtLoc.includes('tema') || lastEvtLoc.includes('ghana')));

  // Geo points in SVG coords (viewBox 0 0 800 380)
  // Longitude: -100°W to 5°E mapped to x: 30 to 770
  // Latitude: 0°N to 35°N mapped to y: 350 to 30
  const houston  = { x: 65,  y: 72,  label: 'Houston',  sub: 'USA' };
  const freeport = { x: 195, y: 100, label: 'Freeport', sub: 'Bahamas' };
  const tema     = { x: 735, y: 310, label: 'Tema',     sub: 'Ghana' };

  // Ship position along the quadratic bezier: Houston → Freeport → Tema
  // t parameter based on transit percentage
  const t = Math.min(Math.max(pct / 100, 0), 1);
  const shipX = (1-t)*(1-t)*houston.x + 2*(1-t)*t*freeport.x + t*t*tema.x;
  const shipY = (1-t)*(1-t)*houston.y + 2*(1-t)*t*freeport.y + t*t*tema.y;

  // Status label based on last confirmed event
  const lastLoc = (primary.lastEvent?.location || '').toLowerCase();
  const lastType = primary.lastEvent?.type || '';
  let shipLabel = 'Departing Houston';
  if (arrived) shipLabel = 'Arrived in Ghana';
  else if (lastType === 'DISC' || (lastType === 'ARRV' && (lastLoc.includes('tema') || lastLoc.includes('ghana')))) shipLabel = 'Arrived in Ghana';
  else if (lastType === 'DEPA' && (lastLoc.includes('freeport') || lastLoc.includes('bahamas'))) shipLabel = 'Left Freeport';
  else if (lastType === 'ARRV' && (lastLoc.includes('freeport') || lastLoc.includes('bahamas'))) shipLabel = 'At Freeport';
  else if (lastType === 'DEPA' && (lastLoc.includes('houston') || lastLoc.includes('united states'))) shipLabel = 'Left Houston';
  else if (pct > 55) shipLabel = 'Crossing Atlantic';
  else if (pct > 20) shipLabel = 'In Caribbean';
  else if (pct > 5) shipLabel = 'Departing Houston';

  const etaText = primary.etaDays != null
    ? primary.etaDays > 0 ? `${primary.etaDays} day${primary.etaDays === 1 ? '' : 's'} away`
    : primary.etaDays === 0 ? 'Arriving today' : 'Arrived'
    : '';

  return (
    <div
      className="relative overflow-hidden bg-white rounded-[16px] border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-300 cursor-pointer"
      onClick={() => navigate(`/shipments/${primary.id}`)}
    >
      {/* Map fills the tile */}
      <div className="relative">
        <svg viewBox="0 0 800 400" className="w-full block rounded-t-[16px]">
          <defs>
            <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4EAFC" />
              <stop offset="100%" stopColor="#E8F4FD" />
            </linearGradient>
            <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
            <filter id="shipShadow">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#3B82F6" floodOpacity="0.3" />
            </filter>
            <filter id="labelShadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.1)" />
            </filter>
          </defs>

          {/* Ocean */}
          <rect x="0" y="0" width="800" height="400" fill="url(#oceanGrad)" rx="12" />

          {/* Subtle grid lines (ocean texture) */}
          {[80, 160, 240, 320].map((y) => (
            <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#C2DCF0" strokeWidth="0.3" strokeDasharray="4 8" />
          ))}
          {[160, 320, 480, 640].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="400" stroke="#C2DCF0" strokeWidth="0.3" strokeDasharray="4 8" />
          ))}

          {/* Land: US Southeast */}
          <path d="M10,10 L10,75 Q20,80 35,85 L55,88 Q65,82 70,72 L75,58 Q95,48 120,44 L140,50 Q135,68 120,85 L95,98 Q70,105 50,100 L35,108 Q15,105 10,92 Z"
            fill="#C8D9B3" stroke="#B5C9A0" strokeWidth="0.5" opacity="0.7" />
          {/* Florida */}
          <path d="M140,50 L155,55 Q168,62 172,80 L176,102 Q180,120 176,138 Q170,155 158,168 Q148,162 142,148 L135,125 Q128,102 132,82 Z"
            fill="#C8D9B3" stroke="#B5C9A0" strokeWidth="0.5" opacity="0.7" />
          {/* Cuba */}
          <path d="M148,175 Q170,168 198,172 L222,178 Q238,182 242,188 Q236,194 220,196 L188,192 Q160,188 148,182 Z"
            fill="#C8D9B3" stroke="#B5C9A0" strokeWidth="0.5" opacity="0.6" />
          {/* Bahamas */}
          <ellipse cx="202" cy="118" rx="6" ry="4" fill="#C8D9B3" opacity="0.6" />
          <ellipse cx="212" cy="112" rx="4" ry="3" fill="#C8D9B3" opacity="0.5" />
          {/* West Africa */}
          <path d="M695,225 Q708,218 718,225 L728,238 Q738,255 742,278 L745,300 Q746,318 740,335 L732,352 Q725,365 715,372 L705,378 Q695,382 685,380 L678,372 Q682,355 688,332 L692,305 Q696,278 698,255 Z"
            fill="#C8D9B3" stroke="#B5C9A0" strokeWidth="0.5" opacity="0.7" />
          <path d="M715,372 L728,378 Q742,385 752,392 L760,400 L675,400 Q682,388 692,378 Z"
            fill="#C8D9B3" stroke="#B5C9A0" strokeWidth="0.5" opacity="0.7" />
          {/* NW Africa (Senegal/Mauritania hint) */}
          <path d="M660,120 Q670,115 680,118 L690,128 Q700,145 705,170 L708,195 Q710,210 705,225 L695,225 Q690,210 688,190 L685,165 Q680,140 675,128 Z"
            fill="#C8D9B3" stroke="#B5C9A0" strokeWidth="0.5" opacity="0.5" />

          {/* Route: dashed background */}
          <path
            d={`M ${houston.x} ${houston.y} Q ${freeport.x} ${freeport.y} ${tema.x} ${tema.y}`}
            fill="none" stroke="#A8C4E0" strokeWidth="2.5" strokeDasharray="8 6" opacity="0.5"
          />
          {/* Route: solid progress */}
          <path
            d={`M ${houston.x} ${houston.y} Q ${freeport.x} ${freeport.y} ${tema.x} ${tema.y}`}
            fill="none"
            stroke={arrived ? '#10B981' : 'url(#routeGrad)'}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="1200"
            strokeDashoffset={1200 - (pct / 100) * 1200}
            style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
          />

          {/* Port labels — pill style like the globe image */}
          {[houston, freeport, tema].map((p, i) => {
            const isDestination = i === 2;
            const pillW = p.label.length * 7.5 + (p.sub.length * 5) + 32;
            const pillX = p.x - pillW / 2;
            const pillY = i === 0 ? p.y - 32 : i === 1 ? p.y + 16 : p.y - 32;
            const dotColor = isDestination && arrived ? '#10B981' : isDestination ? '#F59E0B' : '#6366F1';
            return (
              <g key={i} filter="url(#labelShadow)">
                {/* Pill background */}
                <rect x={pillX} y={pillY} width={pillW} height="24" rx="12" fill="#1A1D2B" opacity="0.85" />
                {/* Dot */}
                <circle cx={pillX + 14} cy={pillY + 12} r="4" fill={dotColor} />
                {/* Label text */}
                <text x={pillX + 24} y={pillY + 16} fontSize="11" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">
                  {p.label}
                </text>
                <text x={pillX + 24 + p.label.length * 7} y={pillY + 16} fontSize="10" fontWeight="400" fill="rgba(255,255,255,0.5)" fontFamily="Inter, sans-serif">
                  {p.sub}
                </text>
                {/* Port dot on map */}
                <circle cx={p.x} cy={p.y} r="5" fill="white" stroke={dotColor} strokeWidth="2.5" />
              </g>
            );
          })}

          {/* Ship */}
          <g
            transform={`translate(${shipX}, ${shipY})`}
            filter="url(#shipShadow)"
            style={{ transition: 'transform 1.5s ease-out' }}
          >
            {/* Glow ring */}
            <circle cx="0" cy="0" r="22" fill={arrived ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)'} />
            <circle cx="0" cy="0" r="16" fill="white" />
            {/* Ship SVG centered */}
            <g transform="translate(-10, -10)">
              <path d="M2 14L5 7H15L18 14H2Z" fill={arrived ? '#10B981' : '#3B82F6'} opacity="0.25" />
              <path d="M2 14L5 7H15L18 14" stroke={arrived ? '#10B981' : '#3B82F6'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 7V2" stroke={arrived ? '#10B981' : '#3B82F6'} strokeWidth="1.8" strokeLinecap="round" />
              <path d="M7 2H13" stroke={arrived ? '#10B981' : '#3B82F6'} strokeWidth="1.2" strokeLinecap="round" />
              <path d="M0 17C2 15.5 4.5 15.5 6.5 17C8.5 15.5 11 15.5 13 17C15 15.5 17.5 15.5 20 17" stroke={arrived ? '#10B981' : '#3B82F6'} strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>

          {/* Ship label pill */}
          {(() => {
            const lw = shipLabel.length * 6.8 + 20;
            const lx = Math.min(Math.max(shipX + 28, 10), 800 - lw - 10);
            const ly = shipY - 12;
            return (
              <g>
                <rect x={lx} y={ly} width={lw} height="22" rx="11"
                  fill={arrived ? '#10B981' : '#3B82F6'} />
                <text x={lx + 10} y={ly + 15} fontSize="11" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">
                  {shipLabel}
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Overlay: vessel name + status (top-left) */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-[10px] bg-white/90 backdrop-blur-sm shadow-sm flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${arrived ? 'bg-[#10B981]' : 'bg-[#3B82F6] animate-pulse-dot'}`} />
            <span className="text-[12px] font-bold text-[#1A1D2B]">{primary.vesselName || primary.name}</span>
            {primary.voyageNumber && <span className="text-[10px] text-[#9CA3C0]">· {primary.voyageNumber}</span>}
          </div>
        </div>

        {/* Overlay: ETA (top-right) */}
        <div className="absolute top-3 right-3">
          <div className={`px-3 py-1.5 rounded-[10px] backdrop-blur-sm shadow-sm text-[11px] font-bold ${arrived ? 'bg-[#10B981]/90 text-white' : 'bg-white/90 text-[#3B82F6]'}`}>
            {etaText || (primary.eta ? `ETA ${new Date(primary.eta + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Tracking')}
          </div>
        </div>
      </div>

      {/* Compact footer */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="text-[11px] text-[#6B7194]">Houston → Tema · {shipLabel}</span>
        {active.length > 1 && (
          <span className="text-[10px] text-[#9CA3C0]">+{active.length - 1} more</span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Container Progress                                         */
/* ─────────────────────────────────────────────────────────── */

function ContainerProgress({ shipment }) {
  if (!shipment) {
    return (
      <div className="bg-white rounded-[16px] p-6 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
        <h3 className="text-[15px] font-bold text-[#1A1D2B] tracking-[-0.2px] mb-4">Container Progress</h3>
        <p className="text-[13px] text-[#9CA3C0]">No active shipment</p>
      </div>
    );
  }

  const current = parseFloat(shipment.totalValue) || 0;
  const max = shipment.maxCapacity || 30000;
  const pct = Math.min(Math.round((current / max) * 100), 100);
  const circumference = 2 * Math.PI * 50;
  const dashOffset = circumference * (1 - pct / 100);

  const stats = shipment.stats || {};
  const totalInvoices = stats.invoiceCount || 0;
  const paidValue = parseFloat(stats.paidValue) || 0;
  const unpaidValue = parseFloat(stats.unpaidValue) || 0;

  const startDate = shipment.start_date ? new Date(shipment.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div className="bg-white rounded-[16px] p-6 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-300">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[15px] font-bold text-[#1A1D2B] tracking-[-0.2px]">Container Progress</h3>
        <span className="px-2.5 py-1 rounded-md bg-[rgba(245,158,11,0.08)] text-[#F59E0B] text-[11px] font-semibold uppercase tracking-wide">
          {shipment.status || 'collecting'}
        </span>
      </div>

      <div className="flex items-center gap-5">
        {/* Ring */}
        <div className="relative w-[160px] h-[160px] shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <defs>
              <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#3B82F6" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="50" fill="none" stroke="#EEF0F6" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="url(#ring-gradient)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="leading-none">
              <span className="text-[32px] font-extrabold text-[#1A1D2B] tracking-[-1px]">{pct}</span>
              <span className="text-[18px] font-semibold text-[#9CA3C0] ml-0.5">%</span>
            </div>
            <p className="text-[11px] text-[#6B7194] mt-1">${fmtCurrency(current)}</p>
          </div>
        </div>

        {/* Stat rows */}
        <div className="flex-1 space-y-2 min-w-0">
          <StatRow label="Total Invoices" value={totalInvoices} />
          <StatRow label="Paid" value={`$${fmtCurrency(paidValue)}`} valueColor="#10B981" />
          <StatRow label="Unpaid" value={`$${fmtCurrency(unpaidValue)}`} valueColor="#EF4444" />
          <StatRow label="Container Date" value={startDate} valueColor="#F59E0B" valueSize="13px" />
        </div>
      </div>

      {/* Tracking info (if tracking number set) */}
      {shipment.trackingNumber && (
        <div className="mt-4 pt-4 border-t border-black/[0.03]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="text-[12px] font-bold text-[#1A1D2B] tracking-wide">{shipment.trackingNumber}</span>
              <span className="px-1.5 py-0.5 rounded bg-[#F4F6FA] text-[10px] font-semibold text-[#6B7194]">{shipment.carrier || 'MSC'}</span>
            </div>
            {shipment.eta && (
              <div className="text-right">
                <p className="text-[10px] font-semibold text-[#9CA3C0] uppercase tracking-wide">ETA</p>
                <p className="text-[13px] font-bold text-[#6366F1]">
                  {new Date(shipment.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {(() => {
                    const days = Math.ceil((new Date(shipment.eta) - new Date()) / 86400000);
                    if (days > 0) return <span className="text-[10.5px] text-[#9CA3C0] ml-1">({days}d)</span>;
                    if (days === 0) return <span className="text-[10.5px] text-[#10B981] ml-1">(today)</span>;
                    return <span className="text-[10.5px] text-[#EF4444] ml-1">({Math.abs(days)}d ago)</span>;
                  })()}
                </p>
              </div>
            )}
          </div>
          {shipment.vesselName && (
            <p className="text-[11.5px] text-[#6B7194]">
              <span className="font-semibold">{shipment.vesselName}</span>
              {shipment.voyageNumber && <span className="text-[#9CA3C0]"> · Voyage {shipment.voyageNumber}</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, valueColor = '#1A1D2B', valueSize = '14px' }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-[10px] bg-[#F4F6FA]">
      <span className="text-[12px] font-medium text-[#6B7194]">{label}</span>
      <span
        className="font-bold tabular-nums"
        style={{ color: valueColor, fontSize: valueSize }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Revenue Trend                                              */
/* ─────────────────────────────────────────────────────────── */

function RevenueTrend({ data }) {
  const items = (data || []).slice(-6);
  const maxRevenue = Math.max(...items.map((d) => Number(d.revenue) || 0), 1);
  const peakIdx = items.reduce((best, d, i) => (Number(d.revenue) > Number(items[best].revenue) ? i : best), 0);

  const formatK = (n) => {
    const v = Number(n) || 0;
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${Math.round(v)}`;
  };

  return (
    <div className="bg-white rounded-[16px] p-6 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-300">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[15px] font-bold text-[#1A1D2B] tracking-[-0.2px]">Revenue Trend</h3>
        <span className="px-2.5 py-1 rounded-md bg-[rgba(99,102,241,0.08)] text-[#6366F1] text-[11px] font-semibold">
          6 Months
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-center py-10 text-[13px] text-[#9CA3C0]">No revenue data yet</p>
      ) : (
        <div className="flex items-end gap-3 h-[200px]">
          {items.map((d, i) => {
            const rev = Number(d.revenue) || 0;
            const height = Math.max(4, (rev / maxRevenue) * 165);
            const isPeak = i === peakIdx;
            const month = String(d.month || '').split(' ')[0];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-semibold text-[#6B7194]">{formatK(rev)}</span>
                <div
                  className="w-full max-w-[48px] rounded-t-[8px] rounded-b-[4px] transition-all duration-500 hover:brightness-110"
                  style={{
                    height: `${height}px`,
                    background: isPeak
                      ? 'linear-gradient(180deg, #F59E0B, #D97706)'
                      : 'linear-gradient(180deg, #6366F1, #3B82F6)',
                    boxShadow: isPeak ? '0 4px 15px rgba(245,158,11,0.25)' : 'none',
                  }}
                />
                <span className="text-[11.5px] font-medium text-[#9CA3C0]">{month}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Recent Invoices                                            */
/* ─────────────────────────────────────────────────────────── */

function RecentInvoicesTable({ pickups, totalCount }) {
  return (
    <div className="bg-white rounded-[16px] border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.03]">
        <h3 className="text-[15px] font-bold text-[#1A1D2B] tracking-[-0.2px]">Recent Invoices</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="bg-[#F4F6FA]">
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Invoice #</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Customer</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Total</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Status</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Date</th>
            </tr>
          </thead>
          <tbody>
            {pickups.map((p) => {
              const statusColors =
                p.paymentStatus === 'paid'
                  ? { bg: 'rgba(16,185,129,0.08)', color: '#10B981' }
                  : p.paymentStatus === 'partial'
                  ? { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B' }
                  : { bg: 'rgba(239,68,68,0.07)', color: '#EF4444' };
              return (
                <tr
                  key={p.id}
                  className="border-b border-black/[0.03] last:border-0 hover:bg-[rgba(99,102,241,0.02)] transition-colors"
                >
                  <td className="px-6 py-3.5">
                    <Link
                      to={`/pickups/${p.id}`}
                      className="font-bold text-[#6366F1] hover:text-[#4F46E5]"
                    >
                      #{p.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-[30px] h-[30px] rounded-[8px] shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                        style={{ background: gradientFor(p.customerName) }}
                      >
                        {initialsOf(p.customerName)}
                      </div>
                      <span className="font-medium text-[#1A1D2B] truncate">{p.customerName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 font-bold text-[#1A1D2B] tabular-nums">
                    ${fmtCurrency(p.finalTotal)}
                  </td>
                  <td className="px-6 py-3.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold capitalize"
                      style={{ background: statusColors.bg, color: statusColors.color }}
                    >
                      <span
                        className="w-[5px] h-[5px] rounded-full"
                        style={{ background: 'currentColor' }}
                      />
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-[#6B7194]">
                    {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pickups.length === 0 && (
          <p className="text-center py-12 text-[#9CA3C0]">No recent invoices</p>
        )}
      </div>

      <Link
        to="/pickups"
        className="block text-center py-3.5 border-t border-black/[0.03] text-[13px] font-semibold text-[#6366F1] hover:bg-[rgba(99,102,241,0.04)] transition-colors"
      >
        View all {totalCount ? `${totalCount} ` : ''}invoices →
      </Link>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Page                                                       */
/* ─────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const navigate = useNavigate();
  const { onMenuClick } = useLayout();
  const [metrics, setMetrics] = useState(null);
  const [chart, setChart] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [activeShipment, setActiveShipment] = useState(null);
  const [trackedShipments, setTrackedShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalInvoices, setTotalInvoices] = useState(0);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      const [metricsRes, chartRes, pickupsRes, shipmentsRes, invoiceListRes, trackedRes] = await Promise.all([
        axios.get('/api/v1/dashboard/metrics'),
        axios.get('/api/v1/dashboard/revenue-chart'),
        axios.get('/api/v1/dashboard/recent-pickups'),
        axios.get('/api/v1/shipments?status=collecting&limit=1'),
        axios.get('/api/v1/pickups?page=1&limit=1'),
        axios.get('/api/v1/dashboard/tracked-shipments'),
      ]);
      setMetrics(metricsRes.data.data);
      setChart(chartRes.data.data);
      setPickups(pickupsRes.data.data);
      const ships = shipmentsRes.data.data.shipments || [];
      if (ships.length > 0) setActiveShipment(ships[0]);
      setTotalInvoices(invoiceListRes.data.data.pagination?.total || 0);
      setTrackedShipments(trackedRes.data.data || []);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const revenueTrend =
    metrics?.revenueLastMonth > 0
      ? {
          arrow: metrics.revenueThisMonth >= metrics.revenueLastMonth ? '↑' : '↓',
          variant: metrics.revenueThisMonth >= metrics.revenueLastMonth ? 'positive' : 'negative',
          label: `${Math.abs(Math.round(((metrics.revenueThisMonth - metrics.revenueLastMonth) / metrics.revenueLastMonth) * 100))}% vs last month`,
        }
      : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back — here's what's happening today."
        onMenuClick={onMenuClick}
      />

      {/* Shipment tracker + KPI row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mb-[18px]">
        <ShipmentTrackerTile shipments={trackedShipments} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        <KpiCard
          label="Active Shipments"
          value={metrics?.activeShipments ?? 0}
          subtext="Collecting & ready"
          accent="blue"
          icon="M8 17h8M8 17l-2 2m2-2l-2-2m10 2l2 2m-2-2l2-2M3 9h18M3 9a2 2 0 012-2h14a2 2 0 012 2M3 9v8a2 2 0 002 2h14a2 2 0 002-2V9"
        />
        <KpiCard
          label="Revenue This Month"
          value={<SplitCurrency value={metrics?.revenueThisMonth} />}
          subtext={`${metrics?.invoicesThisMonth || 0} invoices`}
          trend={revenueTrend}
          accent="green"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <KpiCard
          label="Unpaid Invoices"
          value={<SplitCurrency value={metrics?.unpaidTotal} />}
          subtext={`${metrics?.unpaidCount || 0} invoices`}
          trend={{ variant: 'negative', label: 'Needs attention' }}
          accent="red"
          icon="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] mb-[18px]">
        <ContainerProgress shipment={activeShipment} />
        <RevenueTrend data={chart} />
      </div>

      {/* Recent invoices */}
      <RecentInvoicesTable pickups={pickups} totalCount={totalInvoices} />
    </>
  );
}
