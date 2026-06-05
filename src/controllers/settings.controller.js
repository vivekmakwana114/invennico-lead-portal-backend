const catchAsync = require('../utils/catchAsync');
const { settingsService } = require('../services');

const getSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.getSettings();
  res.send({ success: true, message: 'Settings fetched successfully', data: { settings } });
});

const updateSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);
  res.send({ success: true, message: 'Settings updated successfully', data: { settings } });
});

module.exports = { getSettings, updateSettings };
