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
  }, {
    tableName: 'invoices',
    underscored: true,
    hooks: {
      /**
       * Auto-assign shipment by date when an invoice is created or saved
       * without one. Finds the most recent shipment whose start_date is on
       * or before the invoice's createdAt. Prevents orphaned invoices from
       * imports, renumbers, and manual creation.
       */
      afterSave: async (instance) => {
        if (instance.shipmentId && instance.shipmentId !== '') return;
        try {
          const Shipment = sequelize.models.Shipment;
          if (!Shipment) return;
          const invDate = instance.createdAt || new Date();
          const ship = await Shipment.findOne({
            where: {
              start_date: { [require('sequelize').Op.lte]: invDate },
            },
            order: [['start_date', 'DESC']],
          });
          if (ship) {
            // Use raw query to avoid re-triggering this hook
            await sequelize.query(
              'UPDATE invoices SET shipment_id = :sid WHERE id = :id AND (shipment_id IS NULL OR shipment_id = \'\')',
              { replacements: { sid: ship.id, id: instance.id } }
            );
            instance.shipmentId = ship.id;
          }
        } catch (e) {
          console.error('Auto-assign shipment failed for invoice', instance.id, ':', e.message);
        }
      },
    },
  });

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

    // Subtotal = sum of fresh (qty * basePrice) - line discount, derived here
    // instead of trusting the stored finalPrice column (which had inconsistent
    // historical semantics — some rows stored unit price, others stored
    // line total). Each line is also re-saved so the beforeSave hook refreshes
    // its own preDiscountTotal / discountAmount / finalPrice to self-heal
    // stale data.
    let subtotal = 0;
    let lineDiscountsTotal = 0;
    for (const li of items) {
      const qty = parseInt(li.quantity) || 0;
      const unit = parseFloat(li.basePrice) || 0;
      const preDisc = round2(qty * unit);

      // Fresh discount calculation (mirrors LineItem.calculateTotals) so the
      // subtotal reflects the current state even if the row hasn't been saved
      // yet this transaction.
      const discType = li.discountType || 'none';
      const discVal = parseFloat(li.discountValue) || 0;
      let discAmt = 0;
      if (discType === 'percentage' && discVal > 0) discAmt = round2(preDisc * (discVal / 100));
      else if (discType === 'fixed' && discVal > 0) discAmt = round2(Math.min(discVal, preDisc));

      const lineTotal = round2(preDisc - discAmt);
      subtotal += lineTotal;
      lineDiscountsTotal += discAmt;

      // Persist the refreshed values so future reads are consistent. Only save
      // if something actually changed to avoid pointless writes.
      const storedPreDisc = parseFloat(li.preDiscountTotal) || 0;
      const storedDiscAmt = parseFloat(li.discountAmount) || 0;
      const storedFinal = parseFloat(li.finalPrice) || 0;
      if (
        Math.abs(storedPreDisc - preDisc) > 0.001 ||
        Math.abs(storedDiscAmt - discAmt) > 0.001 ||
        Math.abs(storedFinal - lineTotal) > 0.001
      ) {
        li.preDiscountTotal = preDisc;
        li.discountAmount = discAmt;
        li.finalPrice = lineTotal;
        await li.save();
      }
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
