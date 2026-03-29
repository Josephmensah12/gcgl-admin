import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

export default function BankSettings() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/bank/connections');
      setConnections(res.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleConnect = async () => {
    try {
      const res = await axios.post('/api/v1/bank/link-token');
      const linkToken = res.data.data.link_token;

      // Check if Plaid Link is loaded
      if (!window.Plaid) {
        alert('Plaid Link script not loaded. Add the Plaid script to your HTML or configure PLAID_CLIENT_ID in environment variables.');
        return;
      }

      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            await axios.post('/api/v1/bank/exchange-token', {
              public_token: publicToken,
              institution: metadata.institution,
              accounts: metadata.accounts.map((a) => a.id),
            });
            loadConnections();
          } catch (err) {
            alert('Failed to connect account');
          }
        },
        onExit: (err) => {
          if (err) console.error('Plaid exit error:', err);
        },
      });
      handler.open();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to start bank connection');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await axios.post('/api/v1/bank/sync');
      setSyncResult(res.data.data);
      loadConnections();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRemove = async (id) => {
    if (!confirm('Deactivate this bank connection?')) return;
    try {
      await axios.delete(`/api/v1/bank/connections/${id}`);
      loadConnections();
    } catch (err) {
      alert('Failed to remove connection');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Bank Connections</h2>
        <p className="text-sm text-gray-500 mb-6">Connect your bank accounts via Plaid for automated expense tracking.</p>

        {/* Connected accounts */}
        {connections.length > 0 ? (
          <div className="space-y-3 mb-6">
            {connections.map((conn) => (
              <div key={conn.id} className={`flex items-center justify-between p-4 rounded-lg border ${conn.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{conn.account_nickname}</p>
                    <p className="text-xs text-gray-500">
                      {conn.account_type === 'credit' ? 'Credit Card' : 'Checking'} &middot;
                      Last sync: {conn.last_sync ? new Date(conn.last_sync).toLocaleString() : 'Never'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {conn.is_active && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Active</span>
                  )}
                  <button onClick={() => handleRemove(conn.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 mb-6">
            <p>No bank accounts connected</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleConnect}
            className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
            + Connect Bank Account
          </button>
          {connections.some((c) => c.is_active) && (
            <button onClick={handleSync} disabled={syncing}
              className="px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>

        {syncResult && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="font-medium text-blue-700">Sync complete: {syncResult.imported} new transactions imported</p>
            {syncResult.errors?.length > 0 && (
              <div className="mt-2 text-red-600">
                {syncResult.errors.map((e, i) => <p key={i}>{e.bank}: {e.error}</p>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Security</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Bank-grade encryption for all transaction data</p>
          <p>Read-only access — cannot make transactions or transfers</p>
          <p>Access tokens encrypted at rest</p>
          <p>Powered by Plaid — trusted by millions of users</p>
        </div>
      </div>

      {/* Environment setup note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
        <p className="font-medium mb-1">Setup Required</p>
        <p>Set these environment variables on Railway:</p>
        <code className="block mt-2 bg-amber-100 p-2 rounded text-xs">
          PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENVIRONMENT (sandbox/production), ENCRYPTION_KEY
        </code>
      </div>
    </div>
  );
}
