const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ShipmentEvent = sequelize.define('ShipmentEvent', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    shipmentId: { type: DataTypes.STRING, allowNull: false },
    eventType: { type: DataTypes.STRING(50), allowNull: false },
    eventDate: { type: DataTypes.DATE, allowNull: false },
    location: { type: DataTypes.STRING(255) },
    vessel: { type: DataTypes.STRING(255) },
    voyage: { type: DataTypes.STRING(100) },
    description: { type: DataTypes.TEXT },
    rawData: { type: DataTypes.JSONB },
    source: { type: DataTypes.STRING(20), defaultValue: 'terminal49' },
  }, {
    tableName: 'shipment_events',
    underscored: true,
    timestamps: true,
  });

  ShipmentEvent.associate = (db) => {
    ShipmentEvent.belongsTo(db.Shipment, { foreignKey: 'shipmentId' });
  };

  return ShipmentEvent;
};
