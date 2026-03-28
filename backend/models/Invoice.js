const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: { type: DataTypes.STRING, primaryKey: true },
    invoiceNumber: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    customerId: DataTypes.STRING,
    customerName: DataTypes.STRING,
    customerEmail: DataTypes.STRING,
    customerAddress: DataTypes.STRING,
    customerPhone: DataTypes.STRING,
    recipientId: DataTypes.STRING,
    recipientName: DataTypes.STRING,
    recipientPhone: DataTypes.STRING,
    recipientAddress: DataTypes.STRING,
    subtotal: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    totalDiscount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    finalTotal: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    originalItemCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    addedItemCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    paymentStatus: { type: DataTypes.STRING, defaultValue: 'unpaid' },
    paymentMethod: DataTypes.STRING,
    amountPaid: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    shipmentId: DataTypes.STRING,
    status: { type: DataTypes.STRING, defaultValue: 'completed' },
    lastEditedAt: DataTypes.DATE,
  }, { tableName: 'invoices', underscored: true });

  Invoice.associate = (db) => {
    Invoice.hasMany(db.LineItem, { foreignKey: 'invoiceId', as: 'lineItems', onDelete: 'CASCADE' });
    Invoice.belongsTo(db.Customer, { foreignKey: 'customerId' });
    Invoice.belongsTo(db.Shipment, { foreignKey: 'shipmentId' });
  };

  return Invoice;
};
