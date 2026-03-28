const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LineItem = sequelize.define('LineItem', {
    id: { type: DataTypes.STRING, primaryKey: true },
    invoiceId: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    catalogItemId: DataTypes.STRING,
    catalogName: DataTypes.STRING,
    description: DataTypes.TEXT,
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    basePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    discountType: DataTypes.STRING,
    discountAmount: { type: DataTypes.DECIMAL(10, 2) },
    finalPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    dimensionsL: DataTypes.DECIMAL(8, 2),
    dimensionsW: DataTypes.DECIMAL(8, 2),
    dimensionsH: DataTypes.DECIMAL(8, 2),
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'line_items', underscored: true });

  LineItem.associate = (db) => {
    LineItem.belongsTo(db.Invoice, { foreignKey: 'invoiceId' });
    LineItem.hasMany(db.Photo, { foreignKey: 'lineItemId', as: 'photos', onDelete: 'CASCADE' });
  };

  return LineItem;
};
