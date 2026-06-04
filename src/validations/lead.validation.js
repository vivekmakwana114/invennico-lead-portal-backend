const Joi = require('joi');
const { objectId } = require('./custom.validation');

const STATUSES = ['new', 'qualified', 'engagement-started', 'proposal-sent', 'won', 'drop'];
const SOURCES = ['alliance', 'direct', 'referral', 'upwork', 'freelancer', 'other'];
const TAGS = ['crm-synced', 'crm-pending', 'proposal-synced'];

const qualificationSchema = Joi.object({
  score: Joi.number().min(0).max(100).allow(null),
  label: Joi.string().allow('', null),
  description: Joi.string().allow('', null),
  nextAction: Joi.string().allow('', null),
  handoffNote: Joi.string().allow('', null),
});

const techStackSchema = Joi.object({
  frontend: Joi.array().items(Joi.string()),
  backend: Joi.array().items(Joi.string()),
  database: Joi.array().items(Joi.string()),
  integrations: Joi.array().items(Joi.string()),
  hosting: Joi.array().items(Joi.string()),
});

const analysisSchema = Joi.object({
  summary: Joi.string().allow('', null),
  qualification: qualificationSchema,
  techStack: techStackSchema,
  suggestedQuestions: Joi.array().items(Joi.string()),
});

const estimationSchema = Joi.object({
  timeline: Joi.string().allow('', null),
  budgetRange: Joi.string().allow('', null),
  milestones: Joi.array().items(
    Joi.object({
      phase: Joi.string().allow('', null),
      duration: Joi.string().allow('', null),
      costRange: Joi.string().allow('', null),
    })
  ),
});

const createLead = {
  body: Joi.object().keys({
    title: Joi.string().required().trim(),
    details: Joi.string().required(),
    source: Joi.string().valid(...SOURCES).required(),
    notes: Joi.string().allow('', null),
    attachments: Joi.array().items(Joi.string()).default([]),
    clientContact: Joi.string().allow('', null),
    isAnalyzed: Joi.boolean().default(false),
    analysis: analysisSchema,
    estimation: estimationSchema,
    budget: Joi.string().allow('', null),
    timeline: Joi.string().allow('', null),
    whatsappDraft: Joi.string().allow('', null),
    pdfContent: Joi.string().allow('', null),
  }),
};

const getLeads = {
  query: Joi.object().keys({
    status: Joi.string().valid(...STATUSES),
    source: Joi.string().valid(...SOURCES),
    createdBy: Joi.string().custom(objectId),
    dateRange: Joi.number().valid(7, 30, 90, 180, 0),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLead = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
};

const updateLead = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().trim(),
      details: Joi.string(),
      source: Joi.string().valid(...SOURCES),
      notes: Joi.string().allow('', null),
      attachments: Joi.array().items(Joi.string()),
      clientContact: Joi.string().allow('', null),
      status: Joi.string().valid(...STATUSES),
      tags: Joi.array().items(Joi.string().valid(...TAGS)),
      isAnalyzed: Joi.boolean(),
      analysis: analysisSchema,
      estimation: estimationSchema,
      budget: Joi.string().allow('', null),
      timeline: Joi.string().allow('', null),
      whatsappDraft: Joi.string().allow('', null),
      whatsappDraftCount: Joi.number().integer().min(0).max(2),
      proposalDoc: Joi.object({
        url: Joi.string().allow('', null),
        generatedAt: Joi.date().allow(null),
      }),
      zoho: Joi.object({
        status: Joi.string().allow('', null),
        crmId: Joi.string().allow('', null),
        lastSynced: Joi.date().allow(null),
      }),
    })
    .min(1),
};

const deleteLead = {
  params: Joi.object().keys({
    leadId: Joi.string().custom(objectId).required(),
  }),
};

const analyzeLead = {
  body: Joi.object().keys({
    title: Joi.string().required(),
    details: Joi.string().required(),
    source: Joi.string().valid(...SOURCES).required(),
    notes: Joi.string().allow('', null),
    attachments: Joi.string().allow('', null),
  }),
};

const generateWhatsapp = {
  body: Joi.object().keys({
    leadId: Joi.string().custom(objectId),
    leadSummary: Joi.string().required(),
    techStack: Joi.string().allow('', null),
    timeline: Joi.string().allow('', null),
    budget: Joi.string().allow('', null),
    originalLead: Joi.string().allow('', null),
  }),
};

module.exports = {
  createLead,
  getLeads,
  getLead,
  updateLead,
  deleteLead,
  analyzeLead,
  generateWhatsapp,
};
