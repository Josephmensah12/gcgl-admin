const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Sequence = sequelize.define('Sequence', {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
    lastInvoiceNumber: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'sequences', underscored: true });

  return Sequence;
};
