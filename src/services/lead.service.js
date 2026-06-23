const path = require('path');
const httpStatus = require('http-status');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { Lead } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const userService = require('./user.service');
const aiService = require('./ai.service');
const geminiService = require('./gemini.service');
const proposalService = require('./proposal.service');
const settingsService = require('./settings.service');

const HANDOFF_NOTE =
  "After marking as 'Qualified', this lead will be handed off to the sales team in Zoho CRM for further pipeline management.";

// ── Pricing budget computation ────────────────────────────────────────────────

function parseTimelineMonths(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  // eslint-disable-next-line security/detect-unsafe-regex
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*month/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  // eslint-disable-next-line security/detect-unsafe-regex
  const plus = s.match(/(\d+(?:\.\d+)?)\+\s*month/);
  if (plus) return parseFloat(plus[1]) + 1;
  // eslint-disable-next-line security/detect-unsafe-regex
  const single = s.match(/(\d+(?:\.\d+)?)\s*month/);
  if (single) return parseFloat(single[1]);
  // eslint-disable-next-line security/detect-unsafe-regex
  const weeks = s.match(/(\d+(?:\.\d+)?)\s*week/);
  if (weeks) return parseFloat(weeks[1]) / 4;
  return null;
}

function parseBudgetRange(str) {
  if (!str) return null;
  const numbers = str.replace(/,/g, '').match(/\d+/g);
  if (!numbers || numbers.length < 2) return null;
  return { lo: parseInt(numbers[0], 10), hi: parseInt(numbers[1], 10) };
}

function scaleMilestoneCosts(milestones, aiTotalRange, pricingTotalRange) {
  const ai = parseBudgetRange(aiTotalRange);
  const pricing = parseBudgetRange(pricingTotalRange);
  if (!ai || !pricing || ai.lo === 0 || ai.hi === 0) return milestones;

  const loScale = pricing.lo / ai.lo;
  const hiScale = pricing.hi / ai.hi;

  // Adaptive rounding: avoid collapsing small milestone costs to $0
  const maxBudget = Math.max(pricing.lo, pricing.hi);
  let roundUnit = 100;
  if (maxBudget >= 100000) roundUnit = 1000;
  else if (maxBudget >= 10000) roundUnit = 500;

  return milestones.map((m) => {
    const cost = parseBudgetRange(m.costRange);
    if (!cost) return m;
    const rawLo = cost.lo * loScale;
    const rawHi = cost.hi * hiScale;
    const scaledLo = rawLo > 0 ? Math.max(roundUnit, Math.round(rawLo / roundUnit) * roundUnit) : 0;
    const scaledHi = rawHi > 0 ? Math.max(roundUnit, Math.round(rawHi / roundUnit) * roundUnit) : 0;
    return { ...m, costRange: `$${scaledLo.toLocaleString()} - $${scaledHi.toLocaleString()}` };
  });
}

function parseBudgetMidpoint(str) {
  if (!str) return null;
  const numbers = str.replace(/,/g, '').match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  if (numbers.length === 1) return parseInt(numbers[0], 10);
  return (parseInt(numbers[0], 10) + parseInt(numbers[1], 10)) / 2;
}

function scaleCostRange(costRange, ratio) {
  if (!costRange) return costRange;
  const numbers = costRange.replace(/,/g, '').match(/\d+/g);
  if (!numbers || numbers.length === 0) return costRange;
  const scaled = numbers.slice(0, 2).map((n) => {
    const original = parseInt(n, 10);
    const result = Math.round((original * ratio) / 100) * 100;
    return original > 0 ? Math.max(100, result) : 0;
  });
  return scaled.length === 1
    ? `$${scaled[0].toLocaleString()}`
    : `$${scaled[0].toLocaleString()} - $${scaled[1].toLocaleString()}`;
}

function scaleDuration(duration, ratio) {
  if (!duration) return duration;
  const s = duration.toLowerCase().trim();
  const unitMatch = s.match(/weeks?|months?/);
  const unit = unitMatch ? unitMatch[0] : 'weeks';

  // Existing range — scale both ends
  const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const lo = Math.max(1, Math.round(parseFloat(rangeMatch[1]) * ratio));
    const hi = Math.max(1, Math.round(parseFloat(rangeMatch[2]) * ratio));
    return lo === hi ? `${lo} ${unit}` : `${lo}-${hi} ${unit}`;
  }

  // Single value — scale and express as lo-hi range (floor/ceil of result)
  const singleMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const scaled = parseFloat(singleMatch[1]) * ratio;
    const lo = Math.max(1, Math.floor(scaled));
    const hi = Math.max(1, Math.ceil(scaled));
    return lo === hi ? `${lo} ${unit}` : `${lo}-${hi} ${unit}`;
  }

  return duration;
}

