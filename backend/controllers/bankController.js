const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const plaid = require('../services/plaidService');
const { categorizeTransaction } = require('../services/categorizationService');
const { parseCSV, normalizeTransactions } = require('../services/csvParserService');
const { v4: uuidv4 } = require('uuid');

// ── PLAID CONNECTION ──────────────────────────────────────

exports.createLinkToken = asyncHandler(async (req, res) => {
  const linkToken = await plaid.createLinkToken(req.user?.id || 1);
  res.json({ success: true, data: { link_token: linkToken } });
});

exports.exchangeToken = asyncHandler(async (req, res) => {
  const { public_token, institution, accounts } = req.body;
  if (!public_token) throw new AppError('Public token required', 400);

  const accessToken = await plaid.exchangeToken(public_token);
  const encryptedToken = plaid.encrypt(accessToken);

  // Get full account details
  const plaidAccounts = await plaid.getAccounts(accessToken);

  const created = [];
  for (const acc of plaidAccounts) {
    // Only save selected accounts
    if (accounts && !accounts.includes(acc.account_id)) continue;

    const existing = await db.BankConnection.findOne({ where: { plaid_account_id: acc.account_id } });
    if (existing) continue;

    const conn = await db.BankConnection.create({
      account_type: acc.type === 'credit' ? 'credit' : 'checking',
      bank_name: institution?.name || acc.official_name || 'Unknown Bank',
      plaid_account_id: acc.account_id,
      plaid_access_token: encryptedToken,
      account_nickname: `${institution?.name || 'Bank'} ${acc.subtype || ''} (...${acc.mask || ''})`,
      account_mask: acc.mask,
    });
    created.push(conn);
  }

  res.json({ success: true, data: { connected: created.length, accounts: created } });
});

exports.listConnections = asyncHandler(async (req, res) => {
  const connections = await db.BankConnection.findAll({
    attributes: { exclude: ['plaid_access_token'] },
    order: [['createdAt', 'DESC']],
  });
  res.json({ success: true, data: connections });
});

exports.removeConnection = asyncHandler(async (req, res) => {
  const conn = await db.BankConnection.findByPk(req.params.id);
  if (!conn) throw new AppError('Connection not found', 404);
  await conn.update({ is_active: false });
  res.json({ success: true, message: 'Connection deactivated' });
});

// ── TRANSACTION SYNC ──────────────────────────────────────

exports.syncTransactions = asyncHandler(async (req, res) => {
  const connections = await db.BankConnection.findAll({ where: { is_active: true } });
  let totalImported = 0;
  const errors = [];

  for (const conn of connections) {
    try {
      const accessToken = plaid.decrypt(conn.plaid_access_token);
      const startDate = conn.last_sync
        ? new Date(conn.last_sync).toISOString().split('T')[0]
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];

      const transactions = await plaid.getTransactions(accessToken, startDate, endDate, [conn.plaid_account_id]);

      for (const tx of transactions) {
        if (tx.pending) continue; // Skip pending

        const exists = await db.ImportedTransaction.findOne({ where: { plaid_transaction_id: tx.transaction_id } });
        if (exists) continue;

        const suggestion = categorizeTransaction(tx.name || tx.merchant_name, tx.amount);

        const imported = await db.ImportedTransaction.create({
          plaid_transaction_id: tx.transaction_id,
          bank_connection_id: conn.id,
          amount: Math.abs(tx.amount),
          transaction_date: tx.date,
          merchant_name: tx.merchant_name || tx.name,
          description: tx.name,
          plaid_category: tx.personal_finance_category?.primary || tx.category?.[0] || null,
          status: 'pending_review',
        });

        await db.AITrainingData.create({
          transaction_id: imported.id,
          suggested_category: suggestion.category,
          suggestion_confidence: suggestion.confidence,
          suggestion_reasoning: suggestion.reasoning,
        });

        totalImported++;
      }

      await conn.update({ last_sync: new Date() });
    } catch (err) {
      errors.push({ bank: conn.bank_name, error: err.message });
    }
  }

  res.json({ success: true, data: { imported: totalImported, errors } });
});

// ── TRANSACTION REVIEW ────────────────────────────────────

