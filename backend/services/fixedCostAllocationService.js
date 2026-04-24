const { Op } = require('sequelize');
const db = require('../models');

const FixedCostAllocationService = {
  // Main daily allocation
  async allocateDaily(targetDate = null) {
    const today = targetDate || new Date().toISOString().split('T')[0];
    const monthYear = today.substring(0, 7);

    const dailyRate = await this.getDailyRateForMonth(monthYear);
    if (!dailyRate || dailyRate <= 0) {
      console.log(`No fixed costs to allocate for ${monthYear}`);
      return { allocated: 0, dailyRate: 0, shipments: [] };
    }

    // Check if already allocated for this date
    const existing = await db.FixedCostAllocation.count({ where: { allocation_date: today, allocation_type: { [Op.ne]: 'manual' } } });
    if (existing > 0) {
      console.log(`Already allocated for ${today}`);
      return { allocated: 0, dailyRate, message: 'Already allocated for this date' };
    }

    const activeShipments = await this.findActiveShipments(today);
    const result = { dailyRate, date: today, shipments: [] };

    if (activeShipments.length === 0) {
      await db.FixedCostAllocation.create({
        shipment_id: null, allocation_date: today, daily_rate: dailyRate,
        allocated_amount: dailyRate, month_year: monthYear, allocation_type: 'gap_period',
      });
      result.allocated = dailyRate;
      result.gapPeriod = true;
    } else if (activeShipments.length === 1) {
      await this.allocateToShipment(activeShipments[0].id, today, dailyRate, dailyRate, monthYear, 'automatic');
      result.allocated = dailyRate;
      result.shipments = [{ id: activeShipments[0].id, name: activeShipments[0].name, amount: dailyRate }];
    } else {
      // Compute fresh totalValue per shipment (cached column can drift)
      const sumRows = await db.Invoice.findAll({
        where: { shipmentId: { [Op.in]: activeShipments.map((s) => s.id) }, status: 'completed' },
        attributes: [
          'shipmentId',
          [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue'],
        ],
        group: ['shipmentId'],
        raw: true,
      });
      const tvMap = {};
      for (const r of sumRows) tvMap[r.shipmentId] = parseFloat(r.totalValue) || 0;

      const totalValue = activeShipments.reduce((s, sh) => s + (tvMap[sh.id] || 0), 0);
      for (const sh of activeShipments) {
        const shTv = tvMap[sh.id] || 0;
        const proportion = totalValue > 0 ? shTv / totalValue : 1 / activeShipments.length;
        const amount = Math.round(dailyRate * proportion * 100) / 100;
        await this.allocateToShipment(sh.id, today, dailyRate, amount, monthYear, 'automatic');
        result.shipments.push({ id: sh.id, name: sh.name, amount });
      }
      result.allocated = dailyRate;
    }

    return result;
  },

  async getDailyRateForMonth(monthYear) {
    let monthly = await db.MonthlyFixedCost.findOne({ where: { month_year: monthYear } });
    if (monthly) return parseFloat(monthly.daily_rate);

    const totalFixed = await this.calculateMonthlyFixedCosts(monthYear);
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyRate = Math.round((totalFixed / daysInMonth) * 100) / 100;

    await db.MonthlyFixedCost.upsert({
      month_year: monthYear, total_fixed_costs: totalFixed, days_in_month: daysInMonth, daily_rate: dailyRate,
    });

    return dailyRate;
  },

  async calculateMonthlyFixedCosts(monthYear) {
    const [year, month] = monthYear.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const startOfMonth = `${monthYear}-01`;
    const endOfMonth = `${monthYear}-${String(lastDay).padStart(2, '0')}`;

    // From approved bank transactions marked as fixed cost
    const bankFixed = await db.ImportedTransaction.sum('amount', {
      where: {
        status: 'approved', is_business_expense: true, is_fixed_cost: true,
        transaction_date: { [Op.gte]: startOfMonth, [Op.lte]: endOfMonth },
      },
    });

    // From manual expenses in fixed cost categories
    const manualFixed = await db.sequelize.query(`
      SELECT COALESCE(SUM(e.amount), 0) as total
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ec.is_fixed_cost = true
        AND e.expense_date >= :start AND e.expense_date <= :end
    `, {
      replacements: { start: startOfMonth, end: endOfMonth },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return (parseFloat(bankFixed) || 0) + (parseFloat(manualFixed[0]?.total) || 0);
  },

  async findActiveShipments(date) {
    return db.Shipment.findAll({
      where: {
        status: { [Op.in]: ['collecting', 'ready'] },
        [Op.or]: [
          { start_date: null },
          { start_date: { [Op.lte]: date } },
        ],
        [Op.or]: [
          { end_date: null },
          { end_date: { [Op.gte]: date } },
        ],
      },
      order: [['start_date', 'ASC'], ['createdAt', 'ASC']],
    });
  },

  async allocateToShipment(shipmentId, date, dailyRate, amount, monthYear, type, userId = null) {
    await db.FixedCostAllocation.create({
      shipment_id: shipmentId, allocation_date: date, daily_rate: dailyRate,
      allocated_amount: amount, month_year: monthYear, allocation_type: type,
      created_by: userId,
    });
    await this.updateShipmentTotals(shipmentId);
  },

  async updateShipmentTotals(shipmentId) {
    const stats = await db.FixedCostAllocation.findOne({
      where: { shipment_id: shipmentId },
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'active_days'],
        [db.sequelize.fn('SUM', db.sequelize.col('allocated_amount')), 'accrued'],
        [db.sequelize.fn('AVG', db.sequelize.col('daily_rate')), 'avg_rate'],
      ],
      raw: true,
    });

    await db.Shipment.update({
      active_days: parseInt(stats.active_days) || 0,
      accrued_fixed_costs: parseFloat(stats.accrued) || 0,
      daily_fixed_rate: parseFloat(stats.avg_rate) || 0,
    }, { where: { id: shipmentId } });
  },

  async assignGapCosts(shipmentId) {
    await db.FixedCostAllocation.update(
      { shipment_id: shipmentId, allocation_type: 'gap_assigned' },
      { where: { shipment_id: null, allocation_type: 'gap_period' } }
    );
    await this.updateShipmentTotals(shipmentId);
  },

  async recalculateMonthlyRate(monthYear) {
    const totalFixed = await this.calculateMonthlyFixedCosts(monthYear);
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyRate = Math.round((totalFixed / daysInMonth) * 100) / 100;

    await db.MonthlyFixedCost.upsert({
      month_year: monthYear, total_fixed_costs: totalFixed, days_in_month: daysInMonth, daily_rate: dailyRate,
    });
    return dailyRate;
  },

  async recalculateShipmentAllocations(shipmentId, startDate, endDate) {
    if (!startDate) return;

    // Normalize dates to YYYY-MM-DD strings
    const toDateStr = (d) => {
      if (!d) return null;
      if (typeof d === 'string') return d.substring(0, 10);
      if (d instanceof Date) return d.toISOString().split('T')[0];
      return String(d).substring(0, 10);
    };

    const startStr = toDateStr(startDate);
    const endStr = toDateStr(endDate);
    if (!startStr) return;

    // Remove existing auto allocations
    await db.FixedCostAllocation.destroy({
      where: { shipment_id: shipmentId, allocation_type: { [Op.in]: ['automatic', 'override', 'gap_assigned'] } },
    });

    const start = new Date(startStr + 'T12:00:00');
    const end = endStr ? new Date(endStr + 'T12:00:00') : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    let current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const monthYear = dateStr.substring(0, 7);
      const dailyRate = await this.getDailyRateForMonth(monthYear);
      if (dailyRate > 0) {
        await this.allocateToShipment(shipmentId, dateStr, dailyRate, dailyRate, monthYear, 'override');
      }
      current.setDate(current.getDate() + 1);
    }

    await this.updateShipmentTotals(shipmentId);
  },
};

module.exports = FixedCostAllocationService;