// Parses a milestone duration string to a {lo, hi} week range.
// "5 weeks" → {lo:5, hi:5}   "4-6 weeks" → {lo:4, hi:6}   "2 months" → {lo:8, hi:8}
function parseDurationRange(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*week/);
  if (range) return { lo: parseFloat(range[1]), hi: parseFloat(range[2]) };
  const single = s.match(/(\d+(?:\.\d+)?)\s*week/);
  if (single) return { lo: parseFloat(single[1]), hi: parseFloat(single[1]) };
  const mos = s.match(/(\d+(?:\.\d+)?)\s*month/);
  if (mos) {
    const w = parseFloat(mos[1]) * 4;
    return { lo: w, hi: w };
  }
  return null;
}

// Sums all milestone costs (lo/hi separately) and durations (lo/hi in weeks separately)
// to derive consistent budget range and timeline range.
function deriveTotalsFromMilestones(milestones) {
  let totalCostLo = 0;
  let totalCostHi = 0;
  let totalWeeksLo = 0;
  let totalWeeksHi = 0;

  milestones.forEach((m) => {
    const cost = parseBudgetRange(m.costRange);
    if (cost) {
      totalCostLo += cost.lo;
      totalCostHi += cost.hi;
    }
    const dur = parseDurationRange(m.duration);
    if (dur) {
      totalWeeksLo += dur.lo;
      totalWeeksHi += dur.hi;
    }
  });

  const budgetRange =
    totalCostLo > 0 && totalCostHi > 0 ? `$${totalCostLo.toLocaleString()} - $${totalCostHi.toLocaleString()}` : null;

  let timeline = null;
  if (totalWeeksLo > 0 || totalWeeksHi > 0) {
    const loMonths = Math.max(1, Math.floor(totalWeeksLo / 4));
    const hiMonths = Math.max(1, Math.ceil(totalWeeksHi / 4));
    timeline = loMonths === hiMonths ? `${loMonths} month${loMonths > 1 ? 's' : ''}` : `${loMonths}-${hiMonths} months`;
  }

  return { budgetRange, timeline };
}

