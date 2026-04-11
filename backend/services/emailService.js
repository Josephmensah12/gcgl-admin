const nodemailer = require('nodemailer');

/**
 * Creates a transporter from environment variables.
 * Returns null if SMTP is not configured so callers can fail gracefully.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Optional:
 *   SMTP_FROM        — defaults to SMTP_USER
 *   SMTP_SECURE      — "true" / "false". Defaults to true for port 465, false otherwise.
 *   SMTP_FROM_NAME   — friendly display name in the From header (default: "Gold Coast Global Logistics")
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : null;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Apply `{placeholder}` substitutions to a message template.
 * Supported placeholders: customer_name, invoice_number, invoice_date,
 * total, paid, balance, company_name.
 */
function applyMessagePlaceholders(template, ctx) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(ctx, key)) return ctx[key];
    return match; // leave unknown placeholders alone
  });
}

/**
 * Escape HTML entities for safe inlining of user-authored strings.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render an invoice as an HTML email body (inline styles so most clients render it).
 */
function renderInvoiceEmail(invoice, company, extraMessage) {
  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const subtotal = parseFloat(invoice.subtotal) || 0;
  const discount = parseFloat(invoice.totalDiscount) || 0;
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  const balance = Math.max(0, total - paid);
  const companyName = company?.name || 'Gold Coast Global Logistics';
  const companyEmail = company?.email || '';
  const companyPhone = company?.phone || '';
  const companyLogo = company?.logo || null;
  const termsAndConditions = company?.termsAndConditions || '';

  // Build the greeting/message block:
  // 1. extraMessage (per-send override from the Email modal) wins
  // 2. else company.emailInvoiceMessage (template from settings) with placeholders
  // 3. else the hardcoded default greeting
  const placeholderCtx = {
    customer_name: invoice.customerName || 'there',
    invoice_number: invoice.invoiceNumber,
    invoice_date: new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    total: fmt(total),
    paid: fmt(paid),
    balance: fmt(balance),
    company_name: companyName,
  };

  let messageBlockHtml;
  if (extraMessage) {
    messageBlockHtml = `
      <p style="margin:0;font-size:13.5px;line-height:1.6;color:#4B5163;white-space:pre-wrap;">${escapeHtml(extraMessage)}</p>
    `;
  } else if (company?.emailInvoiceMessage) {
    const rendered = applyMessagePlaceholders(company.emailInvoiceMessage, placeholderCtx);
    messageBlockHtml = `
      <p style="margin:0;font-size:13.5px;line-height:1.6;color:#4B5163;white-space:pre-wrap;">${escapeHtml(rendered)}</p>
    `;
  } else {
    messageBlockHtml = `
      <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1A1D2B;">Hi ${escapeHtml(invoice.customerName || '')},</p>
      <p style="margin:0;font-size:13.5px;line-height:1.6;color:#4B5163;">
        Thank you for choosing ${escapeHtml(companyName)}. Please find your invoice details below.
        ${balance > 0.01 ? ` The outstanding balance is <strong>$${fmt(balance)}</strong>.` : ' This invoice has been paid in full — thank you!'}
      </p>
    `;
  }

  const brandBlock = companyLogo
    ? `<img src="${companyLogo}" alt="Logo" style="max-height:52px;max-width:180px;vertical-align:middle;" />`
    : `<div style="display:inline-block;width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#F59E0B,#D97706);color:#FFFFFF;font-size:16px;font-weight:800;line-height:48px;text-align:center;vertical-align:middle;">GC</div>`;

  const lineItemsHtml = (invoice.lineItems || []).map((li, idx) => {
    const dims = (li.dimensionsL && li.dimensionsW && li.dimensionsH)
      ? `${li.dimensionsL} × ${li.dimensionsW} × ${li.dimensionsH}`
      : '';
    const unit = parseFloat(li.basePrice) || 0;
    const qty = parseInt(li.quantity) || 1;
    const lineTotal = unit * qty;
    return `
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 12px;font-size:13px;color:#1A1D2B;">${idx + 1}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1A1D2B;">${(li.catalogName || li.description || 'Custom Item')}</td>
        <td style="padding:10px 12px;font-size:12px;color:#6B7194;">${dims}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1A1D2B;text-align:center;font-weight:700;">${qty}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1A1D2B;text-align:right;">$${fmt(unit)}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1A1D2B;text-align:right;font-weight:700;">$${fmt(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Invoice #${invoice.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:30px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px;border-bottom:2px solid #1A1D2B;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    ${brandBlock}
                    <span style="display:inline-block;margin-left:12px;vertical-align:middle;">
                      <span style="display:block;font-size:16px;font-weight:800;color:#1A1D2B;">${companyName}</span>
                      <span style="display:block;font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:1.5px;margin-top:2px;">Invoice</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="display:block;font-size:10px;font-weight:700;color:#9CA3C0;text-transform:uppercase;letter-spacing:0.8px;">Invoice #</span>
                    <span style="display:block;font-size:22px;font-weight:800;color:#1A1D2B;margin-top:2px;">#${invoice.invoiceNumber}</span>
                    <span style="display:block;font-size:12px;color:#6B7194;margin-top:2px;">${new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting / custom message -->
          <tr>
            <td style="padding:24px 32px 8px;">
              ${messageBlockHtml}
            </td>
          </tr>

          <!-- Parties -->
          <tr>
            <td style="padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding-right:8px;vertical-align:top;">
                    <div style="padding:12px 14px;border:1px solid #E5E7EB;border-radius:8px;">
                      <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:1.2px;">Bill To</p>
                      <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#1A1D2B;">${invoice.customerName}</p>
                      <p style="margin:0;font-size:11px;color:#6B7194;">${invoice.customerPhone || ''}</p>
                      ${invoice.customerEmail && invoice.customerEmail !== 'noemail@gcgl.com' ? `<p style="margin:0;font-size:11px;color:#6B7194;">${invoice.customerEmail}</p>` : ''}
                      <p style="margin:2px 0 0;font-size:11px;color:#6B7194;">${invoice.customerAddress || ''}</p>
                    </div>
                  </td>
                  <td width="50%" style="padding-left:8px;vertical-align:top;">
                    <div style="padding:12px 14px;border:1px solid #E5E7EB;border-radius:8px;">
                      <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:1.2px;">Ship To</p>
                      <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#1A1D2B;">${invoice.recipientName || invoice.customerName}</p>
                      <p style="margin:0;font-size:11px;color:#6B7194;">${invoice.recipientPhone || invoice.customerPhone || ''}</p>
                      <p style="margin:2px 0 0;font-size:11px;color:#6B7194;">${invoice.recipientAddress || invoice.customerAddress || ''}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding:8px 32px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#1A1D2B;color:#FFFFFF;">
                    <th align="left" style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">#</th>
                    <th align="left" style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Description</th>
                    <th align="left" style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Dims (in)</th>
                    <th align="center" style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Qty</th>
                    <th align="right" style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Unit</th>
                    <th align="right" style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding:4px 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td></td>
                  <td width="55%">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
                      <tr><td style="padding:9px 16px;font-size:12px;color:#1A1D2B;">Subtotal</td><td align="right" style="padding:9px 16px;font-size:12px;color:#1A1D2B;">$${fmt(subtotal)}</td></tr>
                      ${discount > 0 ? `<tr><td style="padding:9px 16px;font-size:12px;color:#1A1D2B;">Discount</td><td align="right" style="padding:9px 16px;font-size:12px;color:#EF4444;">−$${fmt(discount)}</td></tr>` : ''}
                      <tr style="background:#F4F6FA;"><td style="padding:10px 16px;font-size:14px;font-weight:800;color:#1A1D2B;">Total</td><td align="right" style="padding:10px 16px;font-size:14px;font-weight:800;color:#1A1D2B;">$${fmt(total)}</td></tr>
                      ${paid > 0 ? `<tr><td style="padding:9px 16px;font-size:12px;color:#1A1D2B;">Paid</td><td align="right" style="padding:9px 16px;font-size:12px;color:#10B981;">$${fmt(paid)}</td></tr>` : ''}
                      <tr style="background:#1A1D2B;"><td style="padding:12px 16px;font-size:14px;font-weight:800;color:#9CA3C0;">Balance due</td><td align="right" style="padding:12px 16px;font-size:14px;font-weight:800;color:${balance > 0.01 ? '#FCA5A5' : '#10B981'};">$${fmt(balance)}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${termsAndConditions ? `
          <!-- Terms & Conditions -->
          <tr>
            <td style="padding:8px 32px 20px;">
              <div style="padding:14px 16px;border-left:3px solid #F59E0B;background:#FFFBEB;border-radius:4px;">
                <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#B45309;text-transform:uppercase;letter-spacing:1px;">Terms &amp; Conditions</p>
                <p style="margin:0;font-size:10.5px;line-height:1.55;color:#4B5163;white-space:pre-wrap;">${termsAndConditions.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#F4F6FA;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6B7194;">${companyName}${companyPhone ? ' · ' + companyPhone : ''}${companyEmail ? ' · ' + companyEmail : ''}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#9CA3C0;">This invoice was sent automatically. Reply to this email with any questions.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

async function sendInvoiceEmail({ to, invoice, company, cc, bcc, extraMessage }) {
  const transporter = getTransporter();
  if (!transporter) {
    const err = new Error('SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in Railway environment variables.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Gold Coast Global Logistics';
  const html = renderInvoiceEmail(invoice, company, extraMessage);
  const subject = `Invoice #${invoice.invoiceNumber} from ${company?.name || 'Gold Coast Global Logistics'}`;

  // Plain-text fallback: mirror the same message priority used in the HTML
  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  const balance = Math.max(0, total - paid);
  const placeholderCtx = {
    customer_name: invoice.customerName || 'there',
    invoice_number: invoice.invoiceNumber,
    invoice_date: new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    total: fmt(total),
    paid: fmt(paid),
    balance: fmt(balance),
    company_name: company?.name || 'Gold Coast Global Logistics',
  };
  const textBody = extraMessage
    ? extraMessage
    : company?.emailInvoiceMessage
    ? applyMessagePlaceholders(company.emailInvoiceMessage, placeholderCtx)
    : `Please see invoice #${invoice.invoiceNumber}.`;

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    cc,
    bcc,
    subject,
    html,
    text: textBody,
  });

  return { messageId: info.messageId };
}

module.exports = {
  getTransporter,
  isConfigured,
  renderInvoiceEmail,
  sendInvoiceEmail,
};
