const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const SECTION_KEYS = [
  'coverPage',
  'clientBusinessDetails',
  'aboutInvennico',
  'executiveSummary',
  'proposedSolution',
  'scopeOfWork',
  'deliverables',
  'technicalArchitecture',
  'whyChooseUs',
  'assumptions',
  'outOfScope',
  'milestones',
  'clientQuestions',
  'postLaunchSupport',
];

const pricingConfigSchema = new mongoose.Schema(
  {
    engineerRates: {
      intern: { type: Number, default: 15 },
      junior: { type: Number, default: 30 },
      midLevel: { type: Number, default: 50 },
      senior: { type: Number, default: 75 },
      architect: { type: Number, default: 100 },
    },
    complexityMultipliers: {
      low: { type: Number, default: 1.0 },
      medium: { type: Number, default: 1.3 },
      high: { type: Number, default: 1.6 },
    },
    timelineMultipliers: {
      rush: { type: Number, default: 1.4 },
      standard: { type: Number, default: 1.0 },
      extended: { type: Number, default: 0.9 },
    },
  },
  { _id: false }
);

const sectionConfigSchema = new mongoose.Schema(
  {
    key: { type: String, enum: SECTION_KEYS, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const companyBrandingSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Invennico TechnoLabs' },
    tagline: { type: String, default: null },
    address: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    website: { type: String, default: null },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'global' },
    companyBranding: { type: companyBrandingSchema, default: () => ({}) },
    proposalSections: {
      type: [sectionConfigSchema],
      default: () => [
        { key: 'coverPage', enabled: true, order: 1 },
        { key: 'clientBusinessDetails', enabled: true, order: 2 },
        { key: 'aboutInvennico', enabled: true, order: 3 },
        { key: 'executiveSummary', enabled: true, order: 4 },
        { key: 'proposedSolution', enabled: true, order: 5 },
        { key: 'scopeOfWork', enabled: true, order: 6 },
        { key: 'deliverables', enabled: true, order: 7 },
        { key: 'technicalArchitecture', enabled: true, order: 8 },
        { key: 'whyChooseUs', enabled: true, order: 9 },
        { key: 'assumptions', enabled: true, order: 10 },
        { key: 'outOfScope', enabled: true, order: 11 },
        { key: 'milestones', enabled: true, order: 12 },
        { key: 'clientQuestions', enabled: true, order: 13 },
        { key: 'postLaunchSupport', enabled: true, order: 14 },
      ],
    },
    googleDriveFolderId: { type: String, default: null },
    scopeDocumentContent: { type: String, default: null },
    pricingConfig: { type: pricingConfigSchema, default: () => ({}) },
    aiPrompt: { type: String, default: '' },
  },
  { timestamps: true }
);

settingsSchema.plugin(toJSON);

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
