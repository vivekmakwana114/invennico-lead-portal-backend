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
  const aiPrompts = {
    leadAnalysis: settings.aiPrompts?.leadAnalysis || settings.aiPrompt || '',
    whatsappFirst: settings.aiPrompts?.whatsappFirst || '',
    whatsappRegen: settings.aiPrompts?.whatsappRegen || '',
    geminiResearch: settings.aiPrompts?.geminiResearch || '',
    proposal: settings.aiPrompts?.proposal || '',
  };
  res.send({ success: true, message: 'Prompts fetched successfully', data: { aiPrompts } });
});

const VALID_PROMPT_KEYS = ['leadAnalysis', 'whatsappFirst', 'whatsappRegen', 'geminiResearch', 'proposal'];

const updateSinglePrompt = catchAsync(async (req, res) => {
  const { key } = req.params;
  if (!VALID_PROMPT_KEYS.includes(key)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid prompt key: ${key}`);
  }
  const value = req.body.value ?? '';
  const settings = await settingsService.updateSettings({ [`aiPrompts.${key}`]: value });
  res.send({
    success: true,
    message: 'Prompt updated successfully',
    data: { key, value: settings.aiPrompts?.[key] ?? '' },
  });
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
    throw new ApiError(httpStatus.NOT_FOUND, 'No template file found on server.');
  }

  res.download(filePath, 'proposal-template.docx');
});

module.exports = {
  getSettings,
  updateSettings,
  getPrompt,
  updateSinglePrompt,
  uploadProposalTemplate,
  downloadProposalTemplate,
};
