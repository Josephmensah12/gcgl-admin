import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

/* ─────────────────────────────────────────────────────────── */
/*  Printable packing list (price-stripped)                    */
/* ─────────────────────────────────────────────────────────── */

export function PackingListSheet({ invoice, shipmentName, company }) {
  const totalItems = (invoice.lineItems || []).reduce((sum, li) => sum + (parseInt(li.quantity) || 1), 0);

  return (
    <div className="packing-sheet">
      {/* Header */}
      <div className="ps-header">
        <div className="ps-brand">
          {company?.logo ? (
            <img src={company.logo} alt="Logo" className="ps-brand-logo" />
          ) : (
            <div className="ps-brand-icon">GC</div>
          )}
          <div>
            <p className="ps-brand-name">{company?.name || 'Gold Coast Global Logistics'}</p>
            <p className="ps-brand-sub">Packing List</p>
          </div>
        </div>
        <div className="ps-meta">
          <div>
            <p className="ps-meta-label">Invoice #</p>
            <p className="ps-meta-value">#{invoice.invoiceNumber}</p>
          </div>
          <div>
            <p className="ps-meta-label">Date</p>
            <p className="ps-meta-value-sm">{new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Customer + Recipient blocks */}
      <div className="ps-parties">
        <div className="ps-party">
          <p className="ps-party-label">Shipper</p>
          <p className="ps-party-name">{invoice.customerName}</p>
          <p className="ps-party-line">{invoice.customerPhone || ''}</p>
          {invoice.customerEmail && invoice.customerEmail !== 'noemail@gcgl.com' && (
            <p className="ps-party-line">{invoice.customerEmail}</p>
          )}
          <p className="ps-party-line">{invoice.customerAddress}</p>
        </div>
        <div className="ps-party">
          <p className="ps-party-label">Deliver To</p>
          <p className="ps-party-name">{invoice.recipientName || invoice.customerName}</p>
          <p className="ps-party-line">{invoice.recipientPhone || invoice.customerPhone}</p>
          <p className="ps-party-line">{invoice.recipientAddress || invoice.customerAddress}</p>
        </div>
      </div>

      {shipmentName && (
        <div className="ps-shipment-banner">
          <span className="ps-shipment-label">Shipment</span>
          <span className="ps-shipment-name">{shipmentName}</span>
        </div>
      )}

      {/* Items (NO prices) */}
      <table className="ps-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>#</th>
            <th>Description</th>
            <th style={{ width: '22%' }}>Dimensions (in)</th>
            <th style={{ width: '10%', textAlign: 'center' }}>Qty</th>
            <th style={{ width: '12%' }}>Received</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.lineItems || []).map((li, idx) => {
            const dims = (li.dimensionsL && li.dimensionsW && li.dimensionsH)
              ? `${li.dimensionsL} × ${li.dimensionsW} × ${li.dimensionsH}`
              : '';
            return (
              <tr key={li.id || idx}>
                <td>{idx + 1}</td>
                <td>{li.catalogName || li.description || 'Custom Item'}</td>
                <td>{dims}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{li.quantity}</td>
                <td className="ps-check-cell">&nbsp;</td>
              </tr>
            );
          })}
          {/* Pad empty rows so the signature block is at a predictable position */}
          {Array.from({ length: Math.max(0, 6 - (invoice.lineItems || []).length) }).map((_, i) => (
            <tr key={`pad-${i}`} className="ps-pad-row">
              <td>&nbsp;</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total pieces</td>
            <td style={{ textAlign: 'center', fontWeight: 800 }}>{totalItems}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {/* Acknowledgement + signatures */}
      <div className="ps-ack">
        I acknowledge receipt of the items listed above in good condition.
      </div>

      <div className="ps-signatures">
        <div className="ps-sig">
          <div className="ps-sig-line"></div>
          <p className="ps-sig-label">Recipient signature</p>
        </div>
        <div className="ps-sig">
          <div className="ps-sig-line"></div>
          <p className="ps-sig-label">Date</p>
        </div>
      </div>

      <div className="ps-footer">
        <span>Gold Coast Global Logistics · Packing List · Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Single-invoice route                                        */
/* ─────────────────────────────────────────────────────────── */

export default function PackingList() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`/api/v1/pickups/${id}`),
      axios.get('/api/v1/settings').catch(() => ({ data: { data: {} } })),
    ])
      .then(([invRes, setRes]) => {
        setInvoice(invRes.data.data);
        setCompany((setRes.data.data || {}).companyInfo || null);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!loading && invoice) {
      document.body.classList.add('print-mode');
      return () => document.body.classList.remove('print-mode');
    }
  }, [loading, invoice]);

  if (loading) return <LoadingSpinner />;
  if (!invoice) return <p className="text-center py-12 text-[#9CA3C0]">Invoice not found</p>;

  return (
    <div className="packing-viewport">
      <div className="packing-toolbar no-print">
        <Link to={`/pickups/${id}`} className="packing-toolbar-back">← Back to invoice</Link>
        <button onClick={() => window.print()} className="packing-toolbar-print">Print</button>
      </div>
      <PackingListSheet invoice={invoice} shipmentName={invoice.Shipment?.name} company={company} />
    </div>
  );
}
