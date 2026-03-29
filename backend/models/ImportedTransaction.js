const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ImportedTransaction = sequelize.define('ImportedTransaction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    plaid_transaction_id: { type: DataTypes.STRING(100), unique: true, allowNull: false },
    bank_connection_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    transaction_date: { type: DataTypes.DATEONLY, allowNull: false },
    merchant_name: { type: DataTypes.STRING(200) },
    description: { type: DataTypes.TEXT },
    plaid_category: { type: DataTypes.STRING(100) },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'pending_review',
      validate: { isIn: [['pending_review', 'approved', 'rejected', 'deferred']] },
    },
    imported_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    // Review fields
    gcgl_category: { type: DataTypes.STRING(100) },
    shipment_id: { type: DataTypes.STRING, allowNull: true },
    is_business_expense: { type: DataTypes.BOOLEAN, allowNull: true },
    notes: { type: DataTypes.TEXT },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'imported_transactions',
    underscored: true,
    timestamps: true,
  });

  ImportedTransaction.associate = (db) => {
    ImportedTransaction.belongsTo(db.BankConnection, { foreignKey: 'bank_connection_id', as: 'bankConnection' });
    ImportedTransaction.belongsTo(db.Shipment, { foreignKey: 'shipment_id', as: 'shipment' });
    ImportedTransaction.belongsTo(db.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
    ImportedTransaction.hasOne(db.AITrainingData, { foreignKey: 'transaction_id', as: 'trainingData' });
  };

  return ImportedTransaction;
};