exports.listPending = asyncHandler(async (req, res) => {
  const { status = 'pending_review', page = 1, limit = 50 } = req.query;

  const where = {};
  if (status) where.status = status;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.ImportedTransaction.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['transaction_date', 'ASC']],
    include: [
      { model: db.BankConnection, as: 'bankConnection', attributes: ['account_nickname', 'bank_name', 'account_type'] },
      { model: db.AITrainingData, as: 'trainingData', attributes: ['suggested_category', 'suggestion_confidence', 'suggestion_reasoning'] },
      { model: db.Shipment, as: 'shipment', attributes: ['id', 'name', 'status'] },
      { model: db.User, as: 'reviewer', attributes: ['id', 'full_name'] },
    ],
  });

  res.json({
    success: true,
    data: {
      transactions: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) },
    },
  });
});

exports.reviewTransaction = asyncHandler(async (req, res) => {
  const tx = await db.ImportedTransaction.findByPk(req.params.id);
  if (!tx) throw new AppError('Transaction not found', 404);

  const { action, category, shipmentId, notes, isBusinessExpense } = req.body;
  const reviewStartTime = req.body._reviewStartTime; // Passed from frontend

  if (action === 'approve') {
    if (!category) throw new AppError('Category required for approval', 400);

    await tx.update({
      status: 'approved',
      gcgl_category: category,
      shipment_id: shipmentId || null,
      is_business_expense: isBusinessExpense !== false,
      notes: notes || null,
      reviewed_by: req.user?.id || null,
      reviewed_at: new Date(),
    });

    // Also create a regular Expense record for reporting integration
    if (isBusinessExpense !== false) {
      const expCat = await db.ExpenseCategory.findOne({ where: { name: category } });
      if (expCat) {
        await db.Expense.create({
          expense_date: tx.transaction_date,
          category_id: expCat.id,
          description: `${tx.merchant_name || tx.description}`,
          vendor_or_payee: tx.merchant_name,
          amount: tx.amount,
          shipment_id: shipmentId || null,
          notes: `Imported from bank: ${tx.plaid_transaction_id}`,
          created_by: req.user?.id || null,
        });
      }
    }
  } else if (action === 'reject') {
    await tx.update({
      status: 'rejected',
      is_business_expense: false,
      notes: notes || 'Marked as personal',
      reviewed_by: req.user?.id || null,
      reviewed_at: new Date(),
    });
  } else if (action === 'defer') {
    await tx.update({ status: 'deferred' });
  }

  // Update AI training data
  const training = await db.AITrainingData.findOne({ where: { transaction_id: tx.id } });
  if (training) {
    const reviewTime = reviewStartTime ? Math.round((Date.now() - reviewStartTime) / 1000) : null;
    const accepted = category === training.suggested_category;
    let correctionType = null;
    if (!accepted && category) correctionType = 'category_changed';

    await training.update({
      human_category: category || null,
      human_shipment_id: shipmentId || null,
      review_time_seconds: reviewTime,
      suggestion_accepted: action === 'approve' ? accepted : false,
      correction_type: correctionType,
    });
  }

  res.json({ success: true, data: tx });
});

exports.bulkReview = asyncHandler(async (req, res) => {
  const { transactionIds, action, category, shipmentId } = req.body;
  if (!transactionIds?.length) throw new AppError('Transaction IDs required', 400);

  let processed = 0;
  for (const id of transactionIds) {
    const tx = await db.ImportedTransaction.findByPk(id);
    if (!tx || tx.status !== 'pending_review') continue;

    if (action === 'approve' && category) {
      await tx.update({
        status: 'approved',
        gcgl_category: category,
        shipment_id: shipmentId || null,
        is_business_expense: true,
        reviewed_by: req.user?.id || null,
        reviewed_at: new Date(),
      });

      const expCat = await db.ExpenseCategory.findOne({ where: { name: category } });
      if (expCat) {
        await db.Expense.create({
          expense_date: tx.transaction_date,
          category_id: expCat.id,
          description: tx.merchant_name || tx.description,
          vendor_or_payee: tx.merchant_name,
          amount: tx.amount,
          shipment_id: shipmentId || null,
          notes: `Imported from bank: ${tx.plaid_transaction_id}`,
          created_by: req.user?.id || null,
        });
      }
    } else if (action === 'reject') {
      await tx.update({ status: 'rejected', is_business_expense: false, reviewed_by: req.user?.id, reviewed_at: new Date() });
    }

    // Update training data
    const training = await db.AITrainingData.findOne({ where: { transaction_id: id } });
    if (training) {
      await training.update({
        human_category: category || null,
        human_shipment_id: shipmentId || null,
        suggestion_accepted: category === training.suggested_category,
        correction_type: category !== training.suggested_category ? 'category_changed' : null,
      });
    }
    processed++;
  }

  res.json({ success: true, data: { processed } });
});

