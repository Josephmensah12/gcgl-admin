const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Recipient = sequelize.define('Recipient', {
    id: { type: DataTypes.STRING, primaryKey: true },
    customerId: { type: DataTypes.STRING, allowNull: false },
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false },
    city: { type: DataTypes.STRING, allowNull: false },
    country: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Ghana' },
    address: { type: DataTypes.STRING, allowNull: false },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { tableName: 'recipients', underscored: true });

  Recipient.associate = (db) => {
    Recipient.belongsTo(db.Customer, { foreignKey: 'customerId' });
  };

  return Recipient;
};
