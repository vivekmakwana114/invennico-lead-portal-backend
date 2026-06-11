const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

// ── Default template path ──────────────────────────────────────────────────────
// Upload a custom template via POST /v1/settings/proposal/template to override.
const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '../../templates/proposal-template.docx');

// ── Helper: build the flat data object for docxtemplater ──────────────────────
const buildTemplateData = (aiContent, companyInfo, lead, preparedFor, preparedBy, enabledSectionKeys) => {
  const c = aiContent || {};
  const enabledSet = new Set(enabledSectionKeys || []);
  const arr = (a) => (Array.isArray(a) ? a : []);
  const str = (s) => (Array.isArray(s) ? s.join(', ') : s || '');

  return {
    // Meta / cover
    company_name: companyInfo.name || 'Invennico TechnoLabs',
    company_tagline: companyInfo.tagline || '',
    company_website: companyInfo.website || '',
    company_email: companyInfo.email || '',
    company_phone: companyInfo.phone || '',
    prepared_for: preparedFor || '',
    prepared_by: preparedBy || '',
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    lead_title: lead.title || '',

    // Section visibility flags — controlled by Settings proposalSections[].enabled
    show_clientBusinessDetails: enabledSet.has('clientBusinessDetails'),
    show_aboutInvennico: enabledSet.has('aboutInvennico'),
    show_executiveSummary: enabledSet.has('executiveSummary'),
    show_proposedSolution: enabledSet.has('proposedSolution'),
    show_scopeOfWork: enabledSet.has('scopeOfWork'),
    show_deliverables: enabledSet.has('deliverables'),
    show_technicalArchitecture: enabledSet.has('technicalArchitecture'),
    show_whyChooseUs: enabledSet.has('whyChooseUs'),
    show_assumptions: enabledSet.has('assumptions'),
    show_outOfScope: enabledSet.has('outOfScope'),
    show_milestones: enabledSet.has('milestones'),
    show_clientQuestions: enabledSet.has('clientQuestions'),
    show_postLaunchSupport: enabledSet.has('postLaunchSupport'),

    // Client business details
    client_overview: c.clientBusinessDetails?.businessOverview || '',
    client_what: c.clientBusinessDetails?.whatClientDoes || '',
    client_industry: c.clientBusinessDetails?.industryContext || '',
    client_objectives: c.clientBusinessDetails?.businessObjectives || '',

    // About company
    about_invennico: c.aboutInvennico || '',

    // Executive summary
    exec_vision: c.executiveSummary?.visionUnderstanding || '',
    exec_solution: c.executiveSummary?.proposedSolution || '',
    exec_outcomes: str(c.executiveSummary?.keyOutcomes),
    exec_why: c.executiveSummary?.whyThisApproach || '',

    // Proposed solution
    proposed_solution: c.proposedSolution?.overview || '',
    solution_components: arr(c.proposedSolution?.components).map((component) => ({ component })),

    // Scope of work
    scope_items: arr(c.scopeOfWork).map((s) => ({
      scope_num: s.number || '',
      scope_name: s.name || '',
      scope_details: s.details || '',
    })),

    // Deliverables
    deliverables: arr(c.deliverables).map((item) => ({ item })),

    // Technical architecture
    tech_frontend: str(c.technicalArchitecture?.frontend),
    tech_backend: str(c.technicalArchitecture?.backend),
    tech_database: str(c.technicalArchitecture?.database),
    tech_hosting: str(c.technicalArchitecture?.hosting),
    tech_integrations: str(c.technicalArchitecture?.integrations),
    tech_security: c.technicalArchitecture?.security || '',

    // Why choose us
    why_choose_us: arr(c.whyChooseUs).map((item) => ({ item })),

    // Assumptions / out of scope
    assumptions: arr(c.assumptions).map((item) => ({ item })),
    out_of_scope: arr(c.outOfScope).map((item) => ({ item })),

    // Milestones
    milestones: arr(c.milestones).map((m) => ({
      phase: m.phase || '',
      milestone: m.milestone || '',
      activities: m.activities || '',
      duration: m.duration || '',
    })),

    // Client questions
    client_questions: arr(c.clientQuestions).map((item) => ({ item })),

    // Post-launch support
    post_launch_warranty: c.postLaunchSupport?.warrantyPeriod || '',
    included_support: arr(c.postLaunchSupport?.includedSupport).map((item) => ({ item })),
    optional_retainer: arr(c.postLaunchSupport?.optionalRetainer).map((item) => ({ item })),
  };
};

const buildProposalDocxLegacy = async () => {
  throw new Error('No proposal template configured. Upload a template in the setting -> proposal template tab');
};

// ── Template-based DOCX builder ───────────────────────────────────────────────
/**
 * Builds a .docx buffer by filling a Word template with AI-generated content.
 *
 * Template placeholders: see templates/proposal-template.docx and scripts/generate-default-template.js
 * Upload a custom template via POST /v1/settings/proposal/template
 *
 * Falls back to the legacy programmatic builder if no template is configured
 * or the template file is not found on disk.
 *
 * enabledSections: array of { key, enabled, order } from Settings.
 *   In template mode — enabled flag drives show_* boolean flags in the template.
 *   Section ORDER is determined by the template file's physical layout.
 *   In legacy mode — both enabled and order are fully respected (existing behavior).
 */
const buildProposalDocx = async ({
  lead,
  aiContent,
  companyInfo,
  preparedFor,
  preparedBy,
  enabledSections,
  templatePath,
}) => {
  const tplPath = templatePath || DEFAULT_TEMPLATE_PATH;
  const enabledSectionKeys = (enabledSections || []).filter((s) => s.enabled).map((s) => s.key);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (tplPath && fs.existsSync(tplPath)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const content = fs.readFileSync(tplPath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(buildTemplateData(aiContent, companyInfo, lead, preparedFor, preparedBy, enabledSectionKeys));
    return doc.getZip().generate({ type: 'nodebuffer' });
  }

  return buildProposalDocxLegacy({ lead, aiContent, companyInfo, preparedFor, preparedBy, enabledSections });
};

module.exports = { buildProposalDocx };
