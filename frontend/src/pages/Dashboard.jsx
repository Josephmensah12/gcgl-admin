import { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

function MetricCard({ title, value, subtitle, icon, color, trend }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    gold: 'bg-yellow-50 text-yellow-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trend && (
            <span className={`inline-flex items-center mt-2 text-xs font-medium ${trend.up ? 'text-green-600' : 'text-red-500'}`}>
              {trend.up ? '\u2191' : '\u2193'} {trend.label}
            </span>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color] || colorClasses.blue}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function AlertPanel({ alerts }) {
  if (!alerts.length) return null;

  const typeStyles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-3">Alerts</h3>
      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <div key={i} className={`px-4 py-3 rounded-lg border text-sm ${typeStyles[alert.type] || typeStyles.info}`}>
            <span className="font-medium">{alert.title}:</span> {alert.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentPickupsTable({ pickups }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Recent Invoices</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-3 font-medium">Invoice #</th>
              <th className="pb-3 font-medium">Customer</th>
              <th className="pb-3 font-medium">Total</th>
              <th className="pb-3 font-medium">Payment</th>
              <th className="pb-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pickups.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="py-3 font-medium text-gray-900">#{p.invoiceNumber}</td>
                <td className="py-3 text-gray-600">{p.customerName}</td>
                <td className="py-3 font-medium">${parseFloat(p.finalTotal).toFixed(2)}</td>
                <td className="py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                    ${p.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.paymentStatus}
                  </span>
                </td>
                <td className="py-3 text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pickups.length === 0 && <p className="text-center py-8 text-gray-400">No recent invoices</p>}
      </div>
    </div>
  );
}

function RevenueChart({ data }) {
  if (!data.length) return null;

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Revenue Trend</h3>
      <div className="flex items-end gap-2 h-40">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-gray-500 font-medium">
              ${d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue.toFixed(0)}
            </span>
            <div
              className="w-full bg-primary-500 rounded-t-md min-h-[4px] transition-all"
              style={{ height: `${(d.revenue / maxRevenue) * 120}px` }}
            />
            <span className="text-xs text-gray-400">{d.month.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContainerGauge({ shipment }) {
  if (!shipment) return null;
  const current = parseFloat(shipment.totalValue) || 0;
  const max = shipment.maxCapacity || 30000;
  const pct = Math.min((current / max) * 100, 100);
  const angle = (pct / 100) * 180; // 0-180 degrees for half circle

  // Color based on fill level
  const getColor = (p) => {
    if (p >= 90) return '#dc2626';
    if (p >= 70) return '#f59e0b';
    if (p >= 40) return '#2563eb';
    return '#94a3b8';
  };
  const color = getColor(pct);
  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // SVG arc path
  const startAngle = -180;
  const endAngle = startAngle + angle;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const r = 80;
  const cx = 100, cy = 100;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900">Container Progress</h3>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">collecting</span>
      </div>
      <p className="text-sm text-gray-500 mb-3">{shipment.name}</p>

      <div className="flex justify-center">
        <svg viewBox="0 0 200 120" className="w-full" style={{ maxWidth: '280px' }}>
          {/* Background arc */}
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="#e5e7eb" strokeWidth="18" strokeLinecap="round" />

          {/* Progress arc */}
          {pct > 0 && (
            <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" />
          )}

          {/* Percentage text */}
          <text x={cx} y={cy - 15} textAnchor="middle" className="text-[28px] font-black" fill={color}>
            {Math.round(pct)}%
          </text>
          <text x={cx} y={cy + 5} textAnchor="middle" className="text-[12px] font-medium" fill="#6b7280">
            {fmt(current)} / {fmt(max)}
          </text>

          {/* Min/Max labels */}
          <text x={cx - r - 5} y={cy + 15} textAnchor="middle" className="text-[9px]" fill="#9ca3af">$0</text>
          <text x={cx + r + 5} y={cy + 15} textAnchor="middle" className="text-[9px]" fill="#9ca3af">{fmt(max)}</text>
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        <div>
          <p className="text-xs text-gray-400">Invoices</p>
          <p className="text-sm font-bold text-gray-800">{shipment.stats?.invoiceCount || 0}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Paid</p>
          <p className="text-sm font-bold text-green-600">{fmt(shipment.stats?.paidValue || 0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Unpaid</p>
          <p className="text-sm font-bold text-red-600">{fmt(shipment.stats?.unpaidValue || 0)}</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [chart, setChart] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeShipment, setActiveShipment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [metricsRes, chartRes, pickupsRes, alertsRes, shipmentsRes] = await Promise.all([
        axios.get('/api/v1/dashboard/metrics'),
        axios.get('/api/v1/dashboard/revenue-chart'),
        axios.get('/api/v1/dashboard/recent-pickups'),
        axios.get('/api/v1/dashboard/alerts'),
        axios.get('/api/v1/shipments?status=collecting&limit=1'),
      ]);
      setMetrics(metricsRes.data.data);
      setChart(chartRes.data.data);
      setPickups(pickupsRes.data.data);
      setAlerts(alertsRes.data.data);
      const ships = shipmentsRes.data.data.shipments || [];
      if (ships.length > 0) setActiveShipment(ships[0]);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const revenueTrend = metrics?.revenueLastMonth > 0
    ? { up: metrics.revenueThisMonth >= metrics.revenueLastMonth, label: `${Math.abs(Math.round(((metrics.revenueThisMonth - metrics.revenueLastMonth) / metrics.revenueLastMonth) * 100))}% vs last month` }
    : null;

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Warehouse Invoices"
          value={metrics?.warehouseItems || 0}
          subtitle={fmt(metrics?.warehouseValue)}
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          color="blue"
        />
        <MetricCard
          title="Active Shipments"
          value={metrics?.activeShipments || 0}
          subtitle="Collecting & ready"
          icon="M8 17h8M8 17l-2 2m2-2l-2-2m10 2l2 2m-2-2l2-2M3 9h18M3 9a2 2 0 012-2h14a2 2 0 012 2M3 9v8a2 2 0 002 2h14a2 2 0 002-2V9"
          color="purple"
        />
        <MetricCard
          title="Revenue This Month"
          value={fmt(metrics?.revenueThisMonth)}
          subtitle={`${metrics?.invoicesThisMonth || 0} invoices`}
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          color="green"
          trend={revenueTrend}
        />
        <MetricCard
          title="Unpaid Invoices"
          value={fmt(metrics?.unpaidTotal)}
          subtitle={`${metrics?.unpaidCount || 0} invoices`}
          icon="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          color="red"
        />
      </div>

      {/* Alerts */}
      <AlertPanel alerts={alerts} />

      {/* Charts & Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={chart} />
        <ContainerGauge shipment={activeShipment} />
      </div>

      {/* Quick Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Stats</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center py-2">
            <span className="text-sm text-gray-600">Total Customers</span>
            <p className="font-bold text-lg text-gray-900">{metrics?.totalCustomers || 0}</p>
          </div>
          <div className="text-center py-2">
            <span className="text-sm text-gray-600">Invoices This Month</span>
            <p className="font-bold text-lg text-gray-900">{metrics?.invoicesThisMonth || 0}</p>
          </div>
          <div className="text-center py-2">
            <span className="text-sm text-gray-600">Warehouse Value</span>
            <p className="font-bold text-lg text-gray-900">{fmt(metrics?.warehouseValue)}</p>
          </div>
          <div className="text-center py-2">
            <span className="text-sm text-gray-600">Active Shipments</span>
            <p className="font-bold text-lg text-gray-900">{metrics?.activeShipments || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <RecentPickupsTable pickups={pickups} />
    </div>
  );
}
