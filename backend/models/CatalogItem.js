const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CatalogItem = sequelize.define('CatalogItem', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.STRING,
    category: { type: DataTypes.STRING, defaultValue: 'Uncategorized' },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    image: DataTypes.TEXT,
    capacityWeight: { type: DataTypes.DECIMAL(5, 2), defaultValue: 1.0 },
  }, { tableName: 'catalog_items', underscored: true });

  return CatalogItem;
};
