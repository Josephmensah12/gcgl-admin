const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BankConnection = sequelize.define('BankConnection', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    account_type: { type: DataTypes.STRING(50), allowNull: false }, // checking | credit
    bank_name: { type: DataTypes.STRING(100), allowNull: false },
    plaid_account_id: { type: DataTypes.STRING(100), unique: true, allowNull: false },
    plaid_access_token: { type: DataTypes.TEXT, allowNull: false }, // encrypted
    account_nickname: { type: DataTypes.STRING(100) },
    account_mask: { type: DataTypes.STRING(10) }, // last 4 digits
    last_sync: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'bank_connections',
    underscored: true,
    timestamps: true,
  });

  BankConnection.associate = (db) => {
    BankConnection.hasMany(db.ImportedTransaction, { foreignKey: 'bank_connection_id', as: 'transactions' });
  };

  return BankConnection;
};
