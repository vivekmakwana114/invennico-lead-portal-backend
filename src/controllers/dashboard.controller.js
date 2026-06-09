const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { dashboardService } = require('../services');

const getStats = catchAsync(async (req, res) => {
  const data = await dashboardService.getStats(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Stats fetched', data });
});

const getLeadsChart = catchAsync(async (req, res) => {
  const data = await dashboardService.getLeadsChart(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Leads chart fetched', data });
});

const getProposalsChart = catchAsync(async (req, res) => {
  const data = await dashboardService.getProposalsChart(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Proposals chart fetched', data });
});

const getPipelineChart = catchAsync(async (req, res) => {
  const data = await dashboardService.getPipelineChart(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Pipeline chart fetched', data });
});

const getSourceBreakdown = catchAsync(async (req, res) => {
  const data = await dashboardService.getSourceBreakdown(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Source breakdown fetched', data });
});

const getTechStacks = catchAsync(async (req, res) => {
  const data = await dashboardService.getTechStacks(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Tech stacks fetched', data });
});

const getRecentLeads = catchAsync(async (req, res) => {
  const data = await dashboardService.getRecentLeads(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Recent leads fetched', data });
});

const getRecentActivity = catchAsync(async (req, res) => {
  const data = await dashboardService.getRecentActivity(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Recent activity fetched', data });
});

const getUpcomingFollowups = catchAsync(async (req, res) => {
  const data = await dashboardService.getUpcomingFollowups(req.user, req.query);
  res.status(httpStatus.OK).send({ success: true, message: 'Upcoming follow-ups fetched', data });
});

module.exports = {
  getStats,
  getLeadsChart,
  getProposalsChart,
  getPipelineChart,
  getSourceBreakdown,
  getTechStacks,
  getRecentLeads,
  getRecentActivity,
  getUpcomingFollowups,
};
