const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AITrainingData = sequelize.define('AITrainingData', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    transaction_id: { type: DataTypes.UUID, allowNull: false },
    suggested_category: { type: DataTypes.STRING(100) },
    suggestion_confidence: { type: DataTypes.STRING(50) }, // keyword_match | amount_pattern | no_match
    suggestion_reasoning: { type: DataTypes.TEXT },
    human_category: { type: DataTypes.STRING(100) },
    human_shipment_id: { type: DataTypes.STRING },
    review_time_seconds: { type: DataTypes.INTEGER },
    suggestion_accepted: { type: DataTypes.BOOLEAN },
    correction_type: { type: DataTypes.STRING(50) }, // category_changed | shipment_changed | both
  }, {
    tableName: 'ai_training_data',
    underscored: true,
    timestamps: true,
  });

  AITrainingData.associate = (db) => {
    AITrainingData.belongsTo(db.ImportedTransaction, { foreignKey: 'transaction_id', as: 'transaction' });
  };

  return AITrainingData;
};
