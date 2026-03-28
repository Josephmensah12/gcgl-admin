const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Setting = sequelize.define('Setting', {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
    data: { type: DataTypes.JSONB, allowNull: false },
  }, { tableName: 'settings', underscored: true });

  return Setting;
};
