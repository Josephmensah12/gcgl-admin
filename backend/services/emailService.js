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
function renderInvoiceEmail(invoice, company, extraMessage, paymentUrl) {
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

  // Use CID reference for email (data: URLs are blocked by Gmail/Outlook)
  const brandBlock = companyLogo
    ? `<img src="cid:company-logo" alt="Logo" style="max-height:52px;max-width:180px;vertical-align:middle;" />`
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

          ${paymentUrl && balance > 0.01 ? `
          <!-- Pay Now button -->
          <tr>
            <td style="padding:8px 32px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${paymentUrl}" target="_blank" style="display:inline-block;padding:14px 40px;background:#1A1D2B;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;letter-spacing:0.3px;">
                      Pay Now — $${fmt(balance)}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:10px;">
                    <p style="margin:0;font-size:11px;color:#9CA3C0;">Secure payment via Square. Apple Pay, Google Pay, and cards accepted.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

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

async function sendInvoiceEmail({ to, invoice, company, cc, bcc, extraMessage, paymentUrl }) {
  const transporter = getTransporter();
  if (!transporter) {
    const err = new Error('SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in Railway environment variables.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Gold Coast Global Logistics';
  const html = renderInvoiceEmail(invoice, company, extraMessage, paymentUrl);
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

  // Build CID attachment for the logo if it's a base64 data URL
  const attachments = [];
  const companyLogo = company?.logo;
  if (companyLogo && companyLogo.startsWith('data:')) {
    const match = companyLogo.match(/^data:image\/(\w+);base64,(.+)$/);
    if (match) {
      const ext = match[1] === 'svg+xml' ? 'svg' : match[1];
      attachments.push({
        filename: `logo.${ext}`,
        content: Buffer.from(match[2], 'base64'),
        cid: 'company-logo',
        contentDisposition: 'inline',
      });
    }
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    cc,
    bcc,
    subject,
    html,
    text: textBody,
    attachments,
  });

  return { messageId: info.messageId };
}

/* ── Shipment update email ── */

const STATUS_MESSAGES = {
  collecting: 'Your items have been received at our warehouse in Houston and are being prepared for shipment.',
  ready: 'Your shipment is packed and ready to be loaded onto the vessel.',
  shipped: 'Your shipment has left the USA and is on its way to Ghana!',
  transit: 'Your shipment is currently on the ocean heading to Ghana.',
  customs: 'Your shipment has arrived in Ghana and is being cleared through customs.',
  delivery: 'Your shipment has cleared the port and delivery is in progress.',
  delivered: 'Your shipment has been delivered. Thank you for choosing Gold Coast Global Logistics!',
};

function renderShipmentUpdateEmail({ customerName, invoiceNumber, shipmentStatus, eta, balance, paymentUrl, customMessage, company }) {
  const companyName = company?.name || 'Gold Coast Global Logistics';
  const companyPhone = company?.phone || '(832) 295-9347';
  const companyEmail = company?.email || 'info@goldcoastlogistics.com';
  const companyLogo = company?.logo || null;
  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const statusLabel = (shipmentStatus || 'collecting').charAt(0).toUpperCase() + (shipmentStatus || 'collecting').slice(1);
  const rawMessage = customMessage || STATUS_MESSAGES[shipmentStatus] || STATUS_MESSAGES.collecting;
  const statusMessage = applyMessagePlaceholders(rawMessage, {
    customer_name: customerName || 'there',
    invoice_number: String(invoiceNumber),
    company_name: companyName,
  });

  let etaHtml = '';
  if (eta) {
    const etaDate = new Date(eta + 'T12:00:00');
    const days = Math.ceil((etaDate - new Date()) / 86400000);
    const etaFormatted = etaDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const countdown = days > 0 ? ` (${days} day${days === 1 ? '' : 's'} away)` : days === 0 ? ' (today)' : '';
    etaHtml = `
      <tr>
        <td style="padding:16px 32px;">
          <div style="padding:14px 16px;background:#EEF2FF;border-radius:8px;">
            <p style="margin:0;font-size:12px;font-weight:700;color:#4F46E5;text-transform:uppercase;letter-spacing:1px;">Estimated Arrival</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#1A1D2B;">${etaFormatted}${countdown}</p>
          </div>
        </td>
      </tr>
    `;
  }

  let balanceHtml = '';
  if (balance > 0.01) {
    balanceHtml = `
      <tr>
        <td style="padding:8px 32px 16px;">
          <div style="padding:14px 16px;background:#FEF3C7;border-left:3px solid #F59E0B;border-radius:4px;">
            <p style="margin:0;font-size:13px;font-weight:700;color:#92400E;">Outstanding Balance: $${fmt(balance)}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#92400E;line-height:1.5;">
              Please make payment as soon as possible to avoid any delays in delivery.
              Contact us at ${companyPhone} or reply to this email to arrange payment.
            </p>
          </div>
        </td>
      </tr>
      ${paymentUrl ? `
      <tr>
        <td style="padding:4px 32px 16px;" align="center">
          <a href="${paymentUrl}" target="_blank" style="display:inline-block;padding:12px 36px;background:#1A1D2B;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;">
            Pay Now — $${fmt(balance)}
          </a>
          <p style="margin:8px 0 0;font-size:10px;color:#9CA3C0;">Secure payment via Square. Apple Pay, Google Pay, and cards accepted.</p>
        </td>
      </tr>
      ` : ''}
    `;
  }

  const trackingUrl = `https://www.goldcoastgloballogistics.com/track`;
  const brandBlock = companyLogo
    ? `<img src="cid:company-logo" alt="Logo" style="max-height:52px;max-width:180px;vertical-align:middle;" />`
    : `<div style="display:inline-block;width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#F59E0B,#D97706);color:#FFFFFF;font-size:16px;font-weight:800;line-height:48px;text-align:center;vertical-align:middle;">GC</div>`;

  return `
<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
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
                      <span style="display:block;font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:1.5px;margin-top:2px;">Shipment Update</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="display:block;font-size:10px;font-weight:700;color:#9CA3C0;text-transform:uppercase;">Invoice #</span>
                    <span style="display:block;font-size:22px;font-weight:800;color:#1A1D2B;margin-top:2px;">#${invoiceNumber}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting + status -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1A1D2B;">Hi ${escapeHtml(customerName || '')},</p>
              <p style="margin:0;font-size:13.5px;line-height:1.6;color:#4B5163;">${escapeHtml(statusMessage)}</p>
            </td>
          </tr>

          <!-- Status badge -->
          <tr>
            <td style="padding:16px 32px;">
              <div style="display:inline-block;padding:8px 18px;background:#EEF2FF;border-radius:20px;">
                <span style="font-size:12px;font-weight:700;color:#4F46E5;text-transform:uppercase;letter-spacing:1px;">Status: ${statusLabel}</span>
              </div>
            </td>
          </tr>

          ${etaHtml}
          ${balanceHtml}

          <!-- Track link -->
          <tr>
            <td style="padding:8px 32px 24px;" align="center">
              <a href="${trackingUrl}" target="_blank" style="display:inline-block;padding:12px 36px;background:#6366F1;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;">
                Track Your Shipment
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#F4F6FA;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6B7194;">${companyName}${companyPhone ? ' · ' + companyPhone : ''}${companyEmail ? ' · ' + companyEmail : ''}</p>
              <p style="margin:4px 0 0;font-size:10px;color:#9CA3C0;">This is an automated shipment update. Reply to this email with any questions.</p>
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

async function sendShipmentUpdateEmail({ to, customerName, invoiceNumber, shipmentStatus, eta, balance, paymentUrl, customMessage, company }) {
  const transporter = getTransporter();
  if (!transporter) {
    const err = new Error('SMTP not configured.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Gold Coast Global Logistics';
  const html = renderShipmentUpdateEmail({ customerName, invoiceNumber, shipmentStatus, eta, balance, paymentUrl, customMessage, company });
  const subject = `Shipment Update — Invoice #${invoiceNumber} | ${(company?.name || 'Gold Coast Global Logistics')}`;

  const attachments = [];
  if (company?.logo && company.logo.startsWith('data:')) {
    const match = company.logo.match(/^data:image\/(\w+);base64,(.+)$/);
    if (match) {
      attachments.push({
        filename: `logo.${match[1] === 'svg+xml' ? 'svg' : match[1]}`,
        content: Buffer.from(match[2], 'base64'),
        cid: 'company-logo',
        contentDisposition: 'inline',
      });
    }
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject,
    html,
    text: `Hi ${customerName}, ${customMessage || STATUS_MESSAGES[shipmentStatus] || ''} Invoice #${invoiceNumber}. Track at https://www.goldcoastgloballogistics.com/track`,
    attachments,
  });

  return { messageId: info.messageId };
}

module.exports = {
  getTransporter,
  isConfigured,
  renderInvoiceEmail,
  sendInvoiceEmail,
  renderShipmentUpdateEmail,
  sendShipmentUpdateEmail,
  STATUS_MESSAGES,
};
