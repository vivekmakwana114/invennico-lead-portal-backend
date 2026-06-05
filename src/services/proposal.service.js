const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} = require('docx');

// ── Palette ────────────────────────────────────────────────────
const DARK_BLUE = '003366';
const MID_BLUE = '0066CC';
const GREY = '888888';

// ── Border used in all tables ──────────────────────────────────
const TABLE_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
};

// ── Low-level helpers ──────────────────────────────────────────
const spacer = () => new Paragraph({ text: '', spacing: { after: 200 } });

const centered = (text, runOpts = {}, spacingAfter = 120) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: spacingAfter },
    children: [new TextRun({ text: text || '', ...runOpts })],
  });

const para = (text) =>
  new Paragraph({
    children: [new TextRun({ text: text || '', size: 22 })],
    spacing: { after: 160 },
  });

const bullet = (text) =>
  new Paragraph({
    children: [new TextRun({ text: `•  ${text || ''}`, size: 22 })],
    indent: { left: 360 },
    spacing: { after: 80 },
  });

const numbered = (index, text) =>
  new Paragraph({
    children: [new TextRun({ text: `${index + 1}. ${text || ''}`, size: 22 })],
    indent: { left: 360 },
    spacing: { after: 80 },
  });

const h1 = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 200 },
  });

const h2 = (text) =>
  new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });

// ── Table helpers ──────────────────────────────────────────────
const headerCell = (text, pct) =>
  new TableCell({
    width: pct ? { size: pct, type: WidthType.PERCENTAGE } : undefined,
    shading: { type: ShadingType.CLEAR, fill: DARK_BLUE },
    borders: TABLE_BORDER,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
      }),
    ],
  });

const dataCell = (text, pct) =>
  new TableCell({
    width: pct ? { size: pct, type: WidthType.PERCENTAGE } : undefined,
    borders: TABLE_BORDER,
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || '', size: 20 })],
      }),
    ],
  });

// ── Cover page ────────────────────────────────────────────────
const buildCoverPage = (companyInfo, lead, preparedFor, preparedBy) => {
  const rows = [
    new Paragraph({ text: '', spacing: { before: 2200 } }),
    centered(companyInfo.name || 'Invennico TechnoLabs', { size: 56, bold: true, color: DARK_BLUE }, 160),
  ];

  if (companyInfo.tagline) {
    rows.push(centered(companyInfo.tagline, { size: 24, italics: true, color: GREY }, 160));
  }

  rows.push(
    new Paragraph({ text: '', spacing: { before: 600 } }),
    centered('SOFTWARE DEVELOPMENT SCOPE', { size: 36, bold: true, color: MID_BLUE }, 280),
    centered(lead.title, { size: 30, bold: true }, 280),
    centered(
      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      { size: 22, color: GREY },
      200
    ),
    new Paragraph({ text: '', spacing: { before: 400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'Prepared For:  ', size: 22, bold: true }),
        new TextRun({ text: preparedFor || 'Client', size: 22 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'Prepared By:  ', size: 22, bold: true }),
        new TextRun({ text: preparedBy || companyInfo.name || 'Invennico TechnoLabs', size: 22 }),
      ],
    })
  );

  if (companyInfo.website) {
    rows.push(centered(companyInfo.website, { size: 20, color: GREY }, 120));
  }

  return rows;
};

// ── Individual section builders (num = display number, e.g. 1, 2, 3…) ────────

const buildClientBusinessDetails = (d = {}, num) => [
  h1(`${num}. Client Business Details`),
  h2('Business Overview'),
  para(d.businessOverview),
  h2('What the Client Does'),
  para(d.whatClientDoes),
  h2('Industry / Domain'),
  para(d.industryContext),
  h2('Business Objectives'),
  para(d.businessObjectives),
];

const buildAboutInvennico = (text, num) => [h1(`${num}. About Invennico TechnoLabs`), para(text)];

const buildExecutiveSummary = (d = {}, num) => [
  h1(`${num}. Executive Summary`),
  h2("Understanding of the Client's Vision"),
  para(d.visionUnderstanding),
  h2('Proposed Solution Summary'),
  para(d.proposedSolution),
  h2('Key Business Outcomes'),
  para(d.keyOutcomes),
  h2('Why This Approach'),
  para(d.whyThisApproach),
];

const buildProposedSolution = (d = {}, num) => [
  h1(`${num}. Proposed Solution`),
  para(d.overview),
  ...(d.components || []).map(bullet),
];

