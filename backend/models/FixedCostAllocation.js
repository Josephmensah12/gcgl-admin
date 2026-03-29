const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FixedCostAllocation = sequelize.define('FixedCostAllocation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    shipment_id: { type: DataTypes.STRING, allowNull: true },
    allocation_date: { type: DataTypes.DATEONLY, allowNull: false },
    daily_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    allocated_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    month_year: { type: DataTypes.STRING(7), allowNull: false },
    allocation_type: {
      type: DataTypes.STRING(20),
      defaultValue: 'automatic',
      validate: { isIn: [['automatic', 'manual', 'override', 'gap_period', 'gap_assigned']] },
    },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'fixed_cost_allocations',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['allocation_date'] }, { fields: ['shipment_id'] }],
  });

  FixedCostAllocation.associate = (db) => {
    FixedCostAllocation.belongsTo(db.Shipment, { foreignKey: 'shipment_id', as: 'shipment' });
    FixedCostAllocation.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return FixedCostAllocation;
};
