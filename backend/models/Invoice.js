const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: { type: DataTypes.STRING, primaryKey: true },
    invoiceNumber: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    customerId: DataTypes.STRING,
    customerName: DataTypes.STRING,
    customerEmail: DataTypes.STRING,
    customerAddress: DataTypes.STRING,
    customerPhone: DataTypes.STRING,
    recipientId: DataTypes.STRING,
    recipientName: DataTypes.STRING,
    recipientPhone: DataTypes.STRING,
    recipientAddress: DataTypes.STRING,
    subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    totalDiscount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // Invoice-level discount input (applied on top of the line-discounted subtotal)
    discountType:  { type: DataTypes.STRING, defaultValue: 'none' }, // 'none' | 'percentage' | 'fixed'
    discountValue: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    discountPercent: { type: DataTypes.DECIMAL(8, 4), defaultValue: 0 },
    finalTotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    originalItemCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    addedItemCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    paymentStatus: { type: DataTypes.STRING, defaultValue: 'unpaid' },
    paymentMethod: DataTypes.STRING,
    amountPaid: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    shipmentId: DataTypes.STRING,
    status: { type: DataTypes.STRING, defaultValue: 'completed' },
    lastEditedAt: DataTypes.DATE,
  }, { tableName: 'invoices', underscored: true });

  Invoice.associate = (db) => {
    Invoice.hasMany(db.LineItem, { foreignKey: 'invoiceId', as: 'lineItems', onDelete: 'CASCADE' });
    Invoice.belongsTo(db.Customer, { foreignKey: 'customerId' });
    Invoice.belongsTo(db.Shipment, { foreignKey: 'shipmentId' });
  };

  /**
   * Recalculate invoice subtotal, total_discount, final_total from the current
   * line items + invoice-level discount. Mirrors BizHub's recalculateTotals.
   *
   * Math:
   *   subtotal          = SUM(line.finalPrice) after line-item discounts
   *   invoiceDiscount   = percentage or fixed discount applied on subtotal
   *   finalTotal        = subtotal - invoiceDiscount
   *
   * Line discounts are applied per-item via LineItem.calculateTotals() /
   * beforeSave hook, so this method only deals with the invoice-level layer
   * and the rollup.
   */
  Invoice.prototype.recalculateTotals = async function() {
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const LineItem = sequelize.models.LineItem;

    const items = await LineItem.findAll({ where: { invoiceId: this.id } });

    // Subtotal = sum of post-line-discount totals
    let subtotal = 0;
    let lineDiscountsTotal = 0;
    for (const li of items) {
      subtotal += parseFloat(li.finalPrice) || 0;
      lineDiscountsTotal += parseFloat(li.discountAmount) || 0;
    }
    subtotal = round2(subtotal);

    // Apply invoice-level discount on top of the already line-discounted subtotal
    const discType = this.discountType || 'none';
    const discVal = parseFloat(this.discountValue) || 0;
    let invoiceDiscAmt = 0;

    if (discType === 'percentage' && discVal > 0) {
      invoiceDiscAmt = round2(subtotal * (discVal / 100));
      this.discountPercent = round2(discVal);
    } else if (discType === 'fixed' && discVal > 0) {
      invoiceDiscAmt = round2(Math.min(discVal, subtotal));
      this.discountPercent = subtotal > 0 ? round2((invoiceDiscAmt / subtotal) * 100) : 0;
    } else {
      this.discountPercent = 0;
    }

    const finalTotal = round2(subtotal - invoiceDiscAmt);

    this.subtotal = subtotal;
    // totalDiscount captures the full discount the customer sees (line + invoice)
    this.totalDiscount = round2(lineDiscountsTotal + invoiceDiscAmt);
    this.finalTotal = finalTotal;

    await this.save();
    return this;
  };

  return Invoice;
};
