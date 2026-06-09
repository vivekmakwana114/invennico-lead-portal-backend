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

const getPrompt = catchAsync(async (req, res) => {
  const settings = await settingsService.getSettings();
  res.send({ success: true, message: 'Prompt fetched successfully', data: { aiPrompt: settings.aiPrompt || '' } });
});

const updatePrompt = catchAsync(async (req, res) => {
  const settings = await settingsService.updateSettings({ aiPrompt: req.body.aiPrompt ?? '' });
  res.send({ success: true, message: 'Prompt updated successfully', data: { aiPrompt: settings.aiPrompt || '' } });
});

module.exports = { getSettings, updateSettings, getPrompt, updatePrompt };
