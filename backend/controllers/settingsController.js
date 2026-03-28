const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');

exports.get = asyncHandler(async (req, res) => {
  let settings = await db.Setting.findByPk(1);
  if (!settings) {
    settings = await db.Setting.create({
      id: 1,
      data: getDefaultSettings(),
    });
  }
  res.json({ success: true, data: settings.data });
});

exports.update = asyncHandler(async (req, res) => {
  let settings = await db.Setting.findByPk(1);
  if (!settings) {
    settings = await db.Setting.create({
      id: 1,
      data: getDefaultSettings(),
    });
  }

  const updated = { ...settings.data, ...req.body };
  await settings.update({ data: updated });

  res.json({ success: true, data: updated });
});

exports.updateSection = asyncHandler(async (req, res) => {
  const { section } = req.params;
  let settings = await db.Setting.findByPk(1);
  if (!settings) {
    settings = await db.Setting.create({
      id: 1,
      data: getDefaultSettings(),
    });
  }

  const updated = { ...settings.data };
  updated[section] = { ...(updated[section] || {}), ...req.body };
  await settings.update({ data: updated });

  res.json({ success: true, data: updated });
});

function getDefaultSettings() {
  return {
    companyInfo: {
      name: 'Gold Coast Global Logistics',
      phone: '',
      email: '',
      website: '',
      address: '',
      logo: null,
    },
    branding: {
      primaryColor: '#1e40af',
      footerText: '',
    },
    paymentMethods: {
      cash: { enabled: true, instructions: '' },
      check: { enabled: true, instructions: '' },
      zelle: { enabled: true, instructions: '' },
      square: { enabled: false, instructions: '' },
    },
    shipmentSettings: {
      capacityType: 'money',
      moneyThresholds: { min: 25000, max: 30000 },
      volumeCapacity: 2390,
      weightCapacity: 67200,
      namingConvention: 'YYYY-MM-DD-###',
      alertThresholds: {
        warehouseAging: 7,
        capacityWarning: 0.9,
      },
    },
    policies: {
      prohibitedItems: [],
      terms: '',
      disclaimers: '',
    },
  };
}
