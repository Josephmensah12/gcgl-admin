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
    // Fixed cost allocation fields
    start_date: { type: DataTypes.DATEONLY, allowNull: true },
    end_date: { type: DataTypes.DATEONLY, allowNull: true },
    active_days: { type: DataTypes.INTEGER, defaultValue: 0 },
    daily_fixed_rate: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    accrued_fixed_costs: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    admin_start_date_override: { type: DataTypes.DATEONLY, allowNull: true },
    admin_end_date_override: { type: DataTypes.DATEONLY, allowNull: true },
    manual_fixed_cost_override: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    fixed_cost_notes: { type: DataTypes.TEXT, allowNull: true },
  }, { tableName: 'shipments', underscored: true });

  Shipment.associate = (db) => {
    Shipment.hasMany(db.Invoice, { foreignKey: 'shipmentId', as: 'invoices' });
    Shipment.hasMany(db.FixedCostAllocation, { foreignKey: 'shipment_id', as: 'fixedCostAllocations' });
  };

  return Shipment;
};
