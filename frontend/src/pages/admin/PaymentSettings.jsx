import { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/layout/PageHeader';
import { useLayout } from '../../components/layout/Layout';
import toast from 'react-hot-toast';

export default function PaymentSettings() {
  const { onMenuClick } = useLayout();
  const [methods, setMethods] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/v1/settings')
      .then((res) => setMethods(res.data.data.paymentMethods || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put('/api/v1/settings/paymentMethods', methods);
      toast.success('Payment settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const methodConfig = [
    { key: 'cash', label: 'Cash', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    { key: 'check', label: 'Check', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'zelle', label: 'Zelle', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { key: 'square', label: 'Square', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ];

  return (
    <>
      <PageHeader title="Payment Methods" subtitle="Enable and configure accepted payment options" onMenuClick={onMenuClick} hideSearch />
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="gc-card p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Payment Methods</h2>

        <div className="space-y-6">
          {methodConfig.map(({ key, label, icon }) => (
            <div key={key} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                  <span className="font-medium text-gray-900">{label}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={methods?.[key]?.enabled || false}
                    onChange={(e) => setMethods((m) => ({ ...m, [key]: { ...m[key], enabled: e.target.checked } }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
              {methods?.[key]?.enabled && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Instructions for customers</label>
                  <textarea
                    value={methods?.[key]?.instructions || ''}
                    onChange={(e) => setMethods((m) => ({ ...m, [key]: { ...m[key], instructions: e.target.value } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    rows={2}
                    placeholder={`Instructions for ${label} payment...`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full mt-6 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Payment Settings'}
        </button>
      </div>
    </div>
    </>
  );
}
