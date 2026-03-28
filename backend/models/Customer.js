const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Customer = sequelize.define('Customer', {
    id: { type: DataTypes.STRING, primaryKey: true },
    fullName: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false },
  }, { tableName: 'customers', underscored: true });

  Customer.associate = (db) => {
    Customer.hasMany(db.Recipient, { foreignKey: 'customerId', as: 'recipients', onDelete: 'CASCADE' });
    Customer.hasMany(db.Invoice, { foreignKey: 'customerId', as: 'invoices' });
  };

  return Customer;
};
