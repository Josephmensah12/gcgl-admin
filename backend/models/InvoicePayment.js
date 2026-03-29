const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InvoicePayment = sequelize.define('InvoicePayment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoiceId: { type: DataTypes.STRING, allowNull: false },
    transactionType: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'PAYMENT',
      validate: { isIn: [['PAYMENT', 'REFUND']] },
    },
    paymentDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    paymentMethod: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['Cash', 'Check', 'Zelle', 'Square', 'Other']] },
    },
    paymentMethodOtherText: { type: DataTypes.STRING(255), allowNull: true },
    comment: { type: DataTypes.TEXT, allowNull: false },
    recordedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidReason: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'invoice_payments',
    underscored: true,
    timestamps: true,
  });

  InvoicePayment.associate = (db) => {
    InvoicePayment.belongsTo(db.Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
    InvoicePayment.belongsTo(db.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    InvoicePayment.belongsTo(db.User, { foreignKey: 'voidedByUserId', as: 'voidedBy' });
  };

  InvoicePayment.PAYMENT_METHODS = ['Cash', 'Check', 'Zelle', 'Square', 'Other'];

  return InvoicePayment;
};
