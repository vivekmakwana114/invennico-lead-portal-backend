const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../config/logger');
const { Settings } = require('../models');

// Full prompt sent to Claude for lead analysis. Customisable via Settings → AI Prompts.
// Only the INPUT block (title, details, notes…) is appended at runtime.
const DEFAULT_LEAD_ANALYSIS_PROMPT = `You are a senior pre-sales consultant at Invennico TechnoLabs, a digital product development company.

Company context:
- Digital tech studio building web, mobile, SaaS, AI, and enterprise systems
- Strong in MERN, Next.js, React Native, Flutter, Node.js, PostgreSQL, AWS
- Clients range from startups to enterprise
- Focus on scalable, practical, production-ready solutions

Analyze the following lead and return ONLY a valid JSON object. No markdown, no explanation, no code fences.

OUTPUT (strict JSON only):
{
  "lead_summary": "Concise explanation of what the client wants",
  "qualification": {
    "score": 75,
    "label": "High Potential / Medium / Low",
    "reasoning": "Why this lead is good or risky"
  },
  "recommended_tech_stack": {
    "frontend": [],
    "backend": [],
    "database": [],
    "integrations": [],
    "hosting": []
  },
  "estimation": {
    "timeline": "Duration only, e.g. 4-6 months",
    "budget_range": "USD range e.g. $40,000 - $60,000",
    "breakdown": [
      { "phase": "Phase name", "timeline": "Duration", "cost_range": "USD range" }
    ]
  },
  "recommended_next_action": "What should we do next",
  "suggested_questions": ["Question 1", "Question 2"]
}

RULES:
- Be practical, not theoretical
- Do NOT oversell
- Keep estimates realistic based on industry standards
- Think like a CTO + sales strategist
- Tech stack names must be SHORT and CLEAN — single standard identifiers only (e.g. "React", "Node.js", "PostgreSQL", "AWS", "TypeScript", "Flutter"). No descriptions, no parenthetical notes, no version numbers, no "with X" or "for X" suffixes
- Return ONLY the JSON object`;

// Full prompt for proposal generation. Customisable via Settings → AI Prompts.
// Only INPUT DATA and SECTIONS TO GENERATE are appended at runtime.
const DEFAULT_PROPOSAL_FULL_PROMPT = `You are a senior pre-sales consultant at Invennico TechnoLabs, a digital product development company.

Generate a professional software development proposal based on the input data below. Return ONLY a valid JSON object — no markdown, no code fences, no extra text.

Generate exactly this JSON structure. Draw all facts from INPUT DATA — do not invent business details or numbers.

{
  "clientBusinessDetails": {
    "businessOverview": "2 sentences about the client's business",
    "whatClientDoes": "1 sentence on their core product or service",
    "industryContext": "1 sentence on the industry and domain",
    "businessObjectives": "2 sentences on their goals for this project"
  },
  "aboutInvennico": "3 sentences introducing Invennico TechnoLabs — highlight strengths in web, mobile, SaaS, AI, and enterprise delivery",
  "executiveSummary": {
    "visionUnderstanding": "2 sentences on what the client wants to achieve",
    "proposedSolution": "2 sentences on the solution being proposed",
    "keyOutcomes": "2 sentences on measurable business outcomes",
    "whyThisApproach": "2 sentences justifying the technical and delivery approach"
  },
  "proposedSolution": {
    "overview": "2 sentences on system architecture and purpose",
    "components": ["Component 1", "Component 2", "Component 3", "Component 4"]
  },
  "scopeOfWork": [
    {
      "number": "2.1",
      "name": "Module Name",
      "description": "1 sentence module introduction",
      "scopeIncludes": [
        { "groupTitle": "Group Name", "items": ["Feature 1", "Feature 2", "Feature 3"] }
      ],
      "objective": "1 sentence objective"
    }
  ],
  "deliverables": [
    { "groupTitle": "Group Name", "items": ["Item 1", "Item 2", "Item 3"] }
  ],
  "technicalArchitecture": [
    { "groupTitle": "Layer Name", "items": ["Tech 1", "Tech 2", "Tech 3"] }
  ],
  "whyChooseUs": [
    {
      "title": "Strength title",
      "description": "1 sentence explanation (omit or empty string if using items only)",
      "items": ["Bullet point 1", "Bullet point 2", "Bullet point 3"]
    }
  ],
  "assumptions": [
    { "groupTitle": "Category Name", "items": ["Assumption 1", "Assumption 2", "Assumption 3"] }
  ],
  "outOfScope": [
    { "groupTitle": "Category Name", "items": ["Item 1", "Item 2", "Item 3"] }
  ],
  "milestones": [
    { "phase": "Phase name", "milestone": "Milestone name", "activities": ["Activity 1", "Activity 2", "Activity 3"], "duration": "X weeks" }
  ],
  "postLaunchSupport": {
    "intro": "1 sentence on post-launch support purpose",
    "includedSupport": ["Item 1", "Item 2", "Item 3", "Item 4"],
    "warrantyDescription": "2 sentences on warranty period and what it covers",
    "retainerIntro": "1 sentence introducing optional ongoing support",
    "optionalRetainer": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"],
    "retainerClosing": "1 sentence on SLA and commercials agreed separately"
  }
}

RULES:
- scopeOfWork: 5-7 modules; max 2 groups per module; max 4 items per group; 1 sentence each for description and objective
- deliverables: 4-5 groups; max 5 items per group; items are short phrases not sentences
- technicalArchitecture: 5 groups (Frontend, Backend, Database, Hosting, Security); max 4 short tech names per group
- whyChooseUs: exactly 5 items; each has title + description or items (or both); max 3 bullet items per point
- assumptions: 2-3 groups; max 4 items per group
- outOfScope: 2-3 groups; max 4 items per group; total at least 5 items
- milestones: 4-5 phases; max 4 activities per phase; activities are short phrases not sentences
- proposedSolution.components: max 5 items
- Professional tone, no emojis, no markdown inside string values
- Return ONLY the JSON object`;

