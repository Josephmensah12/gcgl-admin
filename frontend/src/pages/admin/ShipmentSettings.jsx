import { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/layout/PageHeader';
import { useLayout } from '../../components/layout/Layout';

export default function ShipmentSettings() {
  const { onMenuClick } = useLayout();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/v1/settings')
      .then((res) => setSettings(res.data.data.shipmentSettings || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put('/api/v1/settings/shipmentSettings', settings);
      alert('Shipment settings saved');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="Shipment Configuration" subtitle="Capacity tracking and alert thresholds" onMenuClick={onMenuClick} hideSearch />
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="gc-card p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Shipment Configuration</h2>

        <div className="space-y-6">
          {/* Capacity Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Capacity Tracking Method</label>
            <div className="flex gap-3">
              {['money', 'volume', 'weight'].map((type) => (
                <button
                  key={type}
                  onClick={() => setSettings((s) => ({ ...s, capacityType: type }))}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium capitalize transition-colors
                    ${settings?.capacityType === type
                      ? 'bg-primary-50 border-primary-500 text-primary-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Money Thresholds */}
          {settings?.capacityType === 'money' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Threshold ($)</label>
                <input
                  type="number"
                  value={settings?.moneyThresholds?.min || 25000}
                  onChange={(e) => setSettings((s) => ({ ...s, moneyThresholds: { ...s.moneyThresholds, min: parseInt(e.target.value) } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Threshold ($)</label>
                <input
                  type="number"
                  value={settings?.moneyThresholds?.max || 30000}
                  onChange={(e) => setSettings((s) => ({ ...s, moneyThresholds: { ...s.moneyThresholds, max: parseInt(e.target.value) } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {settings?.capacityType === 'volume' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Volume Capacity (cubic feet)</label>
              <input
                type="number"
                value={settings?.volumeCapacity || 2390}
                onChange={(e) => setSettings((s) => ({ ...s, volumeCapacity: parseInt(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Standard 40ft container: ~2,390 cubic feet</p>
            </div>
          )}

          {settings?.capacityType === 'weight' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight Capacity (pounds)</label>
              <input
                type="number"
                value={settings?.weightCapacity || 67200}
                onChange={(e) => setSettings((s) => ({ ...s, weightCapacity: parseInt(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Standard 40ft container: ~67,200 lbs</p>
            </div>
          )}

          {/* Capacity Weight Factors */}
          <div>
            <h3 className="font-medium text-gray-900 mb-1">Capacity Weight Factors</h3>
            <p className="text-xs text-gray-500 mb-3">
              Reduce the capacity impact of high-value items (like TVs). A weight of 0.15 means a $1,000 TV counts as $150 toward container capacity.
              Keywords are matched against line item descriptions.
            </p>
            <div className="space-y-2">
              {(settings?.capacityWeights || []).map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Keyword (e.g. TV)"
                    value={rule.match || ''}
                    onChange={(e) => {
                      const updated = [...(settings.capacityWeights || [])];
                      updated[idx] = { ...updated[idx], match: e.target.value };
                      setSettings((s) => ({ ...s, capacityWeights: updated }));
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="2"
                    placeholder="Weight"
                    value={rule.weight ?? ''}
                    onChange={(e) => {
                      const updated = [...(settings.capacityWeights || [])];
                      updated[idx] = { ...updated[idx], weight: parseFloat(e.target.value) || 0 };
                      setSettings((s) => ({ ...s, capacityWeights: updated }));
                    }}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => {
                      const updated = (settings.capacityWeights || []).filter((_, i) => i !== idx);
                      setSettings((s) => ({ ...s, capacityWeights: updated }));
                    }}
                    className="w-8 h-8 rounded-full bg-red-100 text-red-500 text-sm flex items-center justify-center hover:bg-red-200"
                  >x</button>
                </div>
              ))}
              <button
                onClick={() => setSettings((s) => ({ ...s, capacityWeights: [...(s.capacityWeights || []), { match: '', weight: 0.15 }] }))}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600"
              >
                + Add Weight Rule
              </button>
            </div>
          </div>

          {/* Alert Thresholds */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Alert Thresholds</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Warehouse Aging Alert (days)</label>
                <input
                  type="number"
                  value={settings?.alertThresholds?.warehouseAging || 7}
                  onChange={(e) => setSettings((s) => ({ ...s, alertThresholds: { ...s.alertThresholds, warehouseAging: parseInt(e.target.value) } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Capacity Warning (%)</label>
                <input
                  type="number"
                  value={(settings?.alertThresholds?.capacityWarning || 0.9) * 100}
                  onChange={(e) => setSettings((s) => ({ ...s, alertThresholds: { ...s.alertThresholds, capacityWarning: parseInt(e.target.value) / 100 } }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
                  min="50" max="100"
                />
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Shipment Settings'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