// ── STATS ─────────────────────────────────────────────────

exports.getStats = asyncHandler(async (req, res) => {
  const pendingCount = await db.ImportedTransaction.count({ where: { status: 'pending_review' } });
  const pendingAmount = await db.ImportedTransaction.sum('amount', { where: { status: 'pending_review' } });

  // Oldest pending
  const oldest = await db.ImportedTransaction.findOne({
    where: { status: 'pending_review' },
    order: [['transaction_date', 'ASC']],
    attributes: ['transaction_date'],
  });
  const oldestDays = oldest ? Math.floor((Date.now() - new Date(oldest.transaction_date)) / (1000 * 60 * 60 * 24)) : 0;

  // Weekly stats
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyImports = await db.ImportedTransaction.count({ where: { imported_at: { [Op.gte]: weekAgo } } });
  const weeklyReviewed = await db.ImportedTransaction.count({ where: { reviewed_at: { [Op.gte]: weekAgo } } });

  // Suggestion accuracy
  const trainingStats = await db.AITrainingData.findAll({
    where: { suggestion_accepted: { [Op.ne]: null } },
    attributes: [
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'total'],
      [db.sequelize.fn('SUM', db.sequelize.literal('CASE WHEN suggestion_accepted = true THEN 1 ELSE 0 END')), 'accepted'],
    ],
    raw: true,
  });
  const accuracy = trainingStats[0]?.total > 0
    ? Math.round((parseInt(trainingStats[0].accepted) / parseInt(trainingStats[0].total)) * 100)
    : 0;

  // Total stats
  const totalApproved = await db.ImportedTransaction.count({ where: { status: 'approved' } });
  const totalRejected = await db.ImportedTransaction.count({ where: { status: 'rejected' } });
  const totalAmount = await db.ImportedTransaction.sum('amount', { where: { status: 'approved', is_business_expense: true } });

  res.json({
    success: true,
    data: {
      pendingCount,
      pendingAmount: parseFloat(pendingAmount) || 0,
      oldestPendingDays: oldestDays,
      weeklyImports,
      weeklyReviewed,
      weeklyPending: pendingCount,
      suggestionAccuracy: accuracy,
      totalApproved,
      totalRejected,
      totalBusinessExpenses: parseFloat(totalAmount) || 0,
    },
  });
});

// ── CSV IMPORT ────────────────────────────────────────────

exports.importCSV = asyncHandler(async (req, res) => {
  const { csvData, accountLabel } = req.body;
  if (!csvData) throw new AppError('CSV data required', 400);

  const rows = parseCSV(csvData);
  if (rows.length === 0) throw new AppError('No data found in CSV', 400);

  const transactions = normalizeTransactions(rows, accountLabel);
  if (transactions.length === 0) throw new AppError('Could not parse any transactions from CSV', 400);

  let imported = 0;
  let skipped = 0;

  for (const tx of transactions) {
    // Create a unique ID from date + description + amount to prevent duplicates
    const dedupKey = `csv-${tx.date}-${tx.description.substring(0, 50)}-${tx.amount}`;

    const exists = await db.ImportedTransaction.findOne({ where: { plaid_transaction_id: dedupKey } });
    if (exists) { skipped++; continue; }

    const suggestion = tx.isCredit
      ? { category: 'Revenue / Deposit', confidence: 'credit', reasoning: 'Positive amount — incoming deposit or payment received' }
      : categorizeTransaction(tx.description, tx.amount);

    const record = await db.ImportedTransaction.create({
      plaid_transaction_id: dedupKey,
      bank_connection_id: null,
      amount: tx.amount,
      transaction_date: tx.date,
      merchant_name: tx.description.substring(0, 200),
      description: `${tx.isCredit ? '[CREDIT] ' : '[DEBIT] '}${tx.description}`,
      plaid_category: `CSV Import - ${tx.accountLabel}`,
      status: 'pending_review',
    });

    await db.AITrainingData.create({
      transaction_id: record.id,
      suggested_category: suggestion.category,
      suggestion_confidence: suggestion.confidence,
      suggestion_reasoning: suggestion.reasoning,
    });

    imported++;
  }

  res.json({
    success: true,
    data: { total: transactions.length, imported, skipped, message: `${imported} transactions imported, ${skipped} duplicates skipped` },
  });
});