function computePricingBudget(estimation, qualificationScore, pricingConfig) {
  if (!pricingConfig) return null;
  const { engineerRates, complexityMultipliers, timelineMultipliers } = pricingConfig;
  if (!engineerRates || !complexityMultipliers || !timelineMultipliers) return null;

  const months = parseTimelineMonths(estimation?.timeline);
  if (!months || months <= 0) return null;

  const score = qualificationScore ?? 50;
  let complexity;
  if (score <= 40) complexity = 'low';
  else if (score <= 70) complexity = 'medium';
  else complexity = 'high';

  let bucket;
  if (months < 2) bucket = 'rush';
  else if (months <= 6) bucket = 'standard';
  else bucket = 'extended';

  const rates = [
    engineerRates.intern ?? 15,
    engineerRates.junior ?? 30,
    engineerRates.midLevel ?? 50,
    engineerRates.senior ?? 75,
    engineerRates.architect ?? 100,
  ];
  const blendedRate = rates.reduce((s, r) => s + r, 0) / rates.length;

  const baseCost = months * 160 * blendedRate;
  const finalCost = baseCost * (complexityMultipliers[complexity] ?? 1.0) * (timelineMultipliers[bucket] ?? 1.0);

  const lo = Math.round((finalCost * 0.85) / 1000) * 1000;
  const hi = Math.round((finalCost * 1.15) / 1000) * 1000;
  return `$${lo.toLocaleString()} - $${hi.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────

const mapAiResponse = (aiData) => ({
  analysis: {
    summary: aiData.lead_summary || null,
    qualification: {
      score: aiData.qualification?.score ?? null,
      label: aiData.qualification?.label || null,
      description: aiData.qualification?.reasoning || null,
      nextAction: aiData.recommended_next_action || null,
      handoffNote: HANDOFF_NOTE,
    },
    techStack: {
      frontend: aiData.recommended_tech_stack?.frontend || [],
      backend: aiData.recommended_tech_stack?.backend || [],
      database: aiData.recommended_tech_stack?.database || [],
      integrations: aiData.recommended_tech_stack?.integrations || [],
      hosting: aiData.recommended_tech_stack?.hosting || [],
    },
    suggestedQuestions: aiData.suggested_questions || [],
  },
  estimation: {
    timeline: aiData.estimation?.timeline || null,
    budgetRange: aiData.estimation?.budget_range || null,
    milestones: (aiData.estimation?.breakdown || []).map((b) => ({
      phase: b.phase || 'Phase',
      duration: b.timeline || 'N/A',
      costRange: b.cost_range || 'N/A',
    })),
  },
  budget: aiData.estimation?.budget_range || null,
  timeline: aiData.estimation?.timeline || null,
});

/**
 * Create a lead. When isAnalyzed: true and no analysis is pre-supplied,
 * runs AI analysis server-side, maps the response, then saves and consumes 1 credit.
 */
function deriveLeadPrefix(user) {
  if (user.role === 'superAdmin') return 'S';
  if (user.role === 'partner') {
    const letters = user.name
      .trim()
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 3)
      .toUpperCase();
    return letters || 'P';
  }
  return '';
}

const createLead = async (userId, leadBody) => {
  const user = await userService.getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  const submittedAt = new Date();

  // eslint-disable-next-line no-param-reassign
  leadBody.leadPrefix = deriveLeadPrefix(user);

  if (user.role === 'partner') {
    // eslint-disable-next-line no-param-reassign
    leadBody.source = 'alliance';
  }

  if (leadBody.isAnalyzed && user.availableCredits < 1) {
    throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Insufficient credits. Contact your admin to top up.');
  }

  // Run AI analysis server-side when the caller hasn't pre-supplied it
  if (leadBody.isAnalyzed && !leadBody.analysis?.summary) {
    const leadInput = {
      title: leadBody.title,
      details: leadBody.details,
      source: leadBody.source,
      notes: leadBody.notes,
      clientContact: leadBody.clientContact || null,
      attachments: Array.isArray(leadBody.attachments) ? leadBody.attachments.join(', ') : null,
      pdfContent: leadBody.pdfContent || null,
    };

    // Fire Claude and Gemini in parallel; Gemini failure must not block lead creation
    const [claudeResult, geminiResult] = await Promise.allSettled([
      aiService.analyzeLead(leadInput),
      geminiService.researchLead(leadInput),
    ]);

    if (claudeResult.status === 'rejected') {
      throw claudeResult.reason;
    }

    const mapped = mapAiResponse(claudeResult.value);
    const aiBudgetRange = mapped.estimation.budgetRange;

    const settings = await settingsService.getSettings();
    const pricingBudget = computePricingBudget(
      mapped.estimation,
      mapped.analysis.qualification.score,
      settings.pricingConfig
    );

    const scaledMilestones =
      pricingBudget && aiBudgetRange
        ? scaleMilestoneCosts(mapped.estimation.milestones, aiBudgetRange, pricingBudget)
        : mapped.estimation.milestones;

    // eslint-disable-next-line no-param-reassign
    leadBody.analysis = mapped.analysis;
    // eslint-disable-next-line no-param-reassign
    leadBody.estimation = {
      ...mapped.estimation,
      milestones: scaledMilestones,
      aiBudgetRange,
      budgetRange: pricingBudget || aiBudgetRange,
    };
    // eslint-disable-next-line no-param-reassign
    leadBody.budget = pricingBudget || mapped.budget;
    // eslint-disable-next-line no-param-reassign
    leadBody.timeline = mapped.timeline;

    if (geminiResult.status === 'fulfilled') {
      // eslint-disable-next-line no-param-reassign
      leadBody.leadResearch = { ...geminiResult.value, generatedAt: new Date() };
    } else {
      logger.warn('[Gemini Research] Failed for lead "%s": %s', leadBody.title, geminiResult.reason?.message);
    }
  }

  if (leadBody.pdfFileName) {
    // eslint-disable-next-line no-param-reassign
    leadBody.pdfFile = { fileName: leadBody.pdfFileName, originalName: leadBody.pdfOriginalName || leadBody.pdfFileName };
  }

  const auditLog = [
    { label: 'Lead submitted to portal', actor: 'System', date: submittedAt },
    { label: `Lead assigned to ${user.name}`, actor: user.name, date: new Date(submittedAt.getTime() + 1000) },
  ];
  if (leadBody.isAnalyzed) {
    auditLog.push({ label: 'AI analysis completed', actor: 'AI Engine', date: new Date() });
  }

  const lead = await Lead.create({
    ...leadBody,
    createdBy: userId,
    auditLog,
  });

  if (lead.isAnalyzed) {
    const { transaction } = await userService.consumeCredit(userId, lead.id);
    // Use updateOne to avoid triggering pre-save hook a second time
    await Lead.updateOne({ _id: lead.id }, { $set: { creditTransactionId: transaction.id } });
    lead.creditTransactionId = transaction.id;
  }

  return lead;
};

/**
 * Query leads with pagination.
 * Admins see all leads; partners only see their own.
 */
const queryLeads = async (filter, options, requestingUser) => {
  const dbFilter = {};

  if (!['admin', 'superAdmin'].includes(requestingUser.role)) {
    dbFilter.createdBy = requestingUser.id;
  } else if (filter.createdBy) {
    dbFilter.createdBy = filter.createdBy;
  }

  if (filter.status) dbFilter.status = filter.status;
  if (filter.source) dbFilter.source = filter.source;

  if (filter.dateRange && Number(filter.dateRange) !== 0) {
    const days = Number(filter.dateRange);
    dbFilter.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }

  if (filter.search && filter.search.trim()) {
    const escaped = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp(escaped, 'i');
    dbFilter.$or = [{ title: regex }, { clientContact: regex }];
  }

  const result = await Lead.paginate(dbFilter, { ...options, sortBy: 'createdAt:desc' });
  await Lead.populate(result.results, { path: 'createdBy', select: 'name' });
  return result;
};

/**
 * Get a single lead by ID with ownership enforcement.
 */
const getLeadById = async (leadId, requestingUser) => {
  let lead;
  if (/^LD(-[A-Za-z]+)?-\d+$/i.test(leadId)) {
    // Handles: LD-1 (admin), LD-S-1 (superAdmin), LD-VIV-1 (partner)
    const parts = leadId.toUpperCase().split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    const prefix = parts.length > 2 ? parts.slice(1, -1).join('') : '';
    lead = await Lead.findOne({ leadPrefix: prefix, leadNumber: num }).populate('createdBy', 'name email');
  } else {
    lead = await Lead.findById(leadId).populate('createdBy', 'name email');
  }
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');

  const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();
  if (!['admin', 'superAdmin'].includes(requestingUser.role) && createdById !== requestingUser.id) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this lead');
  }

  return lead;
};

/**
 * Update a lead by ID. Appends an audit log entry when status changes.
 */
const updateLeadById = async (leadId, updateBody, requestingUser) => {
  const lead = await getLeadById(leadId, requestingUser);

  const prevStatus = lead.status;
  const prevIsAnalyzed = lead.isAnalyzed;

  const milestonesInPayload = Array.isArray(updateBody.estimation?.milestones);
  const budgetChanged =
    updateBody.estimation?.budgetRange !== undefined && updateBody.estimation.budgetRange !== lead.estimation?.budgetRange;
  const timelineChanged =
    updateBody.estimation?.timeline !== undefined && updateBody.estimation.timeline !== lead.estimation?.timeline;

  // Detect whether the milestones in the payload actually differ from what is stored.
  // The frontend often sends the full estimation object even when only budget/timeline changed,
  // so we need this check to avoid treating unchanged milestones as an explicit edit.
  const storedMilestones = (lead.estimation?.milestones || []).map((m) => (m.toObject ? m.toObject() : { ...m }));
  const incomingMilestones = milestonesInPayload ? updateBody.estimation.milestones : [];
  const milestonesActuallyChanged =
    milestonesInPayload &&
    (incomingMilestones.length !== storedMilestones.length ||
      incomingMilestones.some((m, i) => {
        const s = storedMilestones[i] || {};
        return m.costRange !== s.costRange || m.duration !== s.duration || m.phase !== s.phase;
      }));

  if ((budgetChanged || timelineChanged) && !milestonesActuallyChanged) {
    // Budget or timeline changed — scale the stored milestones proportionally
    let scaled = storedMilestones;

    if (budgetChanged) {
      const origMid = parseBudgetMidpoint(lead.estimation?.budgetRange);
      const newMid = parseBudgetMidpoint(updateBody.estimation.budgetRange);
      if (origMid && newMid && origMid !== newMid) {
        const ratio = newMid / origMid;
        scaled = scaled.map((m) => ({ ...m, costRange: scaleCostRange(m.costRange, ratio) }));
      }
    }

    if (timelineChanged) {
      const origMonths = parseTimelineMonths(lead.estimation?.timeline);
      const newMonths = parseTimelineMonths(updateBody.estimation.timeline);
      if (origMonths && newMonths && origMonths !== newMonths) {
        const ratio = newMonths / origMonths;
        scaled = scaled.map((m) => ({ ...m, duration: scaleDuration(m.duration, ratio) }));
      }
    }

    // Re-derive totals from the scaled milestones, but only for the field that
    // actually changed — avoids silently overwriting the untouched field.
    const totals = deriveTotalsFromMilestones(scaled);
    // eslint-disable-next-line no-param-reassign
    updateBody.estimation = {
      ...updateBody.estimation,
      milestones: scaled,
      ...(budgetChanged && totals.budgetRange && { budgetRange: totals.budgetRange }),
      ...(timelineChanged && totals.timeline && { timeline: totals.timeline }),
    };
  }

  if (milestonesActuallyChanged && incomingMilestones.length > 0) {
    // Milestones directly edited — derive totals by summing lo/hi costs and durations
    const totals = deriveTotalsFromMilestones(incomingMilestones);
    // eslint-disable-next-line no-param-reassign
    updateBody.estimation = {
      ...updateBody.estimation,
      ...(totals.budgetRange && { budgetRange: totals.budgetRange }),
      ...(totals.timeline && { timeline: totals.timeline }),
    };
  }

  // Always keep top-level quick-access fields in sync with estimation
  if (updateBody.estimation?.budgetRange !== undefined) {
    // eslint-disable-next-line no-param-reassign
    updateBody.budget = updateBody.estimation.budgetRange;
  }
  if (updateBody.estimation?.timeline !== undefined) {
    // eslint-disable-next-line no-param-reassign
    updateBody.timeline = updateBody.estimation.timeline;
  }

  Object.assign(lead, updateBody);

  // Auto-transition status based on actions (only upgrade, never downgrade)
  if (updateBody.whatsappDraftCount === 1 && prevStatus === 'new') {
    lead.status = 'engagement-started';
  }
  if (updateBody.proposalDoc?.filePath && !['won', 'drop', 'proposal-sent'].includes(prevStatus)) {
    lead.status = 'proposal-sent';
  }

  if (lead.status !== prevStatus) {
    lead.auditLog.push({
      label: `Status changed to ${lead.status}`,
      actor: requestingUser.name || 'User',
    });
  }

  if (updateBody.isAnalyzed && !prevIsAnalyzed) {
    lead.auditLog.push({ label: 'AI analysis saved', actor: 'AI Engine' });
  }

  await lead.save();
  await lead.populate('createdBy', 'name email');
  return lead;
};

/**
 * Delete a lead by ID with ownership enforcement.
 */
const deleteLeadById = async (leadId, requestingUser) => {
  const lead = await getLeadById(leadId, requestingUser);
  await lead.deleteOne();
  return lead;
};

/**
 * Return pipeline counts for the stat cards.
 * Admins see all leads; partners see only their own.
 */
const getLeadStats = async (requestingUser) => {
  const filter = {};
  if (!['admin', 'superAdmin'].includes(requestingUser.role)) {
    filter.createdBy = requestingUser.id;
  }

  const [total, qualified, proposalSent, won] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.countDocuments({ ...filter, status: 'qualified' }),
    Lead.countDocuments({ ...filter, status: 'proposal-sent' }),
    Lead.countDocuments({ ...filter, status: 'won' }),
  ]);

  return { total, qualified, proposalSent, won };
};

/**
 * Run AI analysis on lead input. Returns mapped camelCase data — does NOT persist anything.
 */
const analyzeLead = async (body) => {
  const aiData = await aiService.analyzeLead(body);
  return mapAiResponse(aiData);
};

/**
 * Generate a WhatsApp reply draft via AI.
 * If leadId is provided, persists the draft and increments whatsappDraftCount on the lead.
 */
const generateWhatsapp = async (body, requestingUser) => {
  const { leadId, ...aiInput } = body;
  const aiResult = await aiService.generateWhatsapp(aiInput);

  if (leadId && requestingUser) {
    const lead = await getLeadById(leadId, requestingUser);
    if (lead.whatsappDraftCount < 2) {
      const newCount = lead.whatsappDraftCount + 1;
      lead.whatsappDraft = aiResult.message;
      lead.whatsappDraftCount = newCount;
      lead.auditLog.push({ label: 'WhatsApp draft generated', actor: requestingUser.name || 'User' });

      if (newCount === 1 && lead.status === 'new') {
        lead.status = 'engagement-started';
        lead.auditLog.push({
          label: 'Status changed to engagement-started',
          actor: requestingUser.name || 'User',
        });
      }

      await lead.save();
    }
  }

  return aiResult;
};

/**
 * Read an uploaded PDF file, extract its text content, and return it.
 */
const uploadAndExtractPdf = async (file) => {
  if (!file) throw new ApiError(httpStatus.BAD_REQUEST, 'No PDF file uploaded');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const buffer = fs.readFileSync(file.path);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return {
    fileName: file.filename,
    originalName: file.originalname,
    extractedText: result.text ? result.text.trim() : '',
  };
};

/**
 * Generate a proposal .docx for a lead, save it to disk, and store the path.
 * One-time only — throws 400 if already generated.
 */
const generateProposal = async (leadId, requestingUser, { preparedFor, preparedBy, scopeDoc } = {}) => {
  const lead = await getLeadById(leadId, requestingUser);

  if (!lead.isAnalyzed) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Lead must be analyzed before generating a proposal');
  }

  if (lead.proposalDoc?.generatedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Proposal has already been generated for this lead');
  }

  const settings = await settingsService.getSettings();
  const companyInfo = settings.companyBranding || {};
  const scopeDocumentContent = settings.scopeDocumentContent || null;

  const enabledSections = (settings.proposalSections || []).filter((s) => s.enabled).sort((a, b) => a.order - b.order);
  const enabledSectionKeys = enabledSections.map((s) => s.key);

  const aiContent = await aiService.generateProposalContent({
    lead,
    companyInfo,
    preparedFor,
    preparedBy,
    scopeDocumentContent,
    scopeDoc,
    enabledSectionKeys,
  });

  let logoBuffer = null;
  let logoMimeType = null;
  if (requestingUser.logoPath) {
    const logoFsPath = path.join(__dirname, '../../', requestingUser.logoPath.replace(/^\//, ''));
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(logoFsPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      logoBuffer = fs.readFileSync(logoFsPath);
      logoMimeType = path.extname(logoFsPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    }
  }

  const docxBuffer = await proposalService.buildProposalDocx({
    lead,
    aiContent,
    companyInfo,
    preparedFor,
    preparedBy,
    enabledSections,
    templatePath: settings.proposalTemplatePath || null,
    logoBuffer,
    logoMimeType,
  });

  // Save .docx to disk in leadproposal/ at repo root
  const outputDir = path.join(__dirname, '../../leadproposal');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const fileName = `Proposal-LD${lead.leadNumber}-${Date.now()}.docx`;
  const filePath = path.join(outputDir, fileName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(filePath, docxBuffer);

  const updatedLead = await updateLeadById(
    leadId,
    { proposalDoc: { filePath, fileName, content: aiContent, generatedAt: new Date() } },
    requestingUser
  );

  await Lead.updateOne(
    { _id: lead.id },
    { $push: { auditLog: { label: 'Proposal generated', actor: requestingUser.name || 'User', date: new Date() } } }
  );

  return { fileName, lead: updatedLead };
};

/**
 * Stream the saved .docx file for a lead as a download.
 */
const downloadProposal = async (leadId, requestingUser) => {
  const lead = await getLeadById(leadId, requestingUser);

  if (!lead.proposalDoc?.filePath) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No proposal has been generated for this lead yet');
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(lead.proposalDoc.filePath)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Proposal file not found on server');
  }

  return { filePath: lead.proposalDoc.filePath, fileName: lead.proposalDoc.fileName };
};

/**
 * Return the file path for a lead's uploaded PDF so it can be streamed inline.
 */
const getLeadPdf = async (leadId, requestingUser) => {
  const lead = await getLeadById(leadId, requestingUser);

  if (!lead.pdfFile?.fileName) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No PDF attachment found for this lead');
  }

  const filePath = path.join(__dirname, '../../projectpdf', lead.pdfFile.fileName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(filePath)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'PDF file not found on server');
  }

  return { filePath, originalName: lead.pdfFile.originalName };
};

module.exports = {
  createLead,
  queryLeads,
  getLeadById,
  updateLeadById,
  deleteLeadById,
  getLeadStats,
  analyzeLead,
  generateWhatsapp,
  uploadAndExtractPdf,
  generateProposal,
  downloadProposal,
  getLeadPdf,
};