const DEFAULT_WHATSAPP_FIRST_PROMPT = `You are a pre-sales consultant writing a WhatsApp message to a potential client.

Write a professional, confident, and concise WhatsApp reply.

Tone:
- Friendly but professional
- Clear and structured
- Not too long
- No fluff

Write a message that:
- Acknowledges the requirement
- Shows understanding
- Positions capability
- Mentions rough timeline and cost (if appropriate)
- Asks 3-5 smart questions
- Suggests a call

Do NOT include emojis unless natural.
Do NOT make it too long.
Do NOT sound robotic.`;

const DEFAULT_WHATSAPP_REGEN_PROMPT = `Please revise the WhatsApp message based on the following update. Keep the same tone and structure. Return only the revised WhatsApp message — no explanation, no preamble.`;

const getClient = () => new Anthropic({ apiKey: config.anthropic.apiKey });

const analyzeLead = async ({ title, details, source, notes, attachments, pdfContent }) => {
  // Log preview only — pdfContent capped at 500 chars here for readability.
  // The actual prompt sent to Claude below contains the FULL pdfContent.
  logger.debug(
    '[AI Analyze] Lead input preview (pdfContent capped at 500 chars for log):\n%s',
    JSON.stringify(
      {
        title: title || 'N/A',
        source: source || 'N/A',
        details: details || 'N/A',
        notes: notes || 'None',
        attachments: attachments || 'None',
        pdfContent: pdfContent
          ? `${pdfContent.slice(0, 500)}${pdfContent.length > 500 ? '… [truncated for log]' : ''}`
          : 'None',
      },
      null,
      2
    )
  );

  const settings = await Settings.findById('global').lean();
  const customLeadAnalysis = settings?.aiPrompts?.leadAnalysis?.trim();
  const fullLeadAnalysisPrompt = customLeadAnalysis || DEFAULT_LEAD_ANALYSIS_PROMPT;
  logger.info('[Lead Analysis] Prompt source: %s', customLeadAnalysis ? 'SETTING (custom)' : 'DEFAULT (code level)');

  const prompt = `${fullLeadAnalysisPrompt}

INPUT:
Title: ${title || 'N/A'}
Source: ${source || 'N/A'}
Description: ${details || 'N/A'}
Internal Notes: ${notes || 'None'}
Attachments: ${attachments || 'None'}
PDF/Document Content: ${pdfContent ? `\n${pdfContent}` : 'None'}`;

  const client = getClient();

  logger.debug('[AI Analyze] Calling Claude — model: claude-haiku-4-5, max_tokens: 4096');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  logger.debug('[AI Analyze] Raw response (%d chars):\n%s', rawText.length, rawText);

  // Strip markdown code fences if model adds them despite instructions
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(jsonText);

  logger.debug('[AI Analyze] Parsed keys: %s', Object.keys(parsed).join(', '));

  return parsed;
};

