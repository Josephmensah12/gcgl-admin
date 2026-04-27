const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LineItem = sequelize.define('LineItem', {
    id: { type: DataTypes.STRING, primaryKey: true },
    invoiceId: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    catalogItemId: DataTypes.STRING,
    catalogName: DataTypes.STRING,
    description: DataTypes.TEXT,
    notes: DataTypes.TEXT, // optional per-item comment ("blue model", "fragile", etc.)
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    basePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    // Discount inputs
    discountType: { type: DataTypes.STRING, defaultValue: 'none' }, // 'none' | 'percentage' | 'fixed'
    discountValue: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // Computed values
    preDiscountTotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }, // qty * basePrice
    discountAmount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },   // absolute discount applied
    finalPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },       // preDiscountTotal - discountAmount
    dimensionsL: DataTypes.DECIMAL(8, 2),
    dimensionsW: DataTypes.DECIMAL(8, 2),
    dimensionsH: DataTypes.DECIMAL(8, 2),
    capacityWeight: { type: DataTypes.DECIMAL(5, 2), defaultValue: 1.0 },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    tableName: 'line_items',
    underscored: true,
    hooks: {
      // Recompute discount + final price on every save so the DB always matches
      // the stored discount inputs. Mirrors BizHub's beforeSave hook.
      beforeSave: (instance) => {
        if (typeof instance.calculateTotals === 'function') instance.calculateTotals();
      },
    },
  });

  LineItem.associate = (db) => {
    LineItem.belongsTo(db.Invoice, { foreignKey: 'invoiceId' });
    LineItem.hasMany(db.Photo, { foreignKey: 'lineItemId', as: 'photos', onDelete: 'CASCADE' });
  };

  /**
   * Compute preDiscountTotal, discountAmount, and finalPrice from the current
   * quantity / basePrice / discountType / discountValue. Called automatically
   * via the beforeSave hook.
   *
   * Math:
   *   preDiscountTotal = qty * basePrice
   *   if percentage:   discountAmount = preDiscountTotal * discountValue/100
   *   if fixed:        discountAmount = min(discountValue, preDiscountTotal)
   *   finalPrice       = preDiscountTotal - discountAmount
   */
  LineItem.prototype.calculateTotals = function() {
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const qty = parseInt(this.quantity) || 0;
    const unit = parseFloat(this.basePrice) || 0;
    const preDiscount = round2(qty * unit);

    const discType = this.discountType || 'none';
    const discVal = parseFloat(this.discountValue) || 0;
    let discAmt = 0;

    if (discType === 'percentage' && discVal > 0) {
      discAmt = round2(preDiscount * (discVal / 100));
    } else if (discType === 'fixed' && discVal > 0) {
      discAmt = round2(Math.min(discVal, preDiscount));
    }

    this.preDiscountTotal = preDiscount;
    this.discountAmount = discAmt;
    this.finalPrice = round2(preDiscount - discAmt);
  };

  return LineItem;
};
