const { Types } = require('mongoose');
const { Lead } = require('../models');

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ALL_SOURCES = ['alliance', 'direct', 'referral', 'upwork', 'freelancer', 'other'];

// ── Shared helpers ────────────────────────────────────────────────────────────

function parseBudgetMidpoint(str) {
  if (!str) return 0;
  const nums = (str.match(/[\d,]+/g) || []).map((n) => parseInt(n.replace(/,/g, ''), 10)).filter((n) => !Number.isNaN(n));
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Strips version numbers, parenthetical descriptions, and "with X" / "for X" suffixes
 * so verbose AI-generated names become clean tech identifiers.
 * e.g. "Node.js with Express/Fastify (desc)" → "Node.js"
 *      "PostgreSQL 15+ (RDS managed)"        → "PostgreSQL"
 *      "Next.js 14+ with React"               → "Next.js"
 */
function normalizeTechName(str) {
  if (!str) return str;
  return str
    .split(/\s+(with|for|\()/i)[0]
    .replace(/\s*\d+[+.]*\s*$/, '')
    .trim();
}

function buildDateFilter(dateRange) {
  const now = new Date();
  switch (dateRange) {
    case 'today': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return { createdAt: { $gte: start } };
    }
    case 'week': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
      return { createdAt: { $gte: start } };
    }
    case 'month': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { createdAt: { $gte: start } };
    }
    case 'year': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { createdAt: { $gte: start } };
    }
    default: {
      // 'all' → last 12 calendar months
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
      return { createdAt: { $gte: start } };
    }
  }
}

function getGroupConfig(dateRange) {
  const now = new Date();

  if (dateRange === 'today') {
    const labels = Array.from({ length: 24 }, (_, h) => ({
      label: `${String(h).padStart(2, '0')}:00`,
      key: h,
    }));
    return { groupExpr: { $hour: '$createdAt' }, labels };
  }

  if (dateRange === 'week') {
    const labels = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      labels.push({ label, key });
    }
    return { groupExpr: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, labels };
  }

  if (dateRange === 'month') {
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const labels = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      key: i + 1,
    }));
    return { groupExpr: { $dayOfMonth: '$createdAt' }, labels };
  }

  if (dateRange === 'year') {
    const currentMonth = now.getUTCMonth();
    const labels = Array.from({ length: currentMonth + 1 }, (_, i) => ({
      label: MONTH_NAMES[i],
      key: i + 1,
    }));
    return { groupExpr: { $month: '$createdAt' }, labels };
  }

  // 'all' → last 12 calendar months
  const labels = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
    labels.push({ label, key });
  }
  return { groupExpr: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, labels };
}

function getPeriodKey(date, dateRange) {
  const d = new Date(date);
  if (dateRange === 'today') return d.getUTCHours();
  if (dateRange === 'week') return d.toISOString().slice(0, 10);
  if (dateRange === 'month') return d.getUTCDate();
  if (dateRange === 'year') return d.getUTCMonth() + 1;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildBaseFilter(requestingUser, dateRange) {
  const userFilter = requestingUser.role !== 'admin' ? { createdBy: new Types.ObjectId(requestingUser.id) } : {};
  return { ...userFilter, ...buildDateFilter(dateRange) };
}

// ── 1. Stats ──────────────────────────────────────────────────────────────────

const getStats = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);
  const pipelineFilter = {
    ...baseFilter,
    status: 'qualified',
    budget: { $ne: null },
  };

  const [total, qualified, proposalSent, won, pipelineLeads] = await Promise.all([
    Lead.countDocuments(baseFilter),
    Lead.countDocuments({ ...baseFilter, status: 'qualified' }),
    Lead.countDocuments({ ...baseFilter, status: 'proposal-sent' }),
    Lead.countDocuments({ ...baseFilter, status: 'won' }),
    Lead.find(pipelineFilter).select('budget').lean(),
  ]);

  const pipelineValue = pipelineLeads.reduce((s, l) => s + parseBudgetMidpoint(l.budget), 0);

  return {
    total,
    qualified,
    proposalSent,
    won,
    qualificationRate: total > 0 ? Math.round((qualified / total) * 1000) / 10 : 0,
    pipelineValue,
  };
};

// ── 2. Leads chart ────────────────────────────────────────────────────────────

