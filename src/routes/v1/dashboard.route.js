const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const dashboardValidation = require('../../validations/dashboard.validation');
const dashboardController = require('../../controllers/dashboard.controller');

const router = express.Router();

const withDateRange = [auth(), validate(dashboardValidation.dateRangeQuery)];

router.get('/stats', ...withDateRange, dashboardController.getStats);
router.get('/leads/chart', ...withDateRange, dashboardController.getLeadsChart);
router.get('/proposals/chart', ...withDateRange, dashboardController.getProposalsChart);
router.get('/pipeline/chart', ...withDateRange, dashboardController.getPipelineChart);
router.get('/source/breakdown', ...withDateRange, dashboardController.getSourceBreakdown);
router.get('/tech/stacks', ...withDateRange, dashboardController.getTechStacks);
router.get('/recent/leads', ...withDateRange, dashboardController.getRecentLeads);
router.get('/recent/activity', ...withDateRange, dashboardController.getRecentActivity);
router.get('/upcoming/followups', ...withDateRange, dashboardController.getUpcomingFollowups);

module.exports = router;
