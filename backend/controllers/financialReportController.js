const { QueryTypes } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

/*
 * Financial reports for GCGL. Mirrors BizHub's patterns with a simpler data
 * model (single currency, no COGS, no prepaid amortization).
 *
 * Accrual vs cash basis:
 *   - Revenue on the P&L uses invoices.created_at (accrual)
 *   - Collected revenue + cash-flow inflows use invoice_payments.payment_date
 *     (cash)
 *   - Expenses use expenses.expense_date (both P&L and cash flow — GCGL
 *     doesn't distinguish recognition_period like BizHub does)
 *
 * All voided payments (voided_at IS NOT NULL) are excluded.
 * Invoices must have status = 'completed' to count as revenue.
 */

function parseDateRange(req) {
  const { dateFrom, dateTo, period } = req.query;
  let start;
  let end;

  if (dateFrom && dateTo) {
    start = new Date(dateFrom);
    end = new Date(dateTo);
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (period) {
      case 'month':
        start = new Date(Date.UTC(y, m, 1));
        end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
        break;
      case 'quarter': {
        const qStart = Math.floor(m / 3) * 3;
        start = new Date(Date.UTC(y, qStart, 1));
        end = new Date(Date.UTC(y, qStart + 3, 0, 23, 59, 59));
        break;
      }
      case 'year':
        start = new Date(Date.UTC(y, 0, 1));
        end = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
        break;
      default:
        // Default: this month
        start = new Date(Date.UTC(y, m, 1));
        end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
    }
  }
  return {
    start,
    end,
    startStr: start.toISOString(),
    endStr: end.toISOString(),
    // YYYY-MM-DD for expense_date (DATEONLY)
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

// Prior-period range of the same length, ending just before the current start.
function priorRange(start, end) {
  const durationMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - durationMs);
  return {
    start: priorStart,
    end: priorEnd,
    startStr: priorStart.toISOString(),
    endStr: priorEnd.toISOString(),
    startDate: priorStart.toISOString().split('T')[0],
    endDate: priorEnd.toISOString().split('T')[0],
  };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pctChange = (current, prior) => {
  if (prior === 0) return current === 0 ? 0 : 100;
  return round2(((current - prior) / Math.abs(prior)) * 100);
};

/**
 * Raw aggregates for a given range. Used by both the summary cards (with
 * prior-period comparison) and the P&L / cash-flow reports.
 */
async function aggregatesForRange(range) {
  const [inv] = await db.sequelize.query(
    `SELECT COALESCE(SUM(final_total), 0)::float AS revenue,
            COALESCE(SUM(amount_paid), 0)::float AS amount_paid,
            COUNT(*)::int AS invoice_count
       FROM invoices
      WHERE status = 'completed'
        AND created_at BETWEEN :startStr AND :endStr`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const [cash] = await db.sequelize.query(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT' THEN amount ELSE 0 END), 0)::float AS payments,
       COALESCE(SUM(CASE WHEN transaction_type = 'REFUND'  THEN amount ELSE 0 END), 0)::float AS refunds,
       COUNT(*)::int AS txn_count
     FROM invoice_payments
    WHERE voided_at IS NULL
      AND payment_date BETWEEN :startStr AND :endStr`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const [exp] = await db.sequelize.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS expenses,
            COUNT(*)::int AS expense_count
       FROM expenses
      WHERE expense_date BETWEEN :startDate AND :endDate`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const revenue = round2(inv.revenue);
  const collected = round2(cash.payments - cash.refunds);
  const expenses = round2(exp.expenses);
  const netProfit = round2(revenue - expenses);
  const netMargin = revenue > 0 ? round2((netProfit / revenue) * 100) : 0;
  const outstanding = round2(revenue - collected);

  return {
    revenue,
    collected,
    outstanding,
    expenses,
    netProfit,
    netMargin,
    invoiceCount: Number(inv.invoice_count) || 0,
    paymentCount: Number(cash.txn_count) || 0,
    expenseCount: Number(exp.expense_count) || 0,
  };
}

/* ─────────────────────────────────────────────────────────── */
/*  Summary cards                                              */
/* ─────────────────────────────────────────────────────────── */

exports.getSummary = asyncHandler(async (req, res) => {
  const current = parseDateRange(req);
  const prior = priorRange(current.start, current.end);

  const [currentAgg, priorAgg] = await Promise.all([
    aggregatesForRange(current),
    aggregatesForRange(prior),
  ]);

  res.json({
    success: true,
    data: {
      period: {
        from: current.startDate,
        to: current.endDate,
      },
      current: currentAgg,
      prior: priorAgg,
      change: {
        revenue: pctChange(currentAgg.revenue, priorAgg.revenue),
        collected: pctChange(currentAgg.collected, priorAgg.collected),
        expenses: pctChange(currentAgg.expenses, priorAgg.expenses),
        netProfit: pctChange(currentAgg.netProfit, priorAgg.netProfit),
      },
    },
  });
});

/* ─────────────────────────────────────────────────────────── */
/*  Profit & Loss                                              */
/* ─────────────────────────────────────────────────────────── */

exports.getProfitAndLoss = asyncHandler(async (req, res) => {
  const range = parseDateRange(req);

  const [inv] = await db.sequelize.query(
    `SELECT COALESCE(SUM(final_total), 0)::float AS revenue,
            COUNT(*)::int AS invoice_count
       FROM invoices
      WHERE status = 'completed'
        AND created_at BETWEEN :startStr AND :endStr`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const expensesByCategory = await db.sequelize.query(
    `SELECT COALESCE(ec.name, 'Uncategorized') AS category,
            COALESCE(SUM(e.amount), 0)::float AS amount,
            COUNT(e.id)::int AS count
       FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.expense_date BETWEEN :startDate AND :endDate
      GROUP BY COALESCE(ec.name, 'Uncategorized')
      ORDER BY amount DESC`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const revenue = round2(inv.revenue);
  const totalExpenses = round2(expensesByCategory.reduce((s, r) => s + Number(r.amount), 0));
  const netProfit = round2(revenue - totalExpenses);
  const netMargin = revenue > 0 ? round2((netProfit / revenue) * 100) : 0;

  // Monthly breakdown across the range for a timeline chart
  const monthly = await db.sequelize.query(
    `WITH months AS (
       SELECT date_trunc('month', d)::date AS month
         FROM generate_series(
                date_trunc('month', :startStr::timestamp),
                date_trunc('month', :endStr::timestamp),
                interval '1 month'
              ) d
     ),
     rev AS (
       SELECT date_trunc('month', created_at)::date AS month,
              COALESCE(SUM(final_total), 0)::float AS revenue
         FROM invoices
        WHERE status = 'completed'
          AND created_at BETWEEN :startStr AND :endStr
        GROUP BY 1
     ),
     exp AS (
       SELECT date_trunc('month', expense_date)::date AS month,
              COALESCE(SUM(amount), 0)::float AS expenses
         FROM expenses
        WHERE expense_date BETWEEN :startDate AND :endDate
        GROUP BY 1
     )
     SELECT to_char(m.month, 'YYYY-MM')       AS month,
            to_char(m.month, 'Mon YYYY')      AS label,
            COALESCE(r.revenue, 0)::float     AS revenue,
            COALESCE(e.expenses, 0)::float    AS expenses,
            (COALESCE(r.revenue, 0) - COALESCE(e.expenses, 0))::float AS net_profit
       FROM months m
  LEFT JOIN rev r ON r.month = m.month
  LEFT JOIN exp e ON e.month = m.month
      ORDER BY m.month`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  res.json({
    success: true,
    data: {
      period: { from: range.startDate, to: range.endDate },
      revenue,
      invoiceCount: Number(inv.invoice_count) || 0,
      expenses: expensesByCategory.map((r) => ({
        category: r.category,
        amount: round2(r.amount),
        count: Number(r.count) || 0,
      })),
      totalExpenses,
      netProfit,
      netMargin,
      monthly: monthly.map((m) => ({
        month: m.month,
        label: m.label,
        revenue: round2(m.revenue),
        expenses: round2(m.expenses),
        netProfit: round2(m.net_profit),
      })),
    },
  });
});

/* ─────────────────────────────────────────────────────────── */
/*  Cash Flow                                                  */
/* ─────────────────────────────────────────────────────────── */

exports.getCashFlow = asyncHandler(async (req, res) => {
  const range = parseDateRange(req);

  const [inflow] = await db.sequelize.query(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT' THEN amount ELSE 0 END), 0)::float AS payments,
       COALESCE(SUM(CASE WHEN transaction_type = 'REFUND'  THEN amount ELSE 0 END), 0)::float AS refunds
     FROM invoice_payments
    WHERE voided_at IS NULL
      AND payment_date BETWEEN :startStr AND :endStr`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const [outflow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM expenses
      WHERE expense_date BETWEEN :startDate AND :endDate`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const inflowsByMethod = await db.sequelize.query(
    `SELECT COALESCE(payment_method, 'Unknown') AS method,
            COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT' THEN amount ELSE 0 END), 0)::float -
            COALESCE(SUM(CASE WHEN transaction_type = 'REFUND'  THEN amount ELSE 0 END), 0)::float AS amount,
            COUNT(*)::int AS count
       FROM invoice_payments
      WHERE voided_at IS NULL
        AND payment_date BETWEEN :startStr AND :endStr
      GROUP BY COALESCE(payment_method, 'Unknown')
      ORDER BY amount DESC`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const outflowsByCategory = await db.sequelize.query(
    `SELECT COALESCE(ec.name, 'Uncategorized') AS category,
            COALESCE(SUM(e.amount), 0)::float AS amount,
            COUNT(e.id)::int AS count
       FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.expense_date BETWEEN :startDate AND :endDate
      GROUP BY COALESCE(ec.name, 'Uncategorized')
      ORDER BY amount DESC`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const monthly = await db.sequelize.query(
    `WITH months AS (
       SELECT date_trunc('month', d)::date AS month
         FROM generate_series(
                date_trunc('month', :startStr::timestamp),
                date_trunc('month', :endStr::timestamp),
                interval '1 month'
              ) d
     ),
     inflows AS (
       SELECT date_trunc('month', payment_date)::date AS month,
              COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT' THEN amount ELSE 0 END), 0)::float -
              COALESCE(SUM(CASE WHEN transaction_type = 'REFUND'  THEN amount ELSE 0 END), 0)::float AS amount
         FROM invoice_payments
        WHERE voided_at IS NULL
          AND payment_date BETWEEN :startStr AND :endStr
        GROUP BY 1
     ),
     outflows AS (
       SELECT date_trunc('month', expense_date)::date AS month,
              COALESCE(SUM(amount), 0)::float AS amount
         FROM expenses
        WHERE expense_date BETWEEN :startDate AND :endDate
        GROUP BY 1
     )
     SELECT to_char(m.month, 'YYYY-MM')             AS month,
            to_char(m.month, 'Mon YYYY')            AS label,
            COALESCE(i.amount, 0)::float            AS inflows,
            COALESCE(o.amount, 0)::float            AS outflows,
            (COALESCE(i.amount, 0) - COALESCE(o.amount, 0))::float AS net
       FROM months m
  LEFT JOIN inflows i  ON i.month = m.month
  LEFT JOIN outflows o ON o.month = m.month
      ORDER BY m.month`,
    { replacements: range, type: QueryTypes.SELECT }
  );

  const totalInflows = round2(inflow.payments - inflow.refunds);
  const totalOutflows = round2(outflow.total);
  const netCashFlow = round2(totalInflows - totalOutflows);

  res.json({
    success: true,
    data: {
      period: { from: range.startDate, to: range.endDate },
      totalInflows,
      totalOutflows,
      netCashFlow,
      inflowsByMethod: inflowsByMethod.map((r) => ({
        method: r.method,
        amount: round2(r.amount),
        count: Number(r.count) || 0,
      })),
      outflowsByCategory: outflowsByCategory.map((r) => ({
        category: r.category,
        amount: round2(r.amount),
        count: Number(r.count) || 0,
      })),
      monthly: monthly.map((m) => ({
        month: m.month,
        label: m.label,
        inflows: round2(m.inflows),
        outflows: round2(m.outflows),
        net: round2(m.net),
      })),
    },
  });
});