const getLeadsChart = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);
  const groupConfig = getGroupConfig(dateRange);

  const rows = await Lead.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: groupConfig.groupExpr,
        received: { $sum: 1 },
        qualified: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const map = {};
  rows.forEach((r) => {
    map[String(r._id)] = r;
  });

  return groupConfig.labels.map(({ label, key }) => {
    const r = map[String(key)] || {};
    return { label, received: r.received || 0, qualified: r.qualified || 0 };
  });
};

// ── 3. Proposals chart ────────────────────────────────────────────────────────

const getProposalsChart = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);
  const groupConfig = getGroupConfig(dateRange);

  const rows = await Lead.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: groupConfig.groupExpr,
        sent: { $sum: { $cond: [{ $eq: ['$status', 'proposal-sent'] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const map = {};
  rows.forEach((r) => {
    map[String(r._id)] = r;
  });

  return groupConfig.labels.map(({ label, key }) => {
    const r = map[String(key)] || {};
    return { label, sent: r.sent || 0, closed: r.closed || 0 };
  });
};

// ── 4. Pipeline chart ─────────────────────────────────────────────────────────

const getPipelineChart = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);
  const groupConfig = getGroupConfig(dateRange);

  const leads = await Lead.find({
    ...baseFilter,
    status: { $in: ['qualified', 'engagement-started', 'proposal-sent', 'won'] },
    budget: { $ne: null },
  })
    .select('budget createdAt')
    .lean();

  const byPeriod = {};
  leads.forEach((lead) => {
    const key = String(getPeriodKey(lead.createdAt, dateRange));
    byPeriod[key] = (byPeriod[key] || 0) + parseBudgetMidpoint(lead.budget);
  });

  return groupConfig.labels.map(({ label, key }) => ({
    label,
    value: Math.round((byPeriod[String(key)] || 0) / 1000),
  }));
};

// ── 5. Source breakdown ───────────────────────────────────────────────────────

const getSourceBreakdown = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);

  const [rows, total] = await Promise.all([
    Lead.aggregate([{ $match: baseFilter }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Lead.countDocuments(baseFilter),
  ]);

  const map = {};
  rows.forEach((r) => {
    map[r._id] = r.count;
  });

  return ALL_SOURCES.map((source) => {
    const count = map[source] || 0;
    return {
      name: capitalize(source),
      count,
      value: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
};

// ── 6. Tech stacks ────────────────────────────────────────────────────────────

const getTechStacks = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);

  const rows = await Lead.aggregate([
    { $match: { ...baseFilter, isAnalyzed: true } },
    {
      $project: {
        allTech: {
          $concatArrays: [
            { $ifNull: ['$analysis.techStack.frontend', []] },
            { $ifNull: ['$analysis.techStack.backend', []] },
            { $ifNull: ['$analysis.techStack.database', []] },
          ],
        },
      },
    },
    { $unwind: '$allTech' },
    { $group: { _id: '$allTech', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  return rows.map(({ _id, count }) => ({
    name: normalizeTechName(_id),
    value: count,
  }));
};

// ── 7. Recent leads ───────────────────────────────────────────────────────────

const getRecentLeads = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);

  const leads = await Lead.find(baseFilter).sort({ createdAt: -1 }).limit(8).populate('createdBy', 'name').lean();

  return leads.map((lead) => ({
    id: lead._id,
    leadId: `LD-${lead.leadNumber}`,
    title: lead.title,
    source: capitalize(lead.source),
    budget: lead.budget || null,
    status: lead.status,
    createdAt: lead.createdAt,
  }));
};

// ── 8. Recent activity ────────────────────────────────────────────────────────

const getRecentActivity = async (requestingUser, { dateRange = 'year' } = {}) => {
  const baseFilter = buildBaseFilter(requestingUser, dateRange);

  const entries = await Lead.aggregate([
    { $match: baseFilter },
    { $unwind: '$auditLog' },
    {
      $project: {
        leadTitle: '$title',
        leadNumber: '$leadNumber',
        label: '$auditLog.label',
        actor: '$auditLog.actor',
        date: '$auditLog.date',
      },
    },
    { $sort: { date: -1 } },
    { $limit: 10 },
  ]);

  return entries.map((e) => ({
    leadTitle: e.leadTitle,
    leadId: `LD-${e.leadNumber}`,
    label: e.label,
    actor: e.actor,
    date: e.date,
  }));
};

// ── 9. Upcoming follow-ups ────────────────────────────────────────────────────

// Placeholder — follow-up model is Task 6 in the backlog.
const getUpcomingFollowups = async () => [];

// ─────────────────────────────────────────────────────────────────────────────

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
