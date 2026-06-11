const path = require('path');
const httpStatus = require('http-status');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { Lead } = require('../models');
const ApiError = require('../utils/ApiError');
const userService = require('./user.service');
const aiService = require('./ai.service');
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
const createLead = async (userId, leadBody) => {
  const user = await userService.getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  if (leadBody.isAnalyzed && user.availableCredits < 1) {
    throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Insufficient credits. Contact your admin to top up.');
  }

  // Run AI analysis server-side when the caller hasn't pre-supplied it
  if (leadBody.isAnalyzed && !leadBody.analysis?.summary) {
    const aiData = await aiService.analyzeLead({
      title: leadBody.title,
      details: leadBody.details,
      source: leadBody.source,
      notes: leadBody.notes,
      attachments: Array.isArray(leadBody.attachments) ? leadBody.attachments.join(', ') : null,
      pdfContent: leadBody.pdfContent || null,
    });

    const mapped = mapAiResponse(aiData);
    const aiBudgetRange = mapped.estimation.budgetRange;

    const settings = await settingsService.getSettings();
    const pricingBudget = computePricingBudget(
      mapped.estimation,
      mapped.analysis.qualification.score,
      settings.pricingConfig
    );

    // eslint-disable-next-line no-param-reassign
    leadBody.analysis = mapped.analysis;
    // eslint-disable-next-line no-param-reassign
    leadBody.estimation = {
      ...mapped.estimation,
      aiBudgetRange,
      budgetRange: pricingBudget || aiBudgetRange,
    };
    // eslint-disable-next-line no-param-reassign
    leadBody.budget = pricingBudget || mapped.budget;
    // eslint-disable-next-line no-param-reassign
    leadBody.timeline = mapped.timeline;
  }

  const auditLog = [
    { label: 'Lead submitted to portal', actor: 'System' },
    { label: `Lead assigned to ${user.name}`, actor: user.name },
  ];
  if (leadBody.isAnalyzed) {
    auditLog.push({ label: 'AI analysis completed', actor: 'AI Engine' });
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

  if (requestingUser.role !== 'admin') {
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

  return Lead.paginate(dbFilter, { ...options, sortBy: 'createdAt:desc' });
};

/**
 * Get a single lead by ID with ownership enforcement.
 */
const getLeadById = async (leadId, requestingUser) => {
  let lead;
  if (/^LD-\d+$/i.test(leadId)) {
    const num = parseInt(leadId.split('-')[1], 10);
    lead = await Lead.findOne({ leadNumber: num }).populate('createdBy', 'name email');
  } else {
    lead = await Lead.findById(leadId).populate('createdBy', 'name email');
  }
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');

  const createdById = lead.createdBy?._id?.toString() || lead.createdBy?.toString();
  if (requestingUser.role !== 'admin' && createdById !== requestingUser.id) {
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
  if (requestingUser.role !== 'admin') {
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
};
