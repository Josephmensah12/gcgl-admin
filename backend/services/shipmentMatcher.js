const { Op } = require('sequelize');
const db = require('../models');

/**
 * Find the active shipment for a given date based on start_date/end_date.
 * Returns the shipment ID or null if no match.
 */
async function findShipmentForDate(dateStr) {
  if (!dateStr) return null;

  // Find shipment where date falls within start_date and end_date
  const shipment = await db.Shipment.findOne({
    where: {
      start_date: { [Op.lte]: dateStr },
      [Op.or]: [
        { end_date: { [Op.gte]: dateStr } },
        { end_date: null }, // Active shipment with no end date
      ],
    },
    order: [['start_date', 'DESC']], // Most recent first if overlapping
  });

  return shipment?.id || null;
}

module.exports = { findShipmentForDate };
