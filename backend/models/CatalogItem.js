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
  }, { tableName: 'catalog_items', underscored: true });

  return CatalogItem;
};
