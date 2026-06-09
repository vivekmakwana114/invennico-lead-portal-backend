const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { leadService } = require('../services');

const createLead = catchAsync(async (req, res) => {
  const lead = await leadService.createLead(req.user.id, req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Lead created successfully',
    data: { lead },
  });
});

const getLeads = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'source', 'createdBy', 'dateRange', 'search']);
  const options = pick(req.query, ['limit', 'page']);
  const result = await leadService.queryLeads(filter, options, req.user);
  res.send({
    success: true,
    message: 'Leads fetched successfully',
    data: result,
  });
});

const getLead = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadById(req.params.leadId, req.user);
  res.send({
    success: true,
    message: 'Lead fetched successfully',
    data: { lead },
  });
});

const updateLead = catchAsync(async (req, res) => {
  const lead = await leadService.updateLeadById(req.params.leadId, req.body, req.user);
  res.send({
    success: true,
    message: 'Lead updated successfully',
    data: { lead },
  });
});

const deleteLead = catchAsync(async (req, res) => {
  await leadService.deleteLeadById(req.params.leadId, req.user);
  res.send({ success: true, message: 'Lead deleted successfully' });
});

const getLeadStats = catchAsync(async (req, res) => {
  const stats = await leadService.getLeadStats(req.user);
  res.send({ success: true, message: 'Lead stats fetched successfully', data: stats });
});

const analyzeLead = catchAsync(async (req, res) => {
  const result = await leadService.analyzeLead(req.body);
  res.send({ success: true, message: 'Lead analyzed successfully', data: result });
});

const generateWhatsapp = catchAsync(async (req, res) => {
  const result = await leadService.generateWhatsapp(req.body, req.user);
  res.send({ success: true, message: 'WhatsApp message generated', data: result });
});

const uploadPdf = catchAsync(async (req, res) => {
  const result = await leadService.uploadAndExtractPdf(req.file);
  res.send({ success: true, message: 'PDF uploaded and text extracted', data: result });
});

const generateProposal = catchAsync(async (req, res) => {
  const { preparedFor, preparedBy, scopeDoc } = req.body;
  const result = await leadService.generateProposal(req.params.leadId, req.user, { preparedFor, preparedBy, scopeDoc });
  res.send({ success: true, message: 'Proposal generated successfully', data: result });
});

const downloadProposal = catchAsync(async (req, res) => {
  const { filePath, fileName } = await leadService.downloadProposal(req.params.leadId, req.user);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.sendFile(filePath);
});

module.exports = {
  createLead,
  getLeads,
  getLead,
  updateLead,
  deleteLead,
  getLeadStats,
  analyzeLead,
  generateWhatsapp,
  uploadPdf,
  generateProposal,
  downloadProposal,
};
