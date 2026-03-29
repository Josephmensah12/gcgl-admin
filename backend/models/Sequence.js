const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Sequence = sequelize.define('Sequence', {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10001 },
  }, { tableName: 'sequences', underscored: true, timestamps: false });

  return Sequence;
};
