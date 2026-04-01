const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Expense = sequelize.define('Expense', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    expense_number: { type: DataTypes.STRING(20), unique: true, allowNull: true },
    expense_date: { type: DataTypes.DATEONLY, allowNull: false },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    vendor_or_payee: { type: DataTypes.STRING(200), allowNull: true },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    shipment_id: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    is_fixed_cost: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'expenses',
    underscored: true,
    timestamps: true,
  });

  Expense.associate = (db) => {
    Expense.belongsTo(db.ExpenseCategory, { foreignKey: 'category_id', as: 'category' });
    Expense.belongsTo(db.Shipment, { foreignKey: 'shipment_id', as: 'shipment' });
    Expense.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return Expense;
};
