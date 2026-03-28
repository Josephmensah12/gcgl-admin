const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Shipment = sequelize.define('Shipment', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'collecting' },
    capacityType: { type: DataTypes.STRING, defaultValue: 'money' },
    totalValue: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    totalVolume: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    totalWeight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    shippedAt: DataTypes.DATE,
  }, { tableName: 'shipments', underscored: true });

  Shipment.associate = (db) => {
    Shipment.hasMany(db.Invoice, { foreignKey: 'shipmentId', as: 'invoices' });
  };

  return Shipment;
};