const generateWhatsapp = async ({
  leadSummary,
  techStack,
  timeline,
  budget,
  originalLead,
  previousDraft,
  followUpNotes,
}) => {
  const isRegen = !!(previousDraft && followUpNotes);

  const inputPayload = isRegen
    ? { mode: 'regenerate', previousDraftLength: previousDraft.length, followUpNotes }
    : {
        leadSummary: leadSummary || 'N/A',
        techStack: techStack || 'N/A',
        timeline: timeline || 'N/A',
        budget: budget || 'N/A',
        originalLeadDescription: originalLead || 'N/A',
      };

  logger.debug('[AI WhatsApp] Input payload sent to Claude:\n%s', JSON.stringify(inputPayload, null, 2));

  const settings = await Settings.findById('global').lean();

  const customFirst = settings?.aiPrompts?.whatsappFirst?.trim();
  const firstInstructions = customFirst || DEFAULT_WHATSAPP_FIRST_PROMPT;
  logger.info('[WhatsApp First] Prompt source: %s', customFirst ? 'SETTING (custom)' : 'DEFAULT (code level)');

  const firstUserPrompt = `${firstInstructions}

INPUT:

Lead Summary:
${leadSummary || 'N/A'}

Tech Stack:
${techStack || 'N/A'}

Timeline:
${timeline || 'N/A'}

Budget:
${budget || 'N/A'}

Original Lead Description:
${originalLead || 'N/A'}`;

  const client = getClient();

  let messages;

  if (isRegen) {
    const customRegen = settings?.aiPrompts?.whatsappRegen?.trim();
    const regenInstruction = customRegen || DEFAULT_WHATSAPP_REGEN_PROMPT;
    logger.info('[WhatsApp Regen] Prompt source: %s', customRegen ? 'SETTING (custom)' : 'DEFAULT (code level)');
    // Chat-style refinement: previous draft is the assistant turn, follow-up is the next user turn
    messages = [
      { role: 'user', content: firstUserPrompt },
      { role: 'assistant', content: previousDraft },
      { role: 'user', content: `${regenInstruction}\n\n${followUpNotes}` },
    ];
    logger.debug('[AI WhatsApp] Mode: regenerate — 3-turn chat');
  } else {
    messages = [{ role: 'user', content: firstUserPrompt }];
    logger.debug('[AI WhatsApp] Mode: first generation');
  }

  logger.debug('[AI WhatsApp] Calling Claude — model: claude-haiku-4-5, max_tokens: 1024');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages,
  });

  const message = response.content[0].type === 'text' ? response.content[0].text : '';

  logger.debug('[AI WhatsApp] Raw response (%d chars):\n%s', message.length, message);

  return { message };
};

const generateProposalContent = async ({
  lead,
  companyInfo,
  preparedFor,
  preparedBy,
  scopeDocumentContent,
  scopeDoc,
  enabledSectionKeys,
}) => {
  const techStack = lead.analysis?.techStack || {};

  const inputPayload = {
    company: {
      name: companyInfo.name || 'Invennico TechnoLabs',
      tagline: companyInfo.tagline || null,
      website: companyInfo.website || null,
      email: companyInfo.email || null,
    },
    proposal: {
      preparedFor: preparedFor || lead.clientContact || 'Client',
      preparedBy: preparedBy || companyInfo.name || 'Invennico TechnoLabs',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    },
    lead: {
      title: lead.title,
      details: lead.details,
      source: lead.source,
      notes: lead.notes || null,
      clientContact: lead.clientContact || null,
    },
    aiAnalysis: {
      summary: lead.analysis?.summary || null,
      techStack: {
        frontend: techStack.frontend || [],
        backend: techStack.backend || [],
        database: techStack.database || [],
        integrations: techStack.integrations || [],
        hosting: techStack.hosting || [],
      },
    },
    estimation: {
      timeline: lead.estimation?.timeline || null,
      budgetRange: lead.estimation?.budgetRange || null,
      milestones: (lead.estimation?.milestones || []).map((m) => ({
        phase: m.phase,
        duration: m.duration,
        costRange: m.costRange,
      })),
    },
    scopeDocumentTemplate: scopeDocumentContent || null,
    additionalContext: scopeDoc || null,
  };

  logger.debug('[AI Proposal] Input payload:\n%s', JSON.stringify(inputPayload, null, 2));

  // clientQuestions is intentionally excluded — the template carries a static placeholder for the client to fill in.
  const sectionsToGenerate = (enabledSectionKeys || []).filter((k) => k !== 'clientQuestions');

  const proposalSettings = await Settings.findById('global').lean();
  const customProposal = proposalSettings?.aiPrompts?.proposal?.trim();
  const proposalMainPrompt = customProposal || DEFAULT_PROPOSAL_FULL_PROMPT;
  logger.info('[Proposal] Prompt source: %s', customProposal ? 'SETTING (custom)' : 'DEFAULT (code level)');

  const prompt = `${proposalMainPrompt}

INPUT DATA:
${JSON.stringify(inputPayload, null, 2)}

SECTIONS TO GENERATE: ${sectionsToGenerate.join(', ')}
Omit any key NOT in the list above.`;

  const client = getClient();

  logger.debug('[AI Proposal] Calling Claude — model: claude-haiku-4-5, max_tokens: 8192');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  logger.debug('[AI Proposal] Raw response (%d chars):\n%s', rawText.length, rawText);

  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(jsonText);

  logger.debug('[AI Proposal] Parsed sections: %s', Object.keys(parsed).join(', '));

  return parsed;
};

module.exports = { analyzeLead, generateWhatsapp, generateProposalContent };
