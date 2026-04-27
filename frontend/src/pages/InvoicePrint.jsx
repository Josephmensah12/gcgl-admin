import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

/* ─────────────────────────────────────────────────────────── */
/*  Printable invoice sheet (WITH prices)                       */
/* ─────────────────────────────────────────────────────────── */

export function InvoiceSheet({ invoice, company }) {
  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const subtotal = parseFloat(invoice.subtotal) || 0;
  const discount = parseFloat(invoice.totalDiscount) || 0;
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  const balance = Math.max(0, total - paid);

  const statusTint = invoice.paymentStatus === 'paid'
    ? { bg: '#ECFDF5', color: '#059669', border: '#10B981' }
    : invoice.paymentStatus === 'partial'
    ? { bg: '#FFFBEB', color: '#B45309', border: '#F59E0B' }
    : { bg: '#FEF2F2', color: '#B91C1C', border: '#EF4444' };

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
            <p className="ps-brand-sub">Invoice</p>
            {company?.email && <p className="inv-company-line">{company.email}</p>}
            {company?.phone && <p className="inv-company-line">{company.phone}</p>}
          </div>
        </div>
        <div className="ps-meta">
          <div>
            <p className="ps-meta-label">Invoice #</p>
            <p className="ps-meta-value">#{invoice.invoiceNumber}</p>
            <p
              className="inv-status-chip"
              style={{ background: statusTint.bg, color: statusTint.color, borderColor: statusTint.border }}
            >
              {invoice.paymentStatus}
            </p>
          </div>
          <div>
            <p className="ps-meta-label">Date</p>
            <p className="ps-meta-value-sm">{new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Parties */}
      <div className="ps-parties">
        <div className="ps-party">
          <p className="ps-party-label">Bill To</p>
          <p className="ps-party-name">{invoice.customerName}</p>
          <p className="ps-party-line">{invoice.customerPhone || ''}</p>
          {invoice.customerEmail && invoice.customerEmail !== 'noemail@gcgl.com' && (
            <p className="ps-party-line">{invoice.customerEmail}</p>
          )}
          <p className="ps-party-line">{invoice.customerAddress}</p>
        </div>
        <div className="ps-party">
          <p className="ps-party-label">Ship To</p>
          <p className="ps-party-name">{invoice.recipientName || invoice.customerName}</p>
          <p className="ps-party-line">{invoice.recipientPhone || invoice.customerPhone}</p>
          <p className="ps-party-line">{invoice.recipientAddress || invoice.customerAddress}</p>
        </div>
      </div>

      {invoice.Shipment?.name && (
        <div className="ps-shipment-banner">
          <span className="ps-shipment-label">Shipment</span>
          <span className="ps-shipment-name">{invoice.Shipment.name}</span>
        </div>
      )}

      {/* Line items WITH prices */}
      <table className="ps-table inv-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>#</th>
            <th>Description</th>
            <th style={{ width: '18%' }}>Dimensions (in)</th>
            <th style={{ width: '8%', textAlign: 'center' }}>Qty</th>
            <th style={{ width: '13%', textAlign: 'right' }}>Unit Price</th>
            <th style={{ width: '13%', textAlign: 'right' }}>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.lineItems || []).map((li, idx) => {
            const dims = (li.dimensionsL && li.dimensionsW && li.dimensionsH)
              ? `${li.dimensionsL} × ${li.dimensionsW} × ${li.dimensionsH}`
              : '';
            const unit = parseFloat(li.basePrice) || 0;
            const lineTotal = unit * (parseInt(li.quantity) || 1);
            return (
              <tr key={li.id || idx}>
                <td>{idx + 1}</td>
                <td>
                  {li.catalogName || li.description || 'Custom Item'}
                  {li.notes && (
                    <div style={{ fontSize: '0.85em', fontStyle: 'italic', color: '#6B7194', marginTop: 2 }}>
                      {li.notes}
                    </div>
                  )}
                </td>
                <td>{dims}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{li.quantity}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${fmt(unit)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${fmt(lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="inv-totals">
        <div className="inv-totals-inner">
          <div className="inv-totals-row">
            <span>Subtotal</span>
            <span className="tabular-nums">${fmt(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="inv-totals-row">
              <span>Discount</span>
              <span className="tabular-nums" style={{ color: '#EF4444' }}>−${fmt(discount)}</span>
            </div>
          )}
          <div className="inv-totals-row inv-totals-row-total">
            <span>Total</span>
            <span className="tabular-nums">${fmt(total)}</span>
          </div>
          {paid > 0 && (
            <div className="inv-totals-row">
              <span>Paid</span>
              <span className="tabular-nums" style={{ color: '#10B981' }}>${fmt(paid)}</span>
            </div>
          )}
          <div className="inv-totals-row inv-totals-row-balance">
            <span>Balance due</span>
            <span className="tabular-nums" style={{ color: balance > 0.01 ? '#EF4444' : '#10B981' }}>${fmt(balance)}</span>
          </div>
        </div>
      </div>

      {company?.footerText && (
        <p className="inv-footer-note">{company.footerText}</p>
      )}

      {company?.termsAndConditions && (
        <div className="inv-terms">
          <p className="inv-terms-title">Terms &amp; Conditions</p>
          <p className="inv-terms-body">{company.termsAndConditions}</p>
        </div>
      )}

      <div className="ps-footer">
        <span>{company?.name || 'Gold Coast Global Logistics'} · Thank you for your business</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Route                                                       */
/* ─────────────────────────────────────────────────────────── */

export default function InvoicePrint() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const sheet = document.querySelector('.packing-sheet');
      if (!sheet) return;
      await html2pdf()
        .from(sheet)
        .set({
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          margin: [10, 10, 10, 10],
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .save();
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    Promise.all([
      axios.get(`/api/v1/pickups/${id}`),
      axios.get('/api/v1/settings').catch(() => ({ data: { data: {} } })),
    ])
      .then(([invRes, setRes]) => {
        setInvoice(invRes.data.data);
        const s = setRes.data.data || {};
        setCompany({
          ...(s.companyInfo || {}),
          footerText: s.branding?.footerText,
        });
        // companyInfo now includes logo + termsAndConditions if set in Company Settings
      })
      .catch(console.error)
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
        <div className="packing-toolbar-meta">
          <span className="packing-toolbar-title">Invoice #{invoice.invoiceNumber}</span>
        </div>
        <button onClick={downloadPdf} disabled={downloadingPdf} className="packing-toolbar-print" style={{ marginRight: 8 }}>
          {downloadingPdf ? 'Generating…' : 'Download PDF'}
        </button>
        <button onClick={() => window.print()} className="packing-toolbar-print">Print</button>
      </div>
      <InvoiceSheet invoice={invoice} company={company} />
    </div>
  );
}
