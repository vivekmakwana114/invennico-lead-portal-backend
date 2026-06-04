const httpStatus = require('http-status');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { Lead } = require('../models');
const ApiError = require('../utils/ApiError');
const userService = require('./user.service');
const aiService = require('./ai.service');

const HANDOFF_NOTE =
  "After marking as 'Qualified', this lead will be handed off to the sales team in Zoho CRM for further pipeline management.";

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
    leadBody.analysis = mapped.analysis;
    leadBody.estimation = mapped.estimation;
    leadBody.budget = mapped.budget;
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

  return Lead.paginate(dbFilter, { ...options, sortBy: 'createdAt:desc' });
};

/**
 * Get a single lead by ID with ownership enforcement.
 */
const getLeadById = async (leadId, requestingUser) => {
  const lead = await Lead.findById(leadId).populate('createdBy', 'name email');
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
  if (updateBody.proposalDoc?.url && !['won', 'drop', 'proposal-sent'].includes(prevStatus)) {
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
  const buffer = fs.readFileSync(file.path);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return {
    fileName: file.filename,
    originalName: file.originalname,
    extractedText: result.text ? result.text.trim() : '',
  };
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
};
