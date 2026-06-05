const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const auditEntrySchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    actor: { type: String, required: true },
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

const milestoneSchema = new mongoose.Schema(
  {
    phase: { type: String },
    duration: { type: String },
    costRange: { type: String },
  },
  { _id: false }
);

const leadSchema = mongoose.Schema(
  {
    leadNumber: {
      type: Number,
      unique: true,
    },

    createdBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    details: {
      type: String,
      required: true,
    },

    source: {
      type: String,
      enum: ['alliance', 'direct', 'referral', 'upwork', 'freelancer', 'other'],
      required: true,
    },

    notes: {
      type: String,
      default: null,
    },

    attachments: {
      type: [String],
      default: [],
    },

    clientContact: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ['new', 'qualified', 'engagement-started', 'proposal-sent', 'won', 'drop'],
      default: 'new',
    },

    tags: {
      type: [String],
      enum: ['crm-synced', 'crm-pending', 'proposal-synced'],
      default: [],
    },

    // Quick-access fields for grid display (mirrors estimation sub-fields)
    budget: {
      type: String,
      default: null,
    },

    timeline: {
      type: String,
      default: null,
    },

    isAnalyzed: {
      type: Boolean,
      default: false,
    },

    analysis: {
      summary: { type: String, default: null },
      qualification: {
        score: { type: Number, min: 0, max: 100, default: null },
        label: { type: String, default: null },
        description: { type: String, default: null },
        nextAction: { type: String, default: null },
        handoffNote: { type: String, default: null },
      },
      techStack: {
        frontend: { type: [String], default: [] },
        backend: { type: [String], default: [] },
        database: { type: [String], default: [] },
        integrations: { type: [String], default: [] },
        hosting: { type: [String], default: [] },
      },
      suggestedQuestions: {
        type: [String],
        default: [],
      },
    },

    estimation: {
      timeline: { type: String, default: null },
      budgetRange: { type: String, default: null },
      aiBudgetRange: { type: String, default: null },
      milestones: { type: [milestoneSchema], default: [] },
    },

    whatsappDraft: {
      type: String,
      default: null,
    },

    whatsappDraftCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 2,
    },

    proposalDoc: {
      url: { type: String, default: null },
      filePath: { type: String, default: null },
      fileName: { type: String, default: null },
      content: { type: mongoose.Schema.Types.Mixed, default: null },
      generatedAt: { type: Date, default: null },
    },

    zoho: {
      status: { type: String, default: null },
      crmId: { type: String, default: null },
      lastSynced: { type: Date, default: null },
    },

    auditLog: {
      type: [auditEntrySchema],
      default: [],
    },

    creditTransactionId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'CreditTransaction',
      default: null,
    },
  },
  { timestamps: true }
);

leadSchema.index({ createdBy: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ createdAt: -1 });

leadSchema.options.toJSON = {
  transform(doc, ret) {
    if (ret.leadNumber != null) {
      // eslint-disable-next-line no-param-reassign
      ret.leadId = `LD-${ret.leadNumber}`;
    }
    // toJSON plugin strips createdAt globally; restore it for leads since the UI needs it
    // eslint-disable-next-line no-param-reassign
    ret.createdAt = doc.createdAt;
  },
};

leadSchema.plugin(toJSON);
leadSchema.plugin(paginate);

leadSchema.pre('save', async function () {
  if (this.isNew) {
    const Counter = mongoose.model('Counter');
    const counter = await Counter.findOneAndUpdate({ model: 'lead' }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    this.leadNumber = counter.seq;
  }
});

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
