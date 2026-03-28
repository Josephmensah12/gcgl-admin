const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Photo = sequelize.define('Photo', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    lineItemId: { type: DataTypes.STRING, allowNull: false },
    data: { type: DataTypes.TEXT, allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'photos', underscored: true, updatedAt: false });

  Photo.associate = (db) => {
    Photo.belongsTo(db.LineItem, { foreignKey: 'lineItemId' });
  };

  return Photo;
};
