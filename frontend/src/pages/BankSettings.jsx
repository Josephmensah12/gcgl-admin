import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '../components/layout/PageHeader';
import { useLayout } from '../components/layout/Layout';

export default function BankSettings() {
  const { onMenuClick } = useLayout();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [csvAccount, setCsvAccount] = useState('Bank of America');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvText, setCsvText] = useState(null);

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
        toast.success('Plaid Link script not loaded. Add the Plaid script to your HTML or configure PLAID_CLIENT_ID in environment variables.');
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
            toast.error('Failed to connect account');
          }
        },
        onExit: (err) => {
          if (err) console.error('Plaid exit error:', err);
        },
      });
      handler.open();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to start bank connection');
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
      toast.error(err.response?.data?.error?.message || 'Sync failed');
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
      toast.error('Failed to remove connection');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="Bank Accounts" subtitle="Plaid connections and CSV imports" onMenuClick={onMenuClick} hideSearch />
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="gc-card p-6">
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

      {/* CSV Import */}
      <div className="gc-card p-6">
        <h3 className="font-semibold text-gray-900 mb-2">Import from CSV</h3>
        <p className="text-sm text-gray-500 mb-4">Upload a bank or credit card statement export (CSV format) to import transactions for review.</p>
import toast from 'react-hot-toast';

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <select value={csvAccount} onChange={(e) => setCsvAccount(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
              <option value="Bank of America">Bank of America (Checking)</option>
              <option value="Capital One">Capital One (Credit Card)</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
            <input type="file" accept=".csv,.txt" onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              setImporting(true);
              setImportResult(null);
              setCsvPreview(null);
              try {
                const text = await file.text();
                setCsvText(text);
                const res = await axios.post('/api/v1/bank/preview-csv', { csvData: text, accountLabel: csvAccount });
                setCsvPreview(res.data.data);
              } catch (err) {
                setImportResult({ error: err.response?.data?.error?.message || 'Preview failed' });
              } finally {
                setImporting(false);
                e.target.value = '';
              }
            }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-primary-50 file:text-primary-600 file:font-medium file:text-sm file:cursor-pointer"
              disabled={importing} />
          </div>

          {importing && <p className="text-sm text-primary-600 font-medium">Processing...</p>}

          {/* Preview */}
          {csvPreview && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-blue-800 text-sm">Preview — {csvPreview.parsedCount} transactions found</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-white rounded text-center">
                  <p className="text-lg font-bold text-red-600">{csvPreview.debits.count}</p>
                  <p className="text-xs text-gray-500">Debits (${csvPreview.debits.total.toFixed(2)})</p>
                </div>
                <div className="p-2 bg-white rounded text-center">
                  <p className="text-lg font-bold text-green-600">{csvPreview.credits.count}</p>
                  <p className="text-xs text-gray-500">Credits (${csvPreview.credits.total.toFixed(2)})</p>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500"><th className="py-1">Date</th><th>Description</th><th className="text-right">Amount</th><th>Type</th></tr></thead>
                  <tbody>
                    {csvPreview.sample.map((t, i) => (
                      <tr key={i} className="border-t border-blue-100">
                        <td className="py-1">{t.date}</td>
                        <td className="truncate max-w-[200px]">{t.description}</td>
                        <td className={`text-right font-medium ${t.isCredit ? 'text-green-600' : 'text-red-600'}`}>{t.isCredit ? '+' : '-'}${t.amount.toFixed(2)}</td>
                        <td><span className={`px-1 rounded text-xs ${t.isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.isCredit ? 'IN' : 'OUT'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setCsvPreview(null); setCsvText(null); }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button onClick={async () => {
                  setImporting(true);
                  try {
                    const res = await axios.post('/api/v1/bank/import-csv', { csvData: csvText, accountLabel: csvAccount });
                    setImportResult(res.data.data);
                    setCsvPreview(null);
                    setCsvText(null);
                  } catch (err) {
                    setImportResult({ error: err.response?.data?.error?.message || 'Import failed' });
                  } finally { setImporting(false); }
                }} disabled={importing}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {importing ? 'Importing...' : `Import ${csvPreview.parsedCount} Transactions`}
                </button>
              </div>
            </div>
          )}

          {importResult && !importResult.error && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <p className="font-medium">{importResult.message}</p>
              <p className="text-xs mt-1">Total: {importResult.total} | Imported: {importResult.imported} | Skipped: {importResult.skipped}</p>
            </div>
          )}

          {importResult?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{importResult.error}</div>
          )}
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-600 mb-1">Supported CSV Formats:</p>
          <p className="text-xs text-gray-500">Bank of America: Date, Description, Amount, Running Bal</p>
          <p className="text-xs text-gray-500">Capital One: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit</p>
          <p className="text-xs text-gray-500">Generic: Date, Description/Memo, Amount (or Debit/Credit columns)</p>
        </div>
      </div>

      {/* Security info */}
      <div className="gc-card p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Security</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Bank-grade encryption for all transaction data</p>
          <p>Read-only access — cannot make transactions or transfers</p>
          <p>Access tokens encrypted at rest</p>
          <p>Powered by Plaid — trusted by millions of users</p>
        </div>
      </div>

    </div>
    </>
  );
}
