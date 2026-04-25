import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusPill from '../components/StatusPill';
import StatCard from '../components/StatCard';
import PageHeader from '../components/layout/PageHeader';

// MapLibre is large (~400 kB gzipped) — lazy-load so the rest of the app stays fast.
const VesselMap = lazy(() => import('../components/VesselMap'));
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
    <span className="font-display-tabular">
      <span>${whole}</span>
      <span className="text-[0.7em] text-[#9CA3C0] font-semibold">.{dec}</span>
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

const KpiCard = StatCard;

/* ─────────────────────────────────────────────────────────── */
/*  Shipment Tracker Tile                                      */
/* ─────────────────────────────────────────────────────────── */

function ShipmentTrackerTile({ shipments }) {
  const navigate = useNavigate();
  const tracked = shipments.filter(s => s.trackingNumber);
  const collecting = shipments.filter(s => !s.trackingNumber && ['collecting', 'ready'].includes(s.status));
  const all = [...tracked, ...collecting];

  if (all.length === 0) {
    return (
      <div className="relative overflow-hidden bg-white rounded-[16px] p-6 border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
        <p className="text-[15px] font-bold text-[#1A1D2B] mb-3">Shipments at Sea</p>
        <div className="flex items-center justify-center py-8">
          <p className="text-[13px] text-[#9CA3C0]">No active shipments</p>
        </div>
      </div>
    );
  }

  // Primary = first tracked en-route, fallback to first collecting
  const primary = tracked[0] || collecting[0];
  const pct = primary.transitPercent || 0;
  // Derive arrived from tracking data (last event), not the shipment status field
  // — status can be stale when a container is reused across shipments
  const lastEvtType = primary.lastEvent?.type || '';
  const lastEvtLoc = (primary.lastEvent?.location || '').toLowerCase();
  const arrived = pct >= 97 || lastEvtType === 'EMRT' || lastEvtType === 'GTOT' ||
    (lastEvtType === 'DISC' && (lastEvtLoc.includes('tema') || lastEvtLoc.includes('ghana')));

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
      className="relative overflow-hidden bg-white rounded-[16px] border border-black/[0.04] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300 flex flex-col"
    >
      {/* Vector map (MapLibre) — real-geography vessel tracker */}
      <div className="relative flex-1 min-h-[200px]">
        <Suspense fallback={
          <div className="absolute inset-0 rounded-t-[16px] bg-gradient-to-br from-[#E8F4FD] to-[#D4EAFC] dark:from-[#16162a] dark:to-[#1a1a2e] flex items-center justify-center">
            <span className="text-[11px] text-[#9CA3C0] font-semibold tracking-wide uppercase">Loading map…</span>
          </div>
        }>
          <VesselMap
            transitPercent={pct}
            arrived={arrived}
            onClick={() => navigate(`/shipments/${primary.id}`)}
            className="absolute inset-0"
          />
        </Suspense>

        {/* Overlay: vessel name + status (top-left) — clickable */}
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
          <div
            onClick={(e) => { e.stopPropagation(); navigate(`/shipments/${primary.id}`); }}
            className="px-3 py-1.5 rounded-[10px] bg-white/95 dark:bg-[#1a1a2e]/95 backdrop-blur-sm shadow-sm border border-black/[0.04] dark:border-white/10 flex items-center gap-2 cursor-pointer hover:bg-white dark:hover:bg-[#1a1a2e] transition-colors"
          >
            <div className={`w-2 h-2 rounded-full ${arrived ? 'bg-[#10B981]' : 'bg-[#6366F1] animate-pulse-dot'}`} />
            <span className="text-[12px] font-bold text-[#1A1D2B] dark:text-white">{primary.vesselName || primary.name}</span>
            {primary.voyageNumber && <span className="text-[10px] text-[#9CA3C0]">· {primary.voyageNumber}</span>}
          </div>
        </div>

        {/* Overlay: ETA (top-right) */}
        <div className="absolute top-3 right-3 z-10">
          <div className={`px-3 py-1.5 rounded-[10px] backdrop-blur-sm shadow-sm text-[11px] font-bold ${arrived ? 'bg-[#10B981]/90 text-white' : 'bg-white/95 dark:bg-[#1a1a2e]/95 border border-black/[0.04] dark:border-white/10 text-[#6366F1]'}`}>
            {etaText || (primary.eta ? `ETA ${new Date(primary.eta + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Tracking')}
          </div>
        </div>

        {/* Overlay: status label + transit % (bottom-left over the map) */}
        <div className="absolute bottom-3 left-3 z-10">
          <div className="px-3 py-1.5 rounded-[10px] bg-white/95 dark:bg-[#1a1a2e]/95 backdrop-blur-sm shadow-sm border border-black/[0.04] dark:border-white/10">
            <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#9CA3C0]">{shipLabel}</p>
            <p className="text-[12px] font-bold text-[#1A1D2B] dark:text-white tabular-nums">{pct}% transit</p>
          </div>
        </div>

        {/* Collecting indicator (top-right of footer area, only if any) */}
        {collecting.length > 0 && (
          <div className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F59E0B]/95 text-white text-[10px] font-bold shadow-sm">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {collecting.length} loading
          </div>
        )}
      </div>

      {/* Compact footer */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="text-[11px] text-[#6B7194]">
          {primary.trackingNumber ? `Houston → Tema · ${shipLabel}` : `${primary.name} · Loading in Houston`}
        </span>
        <div className="flex items-center gap-3">
          {collecting.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#F59E0B] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              {collecting.length} loading
            </span>
          )}
          {tracked.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#3B82F6] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
              {tracked.length} en route
            </span>
          )}
        </div>
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

  const retailValue = parseFloat(shipment.totalValue) || 0;
  const weightedValue = parseFloat(shipment.weightedValue) || retailValue;
  const hasWeights = Math.abs(retailValue - weightedValue) > 0.01;
  const max = shipment.maxCapacity || 30000;
  const pct = Math.min(Math.round((weightedValue / max) * 100), 100);
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
            <p className="text-[11px] text-[#6B7194] mt-1">${fmtCurrency(weightedValue)}</p>
            {hasWeights && <p className="text-[9px] text-[#9CA3C0] mt-0.5">retail ${fmtCurrency(retailValue)}</p>}
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
            <tr className="gc-thead-accent">
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Invoice #</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Customer</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Total</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Status</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-[0.8px]">Date</th>
            </tr>
          </thead>
          <tbody>
            {pickups.map((p) => (
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
                  <td className="px-6 py-3.5 font-display-tabular font-bold text-[15px] text-[#1A1D2B]">
                    ${fmtCurrency(p.finalTotal)}
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusPill status={p.paymentStatus} kind="payment" />
                  </td>
                  <td className="px-6 py-3.5 text-[#6B7194]">
                    {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
            ))}
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

      {/* Shipment tracker + KPI row — matched heights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] mb-[18px]" style={{ alignItems: 'stretch' }}>
        <ShipmentTrackerTile shipments={trackedShipments} />
        <div className="flex flex-col gap-[10px] justify-between gc-stagger">
        <KpiCard
          label="Active Shipments"
          value={metrics?.activeShipments ?? 0}
          subtext={`${metrics?.collectingCount || 0} loading · ${metrics?.enRouteCount || 0} en route`}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] mb-[18px]">
        <ContainerProgress shipment={activeShipment} />
        <RevenueTrend data={chart} />
      </div>

      {/* Recent invoices */}
      <RecentInvoicesTable pickups={pickups} totalCount={totalInvoices} />
    </>
  );
}
