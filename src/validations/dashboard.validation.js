const Joi = require('joi');

const dateRangeQuery = {
  query: Joi.object().keys({
    dateRange: Joi.string().valid('today', 'week', 'month', 'year', 'all').default('year'),
  }),
};

module.exports = { dateRangeQuery };
