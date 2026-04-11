import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';

export default function CreateShipment() {
  const { onMenuClick } = useLayout();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [capacityType, setCapacityType] = useState('money');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/v1/shipments', { name: name || undefined, capacityType });
      navigate(`/shipments/${res.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create shipment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Create Shipment"
        subtitle="Start a new container for collecting invoices"
        onMenuClick={onMenuClick}
        hideSearch
      />
      <div className="max-w-lg mx-auto">
        <div className="gc-card p-7">
          {error && (
            <div className="bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] text-[#EF4444] px-4 py-3 rounded-[10px] text-[13px] mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[12.5px] font-semibold text-[#1A1D2B] mb-2 uppercase tracking-wide">
                Shipment Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-generated if empty (YYYY-MM-DD-###)"
                className="gc-input"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-[#1A1D2B] mb-2 uppercase tracking-wide">
                Capacity Tracking
              </label>
              <select
                value={capacityType}
                onChange={(e) => setCapacityType(e.target.value)}
                className="gc-input"
              >
                <option value="money">Money-Based ($25k–$30k)</option>
                <option value="volume">Volume-Based (cubic feet)</option>
                <option value="weight">Weight-Based (pounds)</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/shipments')}
                className="flex-1 h-11 rounded-[10px] border border-black/[0.06] text-[13px] font-medium text-[#6B7194] hover:bg-[#F4F6FA] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-11 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5] disabled:opacity-50 shadow-[0_4px_15px_rgba(99,102,241,0.25)] transition-all"
              >
                {loading ? 'Creating…' : 'Create Shipment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
