const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const { search = '', category = '', active = '' } = req.query;

  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
    ];
  }
  if (category) where.category = category;
  if (active !== '') where.active = active === 'true';

  const items = await db.CatalogItem.findAll({
    where,
    order: [['category', 'ASC'], ['name', 'ASC']],
  });

  // Get unique categories
  const categories = await db.CatalogItem.findAll({
    attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('category')), 'category']],
    raw: true,
  });

  res.json({
    success: true,
    data: {
      items,
      categories: categories.map((c) => c.category),
    },
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, description, category, price, image, capacityWeight } = req.body;
  if (!name || !price) {
    throw new AppError('Name and price required', 400, 'VALIDATION_ERROR');
  }

  const item = await db.CatalogItem.create({
    id: uuidv4(),
    name,
    description,
    category: category || 'Uncategorized',
    price,
    image: image || null,
    capacityWeight: capacityWeight != null ? capacityWeight : 1.0,
  });

  res.status(201).json({ success: true, data: item });
});

exports.update = asyncHandler(async (req, res) => {
  const item = await db.CatalogItem.findByPk(req.params.id);
  if (!item) {
    throw new AppError('Catalog item not found', 404, 'NOT_FOUND');
  }

  await item.update(req.body);
  res.json({ success: true, data: item });
});

exports.delete = asyncHandler(async (req, res) => {
  const item = await db.CatalogItem.findByPk(req.params.id);
  if (!item) {
    throw new AppError('Catalog item not found', 404, 'NOT_FOUND');
  }

  await item.destroy();
  res.json({ success: true, message: 'Catalog item deleted' });
});
