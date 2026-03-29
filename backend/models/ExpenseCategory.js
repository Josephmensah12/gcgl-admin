const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ExpenseCategory = sequelize.define('ExpenseCategory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_fixed_cost: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, {
    tableName: 'expense_categories',
    underscored: true,
    timestamps: true,
  });

  ExpenseCategory.associate = (db) => {
    ExpenseCategory.hasMany(db.Expense, { foreignKey: 'category_id', as: 'expenses' });
  };

  return ExpenseCategory;
};
