import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/layout/PageHeader';
import { useLayout } from '../../components/layout/Layout';

const MAX_LOGO_BYTES = 500 * 1024; // 500 KB cap to keep settings JSONB tidy

export default function CompanySettings() {
  const { onMenuClick } = useLayout();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [logoError, setLogoError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    axios.get('/api/v1/settings')
      .then((res) => {
        setSettings(res.data.data);
        setForm(res.data.data.companyInfo || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');

    if (!file.type.startsWith('image/')) {
      setLogoError('File must be an image (PNG, JPG, SVG)');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Image is ${Math.round(file.size / 1024)}KB — keep it under 500KB. Try resizing in Preview or an online optimizer.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm((f) => ({ ...f, logo: ev.target.result }));
    };
    reader.onerror = () => setLogoError('Failed to read file');
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setForm((f) => ({ ...f, logo: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
    <>
      <PageHeader title="Company Settings" subtitle="Name, contact, logo & terms" onMenuClick={onMenuClick} hideSearch />
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Logo card */}
        <div className="gc-card p-6">
          <h2 className="text-lg font-bold text-[#1A1D2B] mb-4">Logo</h2>
          <p className="text-[13px] text-[#6B7194] mb-4">
            Used on printable invoices, packing lists, and emailed invoices. Max 500KB. PNG or SVG recommended.
          </p>

          <div className="flex items-start gap-5">
            <div className="shrink-0">
              {form.logo ? (
                <div className="w-[140px] h-[140px] rounded-[12px] border border-black/[0.06] bg-white flex items-center justify-center p-3">
                  <img src={form.logo} alt="Company logo" className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div
                  className="w-[140px] h-[140px] rounded-[12px] flex items-center justify-center text-white font-bold text-2xl"
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
                  }}
                >
                  GC
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <label className="inline-flex items-center gap-2 h-10 px-4 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {form.logo ? 'Replace' : 'Upload Logo'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              {form.logo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="ml-2 h-10 px-4 rounded-[10px] bg-[#F4F6FA] text-[#6B7194] text-[13px] font-medium hover:bg-[#E9EBF2] transition-colors"
                >
                  Remove
                </button>
              )}
              {logoError && (
                <p className="mt-3 text-[12px] text-[#EF4444]">{logoError}</p>
              )}
              <p className="mt-3 text-[11px] text-[#9CA3C0]">
                Falls back to the default gold-gradient "GC" badge when no logo is set.
              </p>
            </div>
          </div>
        </div>

        {/* Company info */}
        <div className="gc-card p-6">
          <h2 className="text-lg font-bold text-[#1A1D2B] mb-4">Company Information</h2>
          <div className="space-y-4">
            {[
              { key: 'name', label: 'Company Name' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'website', label: 'Website' },
              { key: 'address', label: 'Business Address', type: 'textarea' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-[12.5px] font-semibold text-[#1A1D2B] mb-1.5">{label}</label>
                {type === 'textarea' ? (
                  <textarea
                    value={form[key] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all"
                    rows={3}
                  />
                ) : (
                  <input
                    type="text"
                    value={form[key] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="gc-input"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="gc-card p-6">
          <h2 className="text-lg font-bold text-[#1A1D2B] mb-2">Invoice Terms & Conditions</h2>
          <p className="text-[13px] text-[#6B7194] mb-4">
            Printed as the footnote on every invoice (printable version and customer email). Leave blank to hide.
          </p>
          <textarea
            value={form.termsAndConditions || ''}
            onChange={(e) => setForm((f) => ({ ...f, termsAndConditions: e.target.value }))}
            rows={8}
            placeholder={`Example:
1. Payment is due within 7 days of invoice date.
2. Late payments incur a 2% monthly service charge.
3. Items are shipped at customer's risk unless insured.
4. Refunds available within 14 days of delivery...`}
            className="w-full px-3 py-2.5 rounded-[10px] border border-black/[0.06] bg-white text-[13px] text-[#1A1D2B] placeholder:text-[#9CA3C0] focus:border-[#6366F1] focus:ring-2 focus:ring-[rgba(99,102,241,0.15)] outline-none transition-all font-mono leading-relaxed"
          />
          <p className="mt-2 text-[11px] text-[#9CA3C0]">
            {(form.termsAndConditions || '').length} characters
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-11 rounded-[10px] bg-[#6366F1] text-white text-[14px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50 shadow-[0_4px_15px_rgba(99,102,241,0.25)] transition-all"
        >
          {saving ? 'Saving…' : 'Save Company Settings'}
        </button>
      </div>
    </>
  );
}
