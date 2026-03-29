const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MonthlyFixedCost = sequelize.define('MonthlyFixedCost', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    month_year: { type: DataTypes.STRING(7), unique: true, allowNull: false },
    total_fixed_costs: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    days_in_month: { type: DataTypes.INTEGER, allowNull: false },
    daily_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'monthly_fixed_costs',
    underscored: true,
    timestamps: true,
  });

  return MonthlyFixedCost;
};
