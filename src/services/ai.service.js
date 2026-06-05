const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../config/logger');

const getClient = () => new Anthropic({ apiKey: config.anthropic.apiKey });

const analyzeLead = async ({ title, details, source, notes, attachments, pdfContent }) => {
  const inputPayload = {
    title: title || 'N/A',
    source: source || 'N/A',
    details: details || 'N/A',
    notes: notes || 'None',
    attachments: attachments || 'None',
    pdfContent: pdfContent ? `${pdfContent.slice(0, 500)}${pdfContent.length > 500 ? '… [truncated]' : ''}` : 'None',
  };

  logger.debug('[AI Analyze] Input payload sent to Claude:\n%s', JSON.stringify(inputPayload, null, 2));

  const prompt = `You are a senior pre-sales consultant at Invennico TechnoLabs, a digital product development company.

Company context:
- Digital tech studio building web, mobile, SaaS, AI, and enterprise systems
- Strong in MERN, Next.js, React Native, Flutter, Node.js, PostgreSQL, AWS
- Clients range from startups to enterprise
- Focus on scalable, practical, production-ready solutions

Analyze the following lead and return ONLY a valid JSON object. No markdown, no explanation, no code fences.

INPUT:
Title: ${title || 'N/A'}
Source: ${source || 'N/A'}
Description: ${details || 'N/A'}
Internal Notes: ${notes || 'None'}
Attachments: ${attachments || 'None'}
PDF/Document Content: ${pdfContent ? `\n${pdfContent}` : 'None'}

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
- Return ONLY the JSON object`;

  const client = getClient();

  logger.debug('[AI Analyze] Calling Claude — model: claude-haiku-4-5-20251001, max_tokens: 4096');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
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

const generateWhatsapp = async ({ leadSummary, techStack, timeline, budget, originalLead }) => {
  const inputPayload = {
    leadSummary: leadSummary || 'N/A',
    techStack: techStack || 'N/A',
    timeline: timeline || 'N/A',
    budget: budget || 'N/A',
    originalLead: originalLead || 'N/A',
  };

  logger.debug('[AI WhatsApp] Input payload sent to Claude:\n%s', JSON.stringify(inputPayload, null, 2));

  const prompt = `You are a pre-sales consultant writing a WhatsApp message to a potential client.

Write a professional, confident, and concise WhatsApp reply.

Tone:
- Friendly but professional
- Clear and structured
- Not too long
- No fluff

INPUT:

Lead Summary:
${leadSummary || 'N/A'}

Tech Stack:
${techStack || 'N/A'}

Timeline:
${timeline || 'N/A'}

Budget:
${budget || 'N/A'}

Additional Context:
${originalLead || 'N/A'}

---

OUTPUT:

Write a WhatsApp message that:
- Acknowledges the requirement
- Shows understanding
- Positions capability
- Mentions rough timeline and cost (if appropriate)
- Asks 3-5 smart questions
- Suggests a call

Do NOT include emojis unless natural.
Do NOT make it too long.
Do NOT sound robotic.`;

  const client = getClient();

  logger.debug('[AI WhatsApp] Calling Claude — model: claude-haiku-4-5-20251001, max_tokens: 1024');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
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
      qualificationScore: lead.analysis?.qualification?.score ?? null,
      qualificationLabel: lead.analysis?.qualification?.label || null,
      qualificationReasoning: lead.analysis?.qualification?.description || null,
      recommendedNextAction: lead.analysis?.qualification?.nextAction || null,
      techStack: {
        frontend: techStack.frontend || [],
        backend: techStack.backend || [],
        database: techStack.database || [],
        integrations: techStack.integrations || [],
        hosting: techStack.hosting || [],
      },
      suggestedQuestions: lead.analysis?.suggestedQuestions || [],
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
    enabledSections: enabledSectionKeys || [],
    scopeDocumentTemplate: scopeDocumentContent || null,
    additionalContext: scopeDoc || null,
  };

  logger.debug('[AI Proposal] Input payload sent to Claude:\n%s', JSON.stringify(inputPayload, null, 2));

  const companyName = companyInfo.name || 'Invennico TechnoLabs';

  const prompt = `You are a senior pre-sales consultant at ${companyName}, a digital product development company.

Generate a complete, professional software development scope proposal based on the input data below. Return ONLY a valid JSON object — no markdown, no code fences, no extra text.

INPUT DATA:
${JSON.stringify(inputPayload, null, 2)}

Generate exactly this JSON structure. All keys are required. Draw all facts from INPUT DATA — do not invent business details or numbers.

{
  "clientBusinessDetails": {
    "businessOverview": "2-3 sentence paragraph about the client's business based on lead details",
    "whatClientDoes": "1-2 sentences on their core product or service",
    "industryContext": "1-2 sentences on the industry and domain",
    "businessObjectives": "2-3 sentences on their goals for this project"
  },
  "aboutInvennico": "3-4 sentence standard company introduction for ${companyName} — highlight strengths in web, mobile, SaaS, AI, and enterprise delivery",
  "executiveSummary": {
    "visionUnderstanding": "2-3 sentences summarising what the client wants to achieve",
    "proposedSolution": "2-3 sentences describing the solution we are proposing",
    "keyOutcomes": "2-3 sentences on the measurable business outcomes",
    "whyThisApproach": "2-3 sentences justifying the technical and delivery approach"
  },
  "proposedSolution": {
    "overview": "2-3 sentence high-level description of the system architecture and its purpose",
    "components": ["Component 1", "Component 2", "Component 3"]
  },
  "scopeOfWork": [
    { "number": "5.1", "name": "Module Name", "details": "3-5 sentences of detailed functional requirements for this module" }
  ],
  "deliverables": ["Deliverable 1", "Deliverable 2", "Deliverable 3"],
  "technicalArchitecture": {
    "frontend": "1-2 sentences on frontend technology choices and rationale",
    "backend": "1-2 sentences on backend technology choices and rationale",
    "database": "1-2 sentences on database choices and rationale",
    "hosting": "1-2 sentences on hosting and infrastructure",
    "integrations": "1-2 sentences on third-party integrations planned",
    "security": "1-2 sentences on security approach and practices"
  },
  "whyChooseUs": [
    "Strength 1: explanation tailored to this project",
    "Strength 2: explanation tailored to this project",
    "Strength 3: explanation tailored to this project",
    "Strength 4: explanation tailored to this project",
    "Strength 5: explanation tailored to this project"
  ],
  "assumptions": [
    "Assumption 1",
    "Assumption 2",
    "Assumption 3",
    "Assumption 4",
    "Assumption 5"
  ],
  "outOfScope": [
    "Out of scope item 1",
    "Out of scope item 2",
    "Out of scope item 3",
    "Out of scope item 4",
    "Out of scope item 5"
  ],
  "milestones": [
    { "phase": "Phase name", "milestone": "Milestone name", "activities": "Key activities description", "duration": "X weeks" }
  ],
  "clientQuestions": [
    "Question 1?",
    "Question 2?",
    "Question 3?",
    "Question 4?",
    "Question 5?"
  ],
  "postLaunchSupport": {
    "includedSupport": ["Support item 1", "Support item 2", "Support item 3"],
    "warrantyPeriod": "30 days",
    "optionalRetainer": ["Retainer item 1", "Retainer item 2", "Retainer item 3", "Retainer item 4"]
  }
}

SECTIONS TO GENERATE (in this exact order): ${(enabledSectionKeys || []).join(', ')}
Only include keys listed above. Omit any key NOT in this list from the output JSON.

RULES:
- scopeOfWork: generate 6-12 modules appropriate for this project type
- milestones: use estimation data if provided; otherwise generate 4-6 realistic phases with Phase, Milestone, Activities, Duration columns
- clientQuestions: 5-10 smart questions to reduce implementation risk
- whyChooseUs: 5 strong points tailored to this specific project type
- outOfScope: at least 5 items not explicitly included in the lead details
- Professional tone, no emojis, no markdown syntax inside string values
- Return ONLY the JSON object`;

  const client = getClient();

  logger.debug('[AI Proposal] Calling Claude — model: claude-haiku-4-5-20251001, max_tokens: 8192');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
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
