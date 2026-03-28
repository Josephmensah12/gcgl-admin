import { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function CompanySettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    axios.get('/api/v1/settings')
      .then((res) => {
        setSettings(res.data.data);
        setForm(res.data.data.companyInfo || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put('/api/v1/settings/companyInfo', form);
      alert('Company settings saved');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-6">Company Information</h2>
        <div className="space-y-4">
          {[
            { key: 'name', label: 'Company Name' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
            { key: 'website', label: 'Website' },
            { key: 'address', label: 'Business Address', type: 'textarea' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              {type === 'textarea' ? (
                <textarea
                  value={form[key] || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  rows={3}
                />
              ) : (
                <input
                  type="text"
                  value={form[key] || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              )}
            </div>
          ))}

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Company Settings'}
          </button>
        </div>
      </div>

      {/* Branding */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Branding</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
            <div className="flex gap-3 items-center">
              <input
                type="color"
                value={settings?.branding?.primaryColor || '#1e40af'}
                onChange={(e) => setSettings((s) => ({ ...s, branding: { ...s.branding, primaryColor: e.target.value } }))}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <span className="text-sm text-gray-500">{settings?.branding?.primaryColor || '#1e40af'}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer Text</label>
            <textarea
              value={settings?.branding?.footerText || ''}
              onChange={(e) => setSettings((s) => ({ ...s, branding: { ...s.branding, footerText: e.target.value } }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm"
              rows={2}
              placeholder="Thank you for shipping with GCGL..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
