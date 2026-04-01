const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status = '', search = '', sortBy = 'start_date', sortOrder = 'ASC' } = req.query;

  const where = {};
  if (status) {
    where.status = status;
  }
  if (search) {
    where.name = { [Op.iLike]: `%${search}%` };
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.Shipment.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder]],
  });

  // Get invoice counts and stats per shipment
  const shipmentIds = rows.map((s) => s.id);
  const invoiceStats = await db.Invoice.findAll({
    where: { shipmentId: { [Op.in]: shipmentIds }, status: 'completed' },
    attributes: [
      'shipmentId',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'invoiceCount'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'paid' THEN final_total ELSE 0 END")), 'paidValue'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'unpaid' THEN final_total ELSE 0 END")), 'unpaidValue'],
    ],
    group: ['shipmentId'],
    raw: true,
  });

  const statsMap = {};
  invoiceStats.forEach((s) => {
    statsMap[s.shipmentId] = {
      invoiceCount: parseInt(s.invoiceCount),
      totalValue: parseFloat(s.totalValue) || 0,
      paidValue: parseFloat(s.paidValue) || 0,
      unpaidValue: parseFloat(s.unpaidValue) || 0,
    };
  });

  // Get capacity thresholds from settings
  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  const shipments = rows.map((s) => ({
    ...s.toJSON(),
    stats: statsMap[s.id] || { invoiceCount: 0, totalValue: 0, paidValue: 0, unpaidValue: 0 },
    capacityPercent: Math.min(100, Math.round(((parseFloat(s.totalValue) || 0) / maxCapacity) * 100)),
    maxCapacity,
  }));

  res.json({
    success: true,
    data: {
      shipments,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    },
  });
});

exports.getById = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id, {
    include: [{
      model: db.Invoice,
      as: 'invoices',
      where: { status: 'completed' },
      required: false,
      include: [
        { model: db.Customer, attributes: ['fullName', 'phone'] },
        { model: db.LineItem, as: 'lineItems', attributes: ['id', 'type', 'catalogName', 'quantity', 'finalPrice'] },
      ],
    }],
  });

  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  res.json({
    success: true,
    data: {
      ...shipment.toJSON(),
      capacityPercent: Math.min(100, Math.round(((parseFloat(shipment.totalValue) || 0) / maxCapacity) * 100)),
      maxCapacity,
    },
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, capacityType = 'money' } = req.body;

  const shipmentName = name || generateShipmentName();
  const shipment = await db.Shipment.create({
    id: uuidv4(),
    name: shipmentName,
    status: 'collecting',
    capacityType,
  });

  res.status(201).json({ success: true, data: shipment });
});

exports.update = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  const { name, status, capacityType } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (status) {
    updates.status = status;
    if (status === 'shipped' && !shipment.shippedAt) {
      updates.shippedAt = new Date();
    }
  }
  if (capacityType) updates.capacityType = capacityType;

  await shipment.update(updates);
  res.json({ success: true, data: shipment });
});

exports.delete = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  // Unassign all invoices first
  await db.Invoice.update(
    { shipmentId: null },
    { where: { shipmentId: shipment.id } }
  );

  await shipment.destroy();
  res.json({ success: true, message: 'Shipment deleted' });
});

exports.getActiveShipments = asyncHandler(async (req, res) => {
  const shipments = await db.Shipment.findAll({
    order: [['start_date', 'ASC'], ['createdAt', 'ASC']],
  });

  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  const result = shipments.map((s) => ({
    ...s.toJSON(),
    capacityPercent: Math.min(100, Math.round(((parseFloat(s.totalValue) || 0) / maxCapacity) * 100)),
    maxCapacity,
  }));

  res.json({ success: true, data: result });
});

function generateShipmentName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${y}-${m}-${d}-${rand}`;
}
