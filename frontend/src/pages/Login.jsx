import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1629] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 mx-auto rounded-[14px] flex items-center justify-center text-white font-bold text-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              boxShadow: '0 4px 15px rgba(245,158,11,0.3)',
            }}
          >
            GC
          </div>
          <h1 className="text-[24px] font-extrabold text-white tracking-[-0.5px]">GCGL Admin Portal</h1>
          <p className="text-white/50 text-[13px] mt-1.5">Gold Coast Global Logistics</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[16px] shadow-[0_10px_40px_rgba(0,0,0,0.3)] p-8 space-y-5"
        >
          {error && (
            <div className="bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] text-[#EF4444] px-4 py-3 rounded-[10px] text-[13px]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[12.5px] font-semibold text-[#1A1D2B] mb-2 uppercase tracking-wide">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="gc-input"
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-[#1A1D2B] mb-2 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="gc-input"
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-[10px] bg-[#6366F1] text-white font-semibold text-[14px] hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_15px_rgba(99,102,241,0.3)]"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/30 text-[11px] mt-6 tracking-wide">
          LOGISTICS PORTAL · v2
        </p>
      </div>
    </div>
  );
}