const buildScopeOfWork = (modules = [], num) => [
  h1(`${num}. Scope of Work`),
  ...modules.flatMap((mod) => [h2(`${mod.number || ''} ${mod.name || ''}`), para(mod.details)]),
];

const buildDeliverables = (items = [], num) => [h1(`${num}. Deliverables`), ...items.map(bullet)];

const buildTechnicalArchitecture = (d = {}, num) => [
  h1(`${num}. Technical Architecture (High-Level)`),
  h2('Frontend'),
  para(d.frontend),
  h2('Backend'),
  para(d.backend),
  h2('Database'),
  para(d.database),
  h2('Hosting'),
  para(d.hosting),
  h2('Integrations'),
  para(d.integrations),
  h2('Security'),
  para(d.security),
];

const buildWhyChooseUs = (items = [], num) => [h1(`${num}. Why Choose Us?`), ...items.map(bullet)];

const buildAssumptions = (items = [], num) => [h1(`${num}. Assumptions`), ...items.map(bullet)];

const buildOutOfScope = (items = [], num) => [h1(`${num}. Out of Scope`), ...items.map(bullet)];

const buildMilestones = (milestones = [], num) => {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('Phase', 15),
          headerCell('Milestone', 25),
          headerCell('Activities', 45),
          headerCell('Duration', 15),
        ],
      }),
      ...milestones.map(
        (m) =>
          new TableRow({
            children: [
              dataCell(m.phase, 15),
              dataCell(m.milestone, 25),
              dataCell(m.activities, 45),
              dataCell(m.duration, 15),
            ],
          })
      ),
    ],
  });
  return [h1(`${num}. Project Milestones & Timelines`), table, spacer()];
};

const buildClientQuestions = (questions = [], num) => [
  h1(`${num}. Questions for Client`),
  ...questions.map((q, i) => numbered(i, q)),
];

const buildPostLaunchSupport = (d = {}, num) => [
  h1(`${num}. Post-Launch Support`),
  h2('Included Support'),
  ...(d.includedSupport || []).map(bullet),
  h2('Warranty Period'),
  para(d.warrantyPeriod || '30 days'),
  h2('Optional Retainer'),
  ...(d.optionalRetainer || []).map(bullet),
];

// ── Dispatch map — key matches settings.proposalSections[].key ────────────────
const SECTION_BUILDERS = {
  clientBusinessDetails: (c, num) => buildClientBusinessDetails(c.clientBusinessDetails, num),
  aboutInvennico: (c, num) => buildAboutInvennico(c.aboutInvennico, num),
  executiveSummary: (c, num) => buildExecutiveSummary(c.executiveSummary, num),
  proposedSolution: (c, num) => buildProposedSolution(c.proposedSolution, num),
  scopeOfWork: (c, num) => buildScopeOfWork(c.scopeOfWork, num),
  deliverables: (c, num) => buildDeliverables(c.deliverables, num),
  technicalArchitecture: (c, num) => buildTechnicalArchitecture(c.technicalArchitecture, num),
  whyChooseUs: (c, num) => buildWhyChooseUs(c.whyChooseUs, num),
  assumptions: (c, num) => buildAssumptions(c.assumptions, num),
  outOfScope: (c, num) => buildOutOfScope(c.outOfScope, num),
  milestones: (c, num) => buildMilestones(c.milestones, num),
  clientQuestions: (c, num) => buildClientQuestions(c.clientQuestions, num),
  postLaunchSupport: (c, num) => buildPostLaunchSupport(c.postLaunchSupport, num),
};

// ── Main export ───────────────────────────────────────────────
/**
 * Builds a .docx buffer from AI-generated content.
 * enabledSections: array of { key, enabled, order } already filtered+sorted by the caller.
 * Section numbers are assigned sequentially (1, 2, 3…) based on their position in enabledSections.
 */
const buildProposalDocx = async ({ lead, aiContent, companyInfo, preparedFor, preparedBy, enabledSections }) => {
  const c = aiContent || {};
  const children = [];

  // Cover page is optional — included only when its section is enabled
  const coverEnabled = enabledSections.some((s) => s.key === 'coverPage');
  if (coverEnabled) {
    children.push(...buildCoverPage(companyInfo, lead, preparedFor, preparedBy));
  }

  // Numbered sections — skip coverPage (handled above), assign sequential numbers
  let sectionNum = 0;
  enabledSections.forEach((section) => {
    if (section.key === 'coverPage') return;
    const builder = SECTION_BUILDERS[section.key];
    if (builder) {
      sectionNum += 1;
      children.push(...builder(c, sectionNum));
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
};

module.exports = { buildProposalDocx };
