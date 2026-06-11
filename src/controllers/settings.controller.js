const path = require('path');
const fs = require('fs');
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
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

const uploadProposalTemplate = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No template file uploaded');
  const settings = await settingsService.updateSettings({ proposalTemplatePath: req.file.path });
  res.send({
    success: true,
    message: 'Proposal template uploaded successfully',
    data: { proposalTemplatePath: settings.proposalTemplatePath },
  });
});

const downloadProposalTemplate = catchAsync(async (req, res) => {
  const settings = await settingsService.getSettings();
  const defaultPath = path.resolve(__dirname, '../../templates/proposal-template.docx');
  const filePath = settings.proposalTemplatePath ? path.resolve(settings.proposalTemplatePath) : defaultPath;

  if (!fs.existsSync(filePath)) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No template file found on server. Run scripts/generate-default-template.js to create one.'
    );
  }

  res.download(filePath, 'proposal-template.docx');
});

module.exports = { getSettings, updateSettings, getPrompt, updatePrompt, uploadProposalTemplate, downloadProposalTemplate };
