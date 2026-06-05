const Joi = require('joi');

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

const updateSettings = {
  body: Joi.object()
    .keys({
      companyBranding: Joi.object({
        name: Joi.string().allow('', null),
        tagline: Joi.string().allow('', null),
        address: Joi.string().allow('', null),
        email: Joi.string().email().allow('', null),
        phone: Joi.string().allow('', null),
        website: Joi.string().uri().allow('', null),
      }),
      proposalSections: Joi.array()
        .items(
          Joi.object({
            key: Joi.string()
              .valid(...SECTION_KEYS)
              .required(),
            enabled: Joi.boolean().required(),
            order: Joi.number().integer().min(1).required(),
          })
        )
        .min(1),
      googleDriveFolderId: Joi.string().allow('', null),
      scopeDocumentContent: Joi.string().allow('', null),
      pricingConfig: Joi.object({
        engineerRates: Joi.object({
          intern: Joi.number().min(0),
          junior: Joi.number().min(0),
          midLevel: Joi.number().min(0),
          senior: Joi.number().min(0),
          architect: Joi.number().min(0),
        }),
        complexityMultipliers: Joi.object({
          low: Joi.number().min(0),
          medium: Joi.number().min(0),
          high: Joi.number().min(0),
        }),
        timelineMultipliers: Joi.object({
          rush: Joi.number().min(0),
          standard: Joi.number().min(0),
          extended: Joi.number().min(0),
        }),
      }),
    })
    .min(1),
};

module.exports = { updateSettings };
