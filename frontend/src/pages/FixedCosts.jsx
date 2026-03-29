import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

function OverrideModal({ shipment, onClose, onSaved }) {
  const [startDate, setStartDate] = useState(shipment.admin_start_date_override || shipment.start_date || '');
  const [endDate, setEndDate] = useState(shipment.admin_end_date_override || shipment.end_date || '');
  const [notes, setNotes] = useState(shipment.fixed_cost_notes || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.post(`/api/v1/fixed-costs/shipments/${shipment.id}/override-dates`, { startDate: startDate || null, endDate: endDate || null, notes });
      onSaved();
    } catch (err) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-amber-50">
          <h2 className="text-lg font-semibold">Override Dates — {shipment.name}</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            Changing dates will recalculate all fixed cost allocations for this shipment.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for override..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" rows={2} />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={loading}
              className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              {loading ? 'Applying...' : 'Apply Override'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualAllocationModal({ shipment, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!amount) return;
    setLoading(true);
    try {
      await axios.post(`/api/v1/fixed-costs/shipments/${shipment.id}/manual-allocation`, { amount: parseFloat(amount), date });
      onSaved();
    } catch (err) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b"><h2 className="text-lg font-semibold">Manual Allocation — {shipment.name}</h2></div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm">Cancel</button>
            <button onClick={handleSave} disabled={loading || !amount}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {loading ? 'Adding...' : 'Add Allocation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FixedCosts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overrideShipment, setOverrideShipment] = useState(null);
  const [manualShipment, setManualShipment] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [detailShipmentId, setDetailShipmentId] = useState(null);
  const [detail, setDetail] = useState(null);

  const loadData = () => axios.get('/api/v1/fixed-costs/dashboard').then((r) => setData(r.data.data)).catch(console.error).finally(() => setLoading(false));
  useEffect(() => { loadData(); }, []);

  const loadDetail = (id) => {
    setDetailShipmentId(id);
    axios.get(`/api/v1/fixed-costs/shipments/${id}`).then((r) => setDetail(r.data.data)).catch(console.error);
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await axios.post('/api/v1/fixed-costs/trigger-allocation');
      alert(`Allocation complete: $${res.data.data.dailyRate}/day allocated to ${res.data.data.shipments?.length || 0} shipment(s)`);
      loadData();
    } catch (err) { alert(err.response?.data?.error?.message || 'Failed'); }
    finally { setTriggering(false); }
  };

  const handleToggleCategory = async (catId) => {
    try {
      await axios.post(`/api/v1/fixed-costs/categories/${catId}/toggle-fixed`);
      loadData();
    } catch (err) { alert('Failed to toggle'); }
  };

  const handleSaved = () => { setOverrideShipment(null); setManualShipment(null); loadData(); if (detailShipmentId) loadDetail(detailShipmentId); };

  const fmt = (n) => `$${(parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <LoadingSpinner text="Loading fixed costs..." />;

  const mc = data?.monthlyFixedCosts;

  return (
    <div className="space-y-6">
      {overrideShipment && <OverrideModal shipment={overrideShipment} onClose={() => setOverrideShipment(null)} onSaved={handleSaved} />}
      {manualShipment && <ManualAllocationModal shipment={manualShipment} onClose={() => setManualShipment(null)} onSaved={handleSaved} />}

      {/* Monthly Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Monthly Fixed Costs</p>
          <p className="text-2xl font-bold text-gray-900">{mc ? fmt(mc.total_fixed_costs) : '$0.00'}</p>
          <p className="text-xs text-gray-400">{mc?.month_year || 'Not calculated'}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Daily Rate</p>
          <p className="text-2xl font-bold text-primary-600">{mc ? fmt(mc.daily_rate) : '$0.00'}</p>
          <p className="text-xs text-gray-400">{mc?.days_in_month || 0} days this month</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Active Shipments</p>
          <p className="text-2xl font-bold text-green-600">{data?.activeShipments?.length || 0}</p>
          <p className="text-xs text-gray-400">receiving allocations</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between">
          <p className="text-sm text-gray-500 mb-2">Manual Trigger</p>
          <button onClick={handleTrigger} disabled={triggering}
            className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {triggering ? 'Running...' : 'Run Today\'s Allocation'}
          </button>
        </div>
      </div>

      {/* Fixed Cost Categories */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Fixed Cost Categories</h3>
        <p className="text-xs text-gray-500 mb-3">Toggle which expense categories count as fixed costs for daily allocation.</p>
        <div className="flex flex-wrap gap-2">
          {data?.fixedCategories?.map((c) => (
            <span key={c.id} className="px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">{c.name}</span>
          ))}
          {(!data?.fixedCategories || data.fixedCategories.length === 0) && (
            <p className="text-sm text-gray-400">No categories marked as fixed cost. Go to Expenses > Categories to mark them.</p>
          )}
        </div>
      </div>

      {/* Active Shipments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Shipment Fixed Cost Tracking</h3>
        <div className="space-y-3">
          {data?.activeShipments?.map((sh) => (
            <div key={sh.id} className="p-4 rounded-lg border border-gray-200 hover:border-primary-300 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-gray-900">{sh.name}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium
                    ${sh.status === 'collecting' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{sh.status}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => loadDetail(sh.id)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Details</button>
                  <button onClick={() => setManualShipment(sh)} className="text-xs text-green-600 hover:text-green-700 font-medium">+ Manual</button>
                  <button onClick={() => setOverrideShipment(sh)} className="text-xs text-amber-600 hover:text-amber-700 font-medium">Override</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div><p className="text-lg font-bold text-gray-900">{sh.active_days || 0}</p><p className="text-xs text-gray-500">Active Days</p></div>
                <div><p className="text-lg font-bold text-red-600">{fmt(sh.accrued_fixed_costs)}</p><p className="text-xs text-gray-500">Fixed Costs</p></div>
                <div><p className="text-sm text-gray-600">{sh.start_date ? new Date(sh.start_date).toLocaleDateString() : 'Not set'}</p><p className="text-xs text-gray-500">Start</p></div>
                <div><p className="text-sm text-gray-600">{sh.end_date ? new Date(sh.end_date).toLocaleDateString() : 'Active'}</p><p className="text-xs text-gray-500">End</p></div>
              </div>
            </div>
          ))}
          {(!data?.activeShipments || data.activeShipments.length === 0) && (
            <p className="text-center py-6 text-gray-400">No active shipments</p>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {detail && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Allocation Detail — {detail.shipment?.name}</h3>
            <button onClick={() => { setDetail(null); setDetailShipmentId(null); }} className="text-xs text-gray-500">Close</button>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xl font-bold">{detail.activeDays}</p><p className="text-xs text-gray-500">Days</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xl font-bold text-red-600">{fmt(detail.totalAllocated)}</p><p className="text-xs text-gray-500">Total Allocated</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xl font-bold">{detail.monthlyBreakdown?.length || 0}</p><p className="text-xs text-gray-500">Months</p>
            </div>
          </div>
          {/* Monthly breakdown */}
          {detail.monthlyBreakdown?.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Monthly Breakdown</h4>
              <div className="space-y-1">
                {detail.monthlyBreakdown.map((m) => (
                  <div key={m.month_year} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{m.month_year}</span>
                    <span className="text-gray-500">{m.days_allocated} days</span>
                    <span className="font-medium">{fmt(m.monthly_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Recent allocations */}
          <h4 className="text-sm font-medium text-gray-700 mb-2">Allocation History</h4>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {detail.allocations?.map((a) => (
              <div key={a.id} className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50">
                <span className="text-gray-600">{new Date(a.allocation_date).toLocaleDateString()}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${a.allocation_type === 'manual' ? 'bg-blue-100 text-blue-700' : a.allocation_type === 'override' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                  {a.allocation_type}
                </span>
                <span className="font-medium">{fmt(a.allocated_amount)}</span>
              </div>
            ))}
            {(!detail.allocations || detail.allocations.length === 0) && <p className="text-sm text-gray-400 py-2">No allocations yet</p>}
          </div>
        </div>
      )}

      {/* Recent Allocations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Recent Allocations (Last 14 Days)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Shipment</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.recentAllocations?.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{new Date(a.allocation_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium">{a.shipment?.name || 'Gap Period'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium
                      ${a.allocation_type === 'automatic' ? 'bg-green-100 text-green-700'
                        : a.allocation_type === 'manual' ? 'bg-blue-100 text-blue-700'
                        : a.allocation_type === 'gap_period' ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'}`}>
                      {a.allocation_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(a.allocated_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!data?.recentAllocations || data.recentAllocations.length === 0) && (
            <p className="text-center py-8 text-gray-400">No recent allocations</p>
          )}
        </div>
      </div>
    </div>
  );
}
